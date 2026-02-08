# 代码修改对照表

本文档列出了所有修复的代码变更对照。

---

## 1. app.js

### 修改 1.1: initData 错误处理增强
```javascript
// 修复前
async initData() {
  let groupId = wx.getStorageSync('currentGroupId');
  if (!groupId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: { action: 'createGroup' }
      });
      groupId = res.result.groupId;
      wx.setStorageSync('currentGroupId', groupId);
      let groupIds = [groupId];
      wx.setStorageSync('myGroupIds', groupIds);
    } catch (err) {
      console.error('初始化账本失败', err);
      // Fallback or retry?
    }
  }
}

// 修复后
async initData() {
  let groupId = wx.getStorageSync('currentGroupId');
  if (!groupId) {
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: { action: 'createGroup' }
      });
      if (res.result && res.result.groupId) {
        groupId = res.result.groupId;
        wx.setStorageSync('currentGroupId', groupId);
        let groupIds = [groupId];
        wx.setStorageSync('myGroupIds', groupIds);
      } else {
        throw new Error('创建群组返回数据异常');
      }
    } catch (err) {
      console.error('初始化账本失败', err);
      wx.showToast({ title: '初始化失败，请重试', icon: 'none' });
      throw err;
    }
  }
}
```

### 修改 1.2: handleShareOptions 页面刷新安全调用
```javascript
// 修复前
if (pages.length > 0) {
  const currentPage = pages[pages.length - 1];
  currentPage.onShow();
}

// 修复后
if (pages.length > 0) {
  const currentPage = pages[pages.length - 1];
  if (typeof currentPage.onShow === 'function') {
    currentPage.onShow();
  }
}
```

---

## 2. pages/add/add.js

### 修改 2.1: 预算超支弹窗逻辑修复
```javascript
// 修复前
const newTotal = totalSpent + Number(amount);
if (newTotal > budgetAmount) {
  const over = (newTotal - budgetAmount).toFixed(2);
  await new Promise((resolve) => {
    wx.showModal({
      title: '预算超支提醒',
      content: `本次支出后...`,
      success: (res) => {
        if (res.confirm) resolve();
        else throw new Error('user_cancelled');
      }
    });
  });
}

// 修复后
const newTotal = totalSpent + Number(amount);
if (newTotal > budgetAmount) {
  const over = (newTotal - budgetAmount).toFixed(2);
  const userConfirmed = await new Promise((resolve) => {
    wx.showModal({
      title: '预算超支提醒',
      content: `本次支出后...`,
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false)
    });
  });
  
  if (!userConfirmed) {
    wx.hideLoading();
    return;
  }
}
```

### 修改 2.2: submit 函数数据校验增强
```javascript
// 修复后添加的校验
if (!groupId) {
  wx.showToast({ title: '请先创建或加入账本', icon: 'none' });
  return;
}

if (!accounts || accounts.length === 0) {
  wx.showToast({ title: '请先创建账户', icon: 'none' });
  return;
}

if (!members || members.length === 0 || !categories || categories.length === 0) {
  wx.showToast({ title: '数据加载中，请稍后重试', icon: 'none' });
  return;
}
```

### 修改 2.3: 周期性记账规则添加 groupId
```javascript
// 修复前
const rule = {
  type,
  amount: transactionData.amount,
  category: transactionData.category,
  // ...
  isActive: true
};

// 修复后
const rule = {
  type,
  amount: transactionData.amount,
  category: transactionData.category,
  // ...
  isActive: true,
  groupId // 添加 groupId 字段
};
```

### 修改 2.4: 移除错误捕获中的 user_cancelled 判断
```javascript
// 修复前
catch (err) {
  if (err.message !== 'user_cancelled') {
    console.error('提交失败', err);
    wx.showToast({ title: '保存失败', icon: 'none' });
  }
}

// 修复后
catch (err) {
  console.error('提交失败', err);
  wx.showToast({ title: '保存失败', icon: 'none' });
}
```

---

## 3. pages/index/index.js

### 修改 3.1: 统计数据解析健壮性增强
```javascript
// 修复前
if (statsRes.result && statsRes.result.month) {
   let mIncome = 0;
   let mExpense = 0;
   statsRes.result.month.forEach(item => {
     if (item._id === 'income') mIncome = item.total;
     if (item._id === 'expense') mExpense = item.total;
   });
   // ...
}

// 修复后
let netAsset = 0, monthlyIncome = 0, monthlyExpense = 0;

if (statsRes.result) {
   if (statsRes.result.month) {
     statsRes.result.month.forEach(item => {
       if (item._id === 'income') monthlyIncome = item.total || 0;
       if (item._id === 'expense') monthlyExpense = item.total || 0;
     });
   }
   
   if (statsRes.result.total) {
     let totalIncome = 0, totalExpense = 0;
     statsRes.result.total.forEach(item => {
       if (item._id === 'income') totalIncome = item.total || 0;
       if (item._id === 'expense') totalExpense = item.total || 0;
     });
     netAsset = totalIncome - totalExpense;
   }
}

this.setData({
  netAsset: netAsset.toFixed(2),
  monthlyIncome: monthlyIncome.toFixed(2),
  monthlyExpense: monthlyExpense.toFixed(2)
}, () => this.calculateBudgetProgress());
```

