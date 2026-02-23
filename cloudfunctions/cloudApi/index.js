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
    if (typeof groupId !== 'string') throw new Error('groupId must be a string')
    
    // 查询群组信息
    let groupRes;
    try {
      groupRes = await db.collection('groups').doc(groupId).get()
    } catch (e) {
      groupRes = null
    }
    
    // 如果群组不存在，尝试自动创建（兼容旧数据或新群组）
    if (!groupRes || !groupRes.data) {
       try {
         await db.collection('groups').add({
           data: {
             _id: groupId,
             members: [OPENID],
             createTime: db.serverDate(),
             creator: OPENID
           }
         })
         return true
       } catch (err) {
         // 如果添加失败（可能因为并发），再试一次查询
         try {
           groupRes = await db.collection('groups').doc(groupId).get()
           if (groupRes && groupRes.data && groupRes.data.members.includes(OPENID)) {
             return true
           }
         } catch (e2) {
           throw new Error('Permission denied: Cannot create or access group')
         }
       }
    }

    // 检查当前用户是否在成员列表中
    if (!groupRes.data.members || !groupRes.data.members.includes(OPENID)) {
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
        if (!groupId || !name) throw new Error('groupId and name are required')
        
        await checkGroupPermission(groupId)
        
        const res = await db.collection('groups').doc(groupId).update({
          data: { 
            name: name.trim(), 
            updateTime: db.serverDate() 
          }
        })
        return { success: true, res }
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
         
         const allRes = await db.collection('transactions').where({ groupId }).limit(1000).get()
         const monthRes = await db.collection('transactions').where({ 
           groupId,
           date: db.RegExp({ regexp: '^' + month })
         }).limit(1000).get()

         const aggregate = (list) => {
           const stats = {}
           list.forEach(item => {
             const type = item.type || 'expense'
             const amount = parseFloat(item.amount) || 0
             stats[type] = (stats[type] || 0) + amount
           })
           return Object.keys(stats).map(k => ({ _id: k, total: stats[k] }))
         }
           
         return { total: aggregate(allRes.data), month: aggregate(monthRes.data) }
      }
      
      case 'getDetailedStats': {
         const { groupId, month, type } = data
         await checkGroupPermission(groupId)
         
         // 增加数据获取上限，并确保排序
         const res = await db.collection('transactions').where({ 
           groupId, 
           type,
           date: db.RegExp({ regexp: '^' + month })
         }).orderBy('date', 'asc').limit(1000).get()

         const list = res.data
         const categoryMap = {}, dailyMap = {}, memberMap = {}

         list.forEach(item => {
           const amount = parseFloat(item.amount) || 0
           const cat = item.category || '其他'
           const date = item.date || ''
           const member = item.memberName || '未知'

           categoryMap[cat] = (categoryMap[cat] || 0) + amount
           if (date) dailyMap[date] = (dailyMap[date] || 0) + amount
           memberMap[member] = (memberMap[member] || 0) + amount
         })

         const toList = (map) => Object.keys(map).map(k => ({ _id: k, total: map[k] })).sort((a, b) => b.total - a.total)
         const dailyList = Object.keys(dailyMap).map(k => ({ _id: k, total: dailyMap[k] }))
           
         return { 
           categoryStats: toList(categoryMap), 
           dailyStats: dailyList, 
           memberStats: toList(memberMap) 
         }
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
        
        // 获取当前日期（云函数运行在 UTC，需要正确处理时区）
        const now = new Date();
        // 格式化为本地日期字符串 YYYY-MM-DD
        const formatDateStr = (date) => {
          const year = date.getFullYear();
          const month = (date.getMonth() + 1).toString().padStart(2, '0');
          const day = date.getDate().toString().padStart(2, '0');
          return `${year}-${month}-${day}`;
        };
        
        const todayStr = formatDateStr(now);
        
        const rules = await db.collection('recurring_rules')
          .where({
            groupId,
            isActive: true,
            lastGeneratedDate: _.lt(todayStr)
          }).get()
          
        let generatedCount = 0;
        
        for (const rule of rules.data) {
           let lastDate = new Date(rule.lastGeneratedDate + 'T00:00:00');
           let nextDate = new Date(lastDate);
           
           // 辅助函数：获取下一个日期
           const getNextDate = (current, period) => {
             const next = new Date(current);
             if (period === '每天') next.setDate(next.getDate() + 1);
             else if (period === '每周') next.setDate(next.getDate() + 7);
             else if (period === '每月') next.setMonth(next.getMonth() + 1);
             return next;
           };
           
           nextDate = getNextDate(lastDate, rule.period);
           
           while (formatDateStr(nextDate) <= todayStr) {
              const dateStr = formatDateStr(nextDate);
              
              await db.collection('transactions').add({
                data: {
                  groupId: rule.groupId,
                  type: rule.type,
                  amount: rule.amount,
                  category: rule.category,
                  categoryIcon: rule.categoryIcon,
                  date: dateStr,
                  memberName: rule.memberName,
                  note: rule.note,
                  createTime: db.serverDate(),
                  _openid: rule._openid || OPENID // 保持规则创建者或当前触发者
                }
              });
              
              await db.collection('recurring_rules').doc(rule._id).update({
                data: { lastGeneratedDate: dateStr }
              });
              
              generatedCount++;
              
              // 计算下一个日期
              nextDate = getNextDate(nextDate, rule.period);
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
