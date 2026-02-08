Page({
  data: {
    debts: [],
    showModal: false,
    type: 'lent', // lent (我借出), borrowed (我借入)
    personName: '',
    amount: '',
    note: '',
    accounts: [],
    accountNames: [],
    accountIndex: 0
  },

  onShow() {
    this.loadDebts();
    this.loadAccounts();
  },

  async loadAccounts() {
    const groupId = wx.getStorageSync('currentGroupId');
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getMetadata',
          data: { groupId }
        }
      });
      const accounts = res.result.accounts || [];
      this.setData({
        accounts,
        accountNames: accounts.map(a => `${a.icon} ${a.name}`)
      });
    } catch (err) {
      console.error('加载账户失败', err);
    }
  },

  async loadDebts() {
    const groupId = wx.getStorageSync('currentGroupId');
    wx.showLoading({ title: '加载中' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getDebts',
          data: { groupId }
        }
      });
      
      const pendingDebts = res.result.list.filter(d => d.status === 'pending');
      this.setData({ debts: pendingDebts });
    } catch (err) {
      console.error('加载债务失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  changeType(e) {
    this.setData({ type: e.currentTarget.dataset.type });
  },

  showAddModal() {
    this.setData({ showModal: true, personName: '', amount: '', note: '', accountIndex: 0 });
  },

  hideAddModal() {
    this.setData({ showModal: false });
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onAccountChange(e) {
    this.setData({ accountIndex: e.detail.value });
  },

  async addDebt() {
    const { type, personName, amount, note, accounts, accountIndex } = this.data;
    if (!personName || !amount) {
      wx.showToast({ title: '请输入姓名和金额', icon: 'none' });
      return;
    }

    const groupId = wx.getStorageSync('currentGroupId');
    wx.showLoading({ title: '保存中' });
    try {
      const debtData = {
        type,
        personName,
        amount: Number(amount).toFixed(2),
        note,
        status: 'pending'
      };

      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'addDebt',
          data: { groupId, debt: debtData }
        }
      });

      // 同时记录一笔交易
      if (accounts.length > 0) {
        const transType = type === 'lent' ? 'expense' : 'income'; // 借出算支出，借入算收入
        const category = type === 'lent' ? '借出资金' : '借入资金';
        const categoryIcon = type === 'lent' ? '📤' : '📥';
        
        await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'addTransaction',
            data: {
              groupId,
              transaction: {
                type: transType,
                amount: Number(amount).toFixed(2),
                category,
                categoryIcon,
                date: new Date().toISOString().split('T')[0],
                memberName: '本人',
                accountId: accounts[accountIndex]._id,
                accountName: accounts[accountIndex].name,
                note: `[债务记录] ${personName}: ${note}`
              }
            }
          }
        });
      }

      this.setData({ showModal: false });
      this.loadDebts();
      wx.showToast({ title: '记录成功' });
    } catch (err) {
      console.error('添加债务失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  async settleDebt(e) {
    const debt = e.currentTarget.dataset.item;
    const { accounts, accountNames } = this.data;

    wx.showActionSheet({
      itemList: ['已还清/已收回 (并记录流水)', '仅标记已清'],
      success: async (res) => {
        if (res.tapIndex === 0) {
          // 需要选择账户记录流水
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
  },

  async doSettle(debt, account) {
    wx.showLoading({ title: '处理中' });
    try {
      const groupId = wx.getStorageSync('currentGroupId');
      
      // 更新债务状态
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'updateDebt',
          data: {
             groupId,
             id: debt._id,
             debt: { status: 'repaid', settleTime: Date.now() } // 传入时间戳，云函数处理转换
          }
        }
      });

      if (account) {
        const transType = debt.type === 'lent' ? 'income' : 'expense'; // 收回借出算收入，归还借入算支出
        const category = debt.type === 'lent' ? '收回欠款' : '归还欠款';
        const categoryIcon = debt.type === 'lent' ? '📥' : '📤';

        await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'addTransaction',
            data: {
              groupId,
              transaction: {
                type: transType,
                amount: debt.amount,
                category,
                categoryIcon,
                date: new Date().toISOString().split('T')[0],
                memberName: '本人',
                accountId: account._id,
                accountName: account.name,
                note: `[债务结清] ${debt.personName}: ${debt.note}`
              }
            }
          }
        });
      }

      this.loadDebts();
      wx.showToast({ title: '处理成功' });
    } catch (err) {
      console.error('结算债务失败', err);
    } finally {
      wx.hideLoading();
    }
  }
})