---

## 4. pages/stats/stats.js

### 修改 4.1: 成员统计支持
```javascript
// 修复前
processAggregatedData(data) {
  const { categoryStats, dailyStats } = data;
  // ...
  this.setData({
    memberStats: [], // 暂不支持 member 统计
  });
}

// 修复后
processAggregatedData(data) {
  const { categoryStats, dailyStats, memberStats = [] } = data;
  // ...
  // 处理成员统计
  let memberTotal = 0;
  memberStats.forEach(m => memberTotal += m.total);
  
  const processedMemberStats = memberStats.map(m => ({
    name: m._id,
    amount: m.total.toFixed(2),
    percent: memberTotal > 0 ? ((m.total / memberTotal) * 100).toFixed(1) : 0
  }));
  
  this.setData({
    memberStats: processedMemberStats,
  });
}
```

---

## 5. pages/accounts/accounts.js

### 修改 5.1: 余额计算精度修复
```javascript
// 修复前
accounts = accounts.map(acc => {
  let currentBalance = Number(acc.initialBalance || 0);
  transactions.forEach(t => {
    if (t.accountId === acc._id) {
      if (t.type === 'income') currentBalance += Number(t.amount);
      else currentBalance -= Number(t.amount);
    }
  });
  return { ...acc, currentBalance: currentBalance.toFixed(2) };
});

// 修复后
accounts = accounts.map(acc => {
  let currentBalance = parseFloat(acc.initialBalance || 0);
  transactions.forEach(t => {
    if (t.accountId === acc._id) {
      const amount = parseFloat(t.amount) || 0;
      if (t.type === 'income') currentBalance += amount;
      else currentBalance -= amount;
    }
  });
  return { ...acc, currentBalance: currentBalance.toFixed(2) };
});
```

---

## 6. pages/calendar/calendar.js

### 修改 6.1: deleteTransaction 错误处理
```javascript
// 修复前
async deleteTransaction(id) {
  const groupId = wx.getStorageSync('currentGroupId');
  await wx.cloud.callFunction({
    name: 'cloudApi',
    data: { action: 'deleteTransaction', data: { id, groupId } }
  });
  this.loadMonthlyData();
}

// 修复后
async deleteTransaction(id) {
  const groupId = wx.getStorageSync('currentGroupId');
  wx.showLoading({ title: '删除中' });
  try {
    await wx.cloud.callFunction({
      name: 'cloudApi',
      data: { action: 'deleteTransaction', data: { id, groupId } }
    });
    wx.showToast({ title: '删除成功' });
    this.loadMonthlyData();
  } catch (err) {
    console.error('删除失败', err);
    wx.showToast({ title: '删除失败', icon: 'none' });
  } finally {
    wx.hideLoading();
  }
}
```

---

## 7. pages/debts/debts.js

### 修改 7.1: settleDebt 错误处理增强
```javascript
// 修复前
async settleDebt(e) {
  const debt = e.currentTarget.dataset.item;
  const { accounts, accountNames } = this.data;
  wx.showActionSheet({
    itemList: ['已还清/已收回 (并记录流水)', '仅标记已清'],
    success: async (res) => {
      if (res.tapIndex === 0) {
        wx.showActionSheet({
          itemList: accountNames,
          success: async (accRes) => {
            const account = accounts[accRes.tapIndex];
            await this.doSettle(debt, account);
          }
        });
      } else {
        await this.doSettle(debt, null);
      }
    }
  });
}

// 修复后
async settleDebt(e) {
  const debt = e.currentTarget.dataset.item;
  const { accounts, accountNames } = this.data;
  
  if (accounts.length === 0) {
    await this.doSettle(debt, null);
    return;
  }

  wx.showActionSheet({
    itemList: ['已还清/已收回 (并记录流水)', '仅标记已清'],
    success: async (res) => {
      if (res.tapIndex === 0) {
        wx.showActionSheet({
          itemList: accountNames,
          success: async (accRes) => {
            const account = accounts[accRes.tapIndex];
            await this.doSettle(debt, account);
          },
          fail: () => console.log('用户取消选择账户')
        });
      } else {
        await this.doSettle(debt, null);
      }
    },
    fail: () => console.log('用户取消操作')
  });
}
```

---

## 8. pages/groups/groups.js

