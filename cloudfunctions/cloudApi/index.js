const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command
const $ = db.command.aggregate

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  // 统一权限检查方法
  const checkGroupPermission = async (groupId) => {
    if (!groupId) throw new Error('groupId is required')
    
    // 查询群组信息
    const groupRes = await db.collection('groups').doc(groupId).get().catch(() => null)
    
    // 如果群组不存在，尝试自动创建（兼容旧数据或新群组）
    if (!groupRes || !groupRes.data) {
       await db.collection('groups').add({
         data: {
           _id: groupId,
           members: [OPENID],
           createTime: db.serverDate(),
           creator: OPENID
         }
       })
       return true
    }

    // 检查当前用户是否在成员列表中
    if (!groupRes.data.members.includes(OPENID)) {
      throw new Error('Permission denied: You are not a member of this group')
    }
    return true
  }

  try {
    switch (action) {
      case 'createGroup': {
        const { name } = data || {}
        const groupId = 'group_' + Math.random().toString(36).substr(2, 9);
        await db.collection('groups').add({
          data: {
            _id: groupId,
            name: name || '未命名账本',
            members: [OPENID],
            createTime: db.serverDate(),
            creator: OPENID
          }
        })
        return { groupId }
      }

      case 'joinGroup': {
        const { groupId } = data
        const groupRes = await db.collection('groups').doc(groupId).get()
        if (!groupRes.data) throw new Error('Group not found')
        
        if (!groupRes.data.members.includes(OPENID)) {
          await db.collection('groups').doc(groupId).update({
            data: {
              members: _.addToSet(OPENID)
            }
          })
        }
        return { success: true }
      }
      
      case 'getGroupInfo': {
        const { groupId } = data
        await checkGroupPermission(groupId)
        const res = await db.collection('groups').doc(groupId).get()
        return { data: res.data }
      }
      
      case 'updateGroupInfo': {
        const { groupId, name } = data
        await checkGroupPermission(groupId)
        // 建议增加权限控制，如只允许创建者修改，或任意成员修改
        // 这里暂时允许任意成员修改
        const res = await db.collection('groups').doc(groupId).update({
          data: { name, updateTime: db.serverDate() }
        })
        return res
      }

      // --- Transactions ---

      case 'getTransactions': {
        const { groupId, page = 1, limit = 100, filter } = data
        await checkGroupPermission(groupId)
        
        let query = db.collection('transactions').where({ groupId })
        
        if (filter) {
           if (filter.date) {
             if (filter.type === 'day') query = query.where({ date: filter.date })
             else query = query.where({ date: db.RegExp({ regexp: '^' + filter.date }) })
           }
           if (filter.keyword) {
             query = query.where(_.or([
               { category: db.RegExp({ regexp: filter.keyword, options: 'i' }) },
               { note: db.RegExp({ regexp: filter.keyword, options: 'i' }) }
             ]))
           }
        }
        
        const res = await query.orderBy('date', 'desc')
          .skip((page - 1) * limit)
          .limit(limit)
          .get()
          
        return { list: res.data }
      }

      case 'getTransaction': {
        const { id, groupId } = data
        await checkGroupPermission(groupId)
        const res = await db.collection('transactions').doc(id).get()
        return { data: res.data }
      }

      case 'addTransaction': {
        const { groupId, transaction } = data
        await checkGroupPermission(groupId)
        
        const res = await db.collection('transactions').add({
          data: {
            ...transaction,
            _openid: OPENID,
            groupId,
            createTime: db.serverDate()
          }
        })
        
        return res
      }

      case 'updateTransaction': {
        const { id, groupId, transaction } = data
        await checkGroupPermission(groupId)
        
        delete transaction._id
        delete transaction._openid
        
        const res = await db.collection('transactions').doc(id).update({
          data: {
            ...transaction,
            updateTime: db.serverDate()
          }
        })
        return res
      }

      case 'deleteTransaction': {
        const { id, groupId } = data
        await checkGroupPermission(groupId)
        
        const res = await db.collection('transactions').doc(id).remove()
        return res
      }
      
      // --- Budgets ---
      
      case 'getBudget': {
        const { groupId, month } = data
        await checkGroupPermission(groupId)
        
        const res = await db.collection('budgets').where({ groupId, month }).get()
        return { list: res.data }
      }
      
      case 'saveBudget': {
        const { groupId, budget } = data
        await checkGroupPermission(groupId)
        
        if (budget._id) {
           await db.collection('budgets').doc(budget._id).update({
             data: { amount: budget.amount, updateTime: db.serverDate() }
           })
        } else {
           await db.collection('budgets').add({
             data: {
               groupId,
               month: budget.month,
               amount: budget.amount,
               createTime: db.serverDate()
             }
           })
        }
        return { success: true }
      }
      
      // --- Stats ---
      
      case 'getStats': {
         const { groupId, month } = data
         await checkGroupPermission(groupId)
         
         const res = await db.collection('transactions')
           .aggregate()
           .match({ groupId })
           .group({
             _id: '$type',
             total: $.sum({ $toDouble: '$amount' }) // 确保amount是数字
           })
           .end()
           
         const monthRes = await db.collection('transactions')
           .aggregate()
           .match({ 
             groupId,
             date: db.RegExp({ regexp: '^' + month })
           })
           .group({
             _id: '$type',
             total: $.sum({ $toDouble: '$amount' })
           })
           .end()
           
         return { total: res.list, month: monthRes.list }
      }
      
      case 'getDetailedStats': {
         const { groupId, month, type } = data
         await checkGroupPermission(groupId)
         
         // 按分类统计
         const res = await db.collection('transactions')
           .aggregate()
           .match({ 
             groupId, 
             type, // 'expense' or 'income'
             date: db.RegExp({ regexp: '^' + month })
           })
           .group({
             _id: '$category',
             total: $.sum({ $toDouble: '$amount' }),
             count: $.sum(1)
           })
           .sort({ total: -1 })
           .end()
           
         // 按日期统计（用于图表）
         const dailyRes = await db.collection('transactions')
           .aggregate()
           .match({ 
             groupId, 
             type,
             date: db.RegExp({ regexp: '^' + month })
           })
           .group({
             _id: '$date',
             total: $.sum({ $toDouble: '$amount' })
           })
           .sort({ _id: 1 })
           .end()
           
         return { categoryStats: res.list, dailyStats: dailyRes.list }
      }

      // --- Metadata (Categories, Members, Accounts) ---

      case 'getMetadata': {
        const { groupId } = data
        await checkGroupPermission(groupId)
        
        let categories = await db.collection('categories').where({ groupId }).get()
        let members = await db.collection('members').where({ groupId }).get()
        let accounts = await db.collection('accounts').where({ groupId }).get()
        
        // 如果没有任何账户，初始化默认账户
        if (accounts.data.length === 0) {
          const defaultAcc = {
            name: '现金',
            initialBalance: 0,
            icon: '💵',
            groupId,
            createTime: db.serverDate()
          };
          const addRes = await db.collection('accounts').add({
            data: defaultAcc
          });
          defaultAcc._id = addRes._id;
          accounts.data = [defaultAcc];
        }

        // 如果没有任何分类，初始化默认分类
        if (categories.data.length === 0) {
          const defaultCats = {
            expense: [
              { name: '餐饮', icon: '🍚' },
              { name: '交通', icon: '🚗' },
              { name: '购物', icon: '🛒' },
              { name: '娱乐', icon: '🎮' },
              { name: '居住', icon: '🏠' },
              { name: '医疗', icon: '🏥' },
              { name: '教育', icon: '🎓' },
              { name: '其他', icon: '📦' }
            ],
            income: [
              { name: '工资', icon: '💰' },
              { name: '奖金', icon: '🧧' },
              { name: '投资', icon: '📈' },
              { name: '兼职', icon: '🕒' },
              { name: '其他', icon: '💵' }
            ],
            groupId,
            createTime: db.serverDate()
          };
          const addRes = await db.collection('categories').add({
            data: defaultCats
          });
          defaultCats._id = addRes._id;
          categories.data = [defaultCats];
        }

        // 如果没有任何成员，初始化默认成员
        if (members.data.length === 0) {
          const defaultMember = {
            name: '本人',
            groupId,
            createTime: db.serverDate()
          };
          const addRes = await db.collection('members').add({
            data: defaultMember
          });
          defaultMember._id = addRes._id;
          members.data = [defaultMember];
        }
        
        return {
          categories: categories.data,
          members: members.data,
          accounts: accounts.data
        }
      }
      
      case 'addCategory': {
         const { groupId, category } = data
         await checkGroupPermission(groupId)
         // 如果是更新整个分类结构（如 cashaccount 现在的逻辑）
         // 检查是否存在
         const exist = await db.collection('categories').where({ groupId }).get()
         if (exist.data.length > 0) {
           await db.collection('categories').doc(exist.data[0]._id).update({
             data: category // { expense: [], income: [] }
           })
         } else {
           await db.collection('categories').add({
             data: {
               ...category,
               groupId,
               createTime: db.serverDate()
             }
           })
         }
         return { success: true }
      }
      
      case 'addMember': {
         const { groupId, member } = data
         await checkGroupPermission(groupId)
         const res = await db.collection('members').add({
           data: { ...member, groupId, createTime: db.serverDate() }
         })
         return res
      }
      
      case 'deleteMember': {
         const { groupId, id } = data
         await checkGroupPermission(groupId)
         const res = await db.collection('members').doc(id).remove()
         return res
      }
      
      case 'addAccount': {
         const { groupId, account } = data
         await checkGroupPermission(groupId)
         const res = await db.collection('accounts').add({
           data: { ...account, groupId, createTime: db.serverDate() }
         })
         return res
      }
      
      case 'deleteAccount': {
         const { groupId, id } = data
         await checkGroupPermission(groupId)
         const res = await db.collection('accounts').doc(id).remove()
         return res
      }
      
      // --- Debts ---
      
      case 'getDebts': {
        const { groupId } = data
        await checkGroupPermission(groupId)
        const res = await db.collection('debts').where({ groupId }).orderBy('createTime', 'desc').get()
        return { list: res.data }
      }
      
      case 'addDebt': {
        const { groupId, debt } = data
        await checkGroupPermission(groupId)
        const res = await db.collection('debts').add({
          data: { ...debt, groupId, createTime: db.serverDate(), _openid: OPENID }
        })
        return res
      }
      
      case 'updateDebt': {
        const { groupId, id, debt } = data
        await checkGroupPermission(groupId)
        const res = await db.collection('debts').doc(id).update({
          data: { ...debt, updateTime: db.serverDate() }
        })
        return res
      }

      case 'deleteDebt': {
        const { groupId, id } = data
        await checkGroupPermission(groupId)
        const res = await db.collection('debts').doc(id).remove()
        return res
      }

      // --- Recurring Rules ---
      
      case 'getRecurringRules': {
         const { groupId } = data
         await checkGroupPermission(groupId)
         const res = await db.collection('recurring_rules').where({ groupId }).orderBy('createTime', 'desc').get()
         return { list: res.data }
      }
      
      case 'addRecurringRule': {
        const { groupId, rule } = data
        await checkGroupPermission(groupId)
        
        const res = await db.collection('recurring_rules').add({
          data: {
            ...rule,
            groupId,
            _openid: OPENID,
            createTime: db.serverDate()
          }
        })
        return res
      }
      
      case 'deleteRecurringRule': {
         const { groupId, id } = data
         await checkGroupPermission(groupId)
         const res = await db.collection('recurring_rules').doc(id).remove()
         return res
      }

      case 'checkAndGenerateRecurring': {
        const { groupId } = data
        await checkGroupPermission(groupId)
        
        const now = new Date();
        const localNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
        const todayStr = `${localNow.getFullYear()}-${(localNow.getMonth() + 1).toString().padStart(2, '0')}-${localNow.getDate().toString().padStart(2, '0')}`;
        
        const rules = await db.collection('recurring_rules')
          .where({
            groupId,
            isActive: true,
            lastGeneratedDate: _.lt(todayStr)
          }).get()
          
        let generatedCount = 0;
        
        for (const rule of rules.data) {
           let lastDate = new Date(rule.lastGeneratedDate);
           let nextDate = new Date(lastDate);
           
           if (rule.period === '每天') nextDate.setDate(lastDate.getDate() + 1);
           else if (rule.period === '每周') nextDate.setDate(lastDate.getDate() + 7);
           else if (rule.period === '每月') nextDate.setMonth(lastDate.getMonth() + 1);
           
           const nextDateStr = () => `${nextDate.getFullYear()}-${(nextDate.getMonth() + 1).toString().padStart(2, '0')}-${nextDate.getDate().toString().padStart(2, '0')}`;
           
           while (nextDateStr() <= todayStr) {
              await db.collection('transactions').add({
                data: {
                  groupId: rule.groupId,
                  type: rule.type,
                  amount: rule.amount,
                  category: rule.category,
                  categoryIcon: rule.categoryIcon,
                  date: nextDateStr(),
                  memberName: rule.memberName,
                  note: rule.note,
                  createTime: db.serverDate(),
                  _openid: rule._openid || OPENID // 保持规则创建者或当前触发者
                }
              });
              
              let currentGenerated = nextDateStr();
              
              if (rule.period === '每天') nextDate.setDate(nextDate.getDate() + 1);
              else if (rule.period === '每周') nextDate.setDate(nextDate.getDate() + 7);
              else if (rule.period === '每月') nextDate.setMonth(nextDate.getMonth() + 1);
              
              await db.collection('recurring_rules').doc(rule._id).update({
                data: { lastGeneratedDate: currentGenerated }
              });
              generatedCount++;
           }
        }
        return { generatedCount }
      }

      default:
        throw new Error('Unknown action')
    }
  } catch (err) {
    console.error(err)
    return { error: err.message }
  }
}