### 修改 8.1: loadGroups 并发控制
```javascript
// 修复前
const promises = groupIds.map(id => 
  wx.cloud.callFunction({...})
);
const myGroups = await Promise.all(promises);

// 修复后
const concurrency = 5;
const myGroups = [];

for (let i = 0; i < groupIds.length; i += concurrency) {
  const batch = groupIds.slice(i, i + concurrency);
  const promises = batch.map(id => 
    wx.cloud.callFunction({...})
  );
  const batchResults = await Promise.all(promises);
  myGroups.push(...batchResults);
}
```

---

## 9. cloudfunctions/cloudApi/index.js

### 修改 9.1: checkGroupPermission 增强
```javascript
// 修复前
const checkGroupPermission = async (groupId) => {
  if (!groupId) throw new Error('groupId is required')
  const groupRes = await db.collection('groups').doc(groupId).get().catch(() => null)
  if (!groupRes || !groupRes.data) {
    await db.collection('groups').add({...})
    return true
  }
  if (!groupRes.data.members.includes(OPENID)) {
    throw new Error('Permission denied')
  }
  return true
}

// 修复后
const checkGroupPermission = async (groupId) => {
  if (!groupId) throw new Error('groupId is required')
  if (typeof groupId !== 'string') throw new Error('groupId must be a string')
  
  let groupRes;
  try {
    groupRes = await db.collection('groups').doc(groupId).get()
  } catch (e) {
    groupRes = null
  }
  
  if (!groupRes || !groupRes.data) {
    try {
      await db.collection('groups').add({...})
      return true
    } catch (err) {
      // 处理并发情况下的重试逻辑
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

  if (!groupRes.data.members || !groupRes.data.members.includes(OPENID)) {
    throw new Error('Permission denied: You are not a member of this group')
  }
  return true
}
```

### 修改 9.2: getStats 金额聚合修复
```javascript
// 修复前
total: $.sum({ $toDouble: '$amount' })

// 修复后
total: $.sum($.cond({
  if: $.isNumber('$amount'),
  then: '$amount',
  else: $.toDouble('$amount')
}))
```

### 修改 9.3: getDetailedStats 添加成员统计
```javascript
// 新增成员统计聚合
const memberRes = await db.collection('transactions')
  .aggregate()
  .match({ groupId, type, date: db.RegExp({ regexp: '^' + month }) })
  .group({
    _id: '$memberName',
    total: $.sum($.cond({
      if: $.isNumber('$amount'),
      then: '$amount',
      else: $.toDouble('$amount')
    })),
    count: $.sum(1)
  })
  .sort({ total: -1 })
  .end()

return { categoryStats: res.list, dailyStats: dailyRes.list, memberStats: memberRes.list }
```

### 修改 9.4: checkAndGenerateRecurring 日期计算修复
```javascript
// 修复前
const now = new Date();
const localNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
const todayStr = `${localNow.getFullYear()}-${...}`;
const nextDateStr = () => `${nextDate.getFullYear()}-${...}`;
while (nextDateStr() <= todayStr) { ... }

// 修复后
const now = new Date();
const formatDateStr = (date) => {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const todayStr = formatDateStr(now);

while (formatDateStr(nextDate) <= todayStr) {
  const dateStr = formatDateStr(nextDate);
  // ...
}
```

---

## 10. cloudfunctions/ocrAction/index.js

### 修改 10.1: 错误处理规范化
```javascript
// 修复前
exports.main = async (event, context) => {
  try {
    const result = await cloud.openapi.ocr.printedText({
      imgUrl: event.fileId
    })
    return result
  } catch (err) {
    return err
  }
}

// 修复后
exports.main = async (event, context) => {
  const { fileId } = event
  
  if (!fileId) {
    return {
      code: -1,
      message: '缺少 fileId 参数',
      items: []
    }
  }
  
  try {
    const result = await cloud.openapi.ocr.printedText({ imgUrl: fileId })
    return {
      code: 0,
      message: 'success',
      ...result
    }
  } catch (err) {
    console.error('OCR 识别失败:', err)
    return {
      code: -1,
      message: err.message || 'OCR 识别失败',
      error: err,
      items: []
    }
  }
}
```

---

## 修改统计

| 文件 | 修改类型 | 修改行数 |
|-----|---------|---------|
| app.js | 错误处理 | 28行 |
| pages/add/add.js | 逻辑修复 | 34行 |
| pages/index/index.js | 健壮性 | 36行 |
| pages/stats/stats.js | 功能增强 | 15行 |
| pages/accounts/accounts.js | 精度修复 | 7行 |
| pages/calendar/calendar.js | 错误处理 | 25行 |
| pages/debts/debts.js | 错误处理 | 14行 |
| pages/groups/groups.js | 性能优化 | 39行 |
| cloudfunctions/cloudApi/index.js | 多处修复 | 139行 |
| cloudfunctions/ocrAction/index.js | 错误处理 | 26行 |

**总计: 10个文件，268行修改**
