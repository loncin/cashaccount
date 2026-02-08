Page({
  data: {
    accounts: [],
    showModal: false,
    newName: '',
    newBalance: '',
    newIcon: '💳',
    icons: ['💳', '💰', '📱', '🏦', '💵', '🏠'],
    iconIndex: 0
  },

  onShow() {
    this.loadAccounts();
  },

  async loadAccounts() {
    const groupId = wx.getStorageSync('currentGroupId');
    wx.showLoading({ title: '加载中' });
    try {
      // 获取元数据（包含账户）
      const metaRes = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getMetadata',
          data: { groupId }
        }
      });
      
      let accounts = metaRes.result.accounts || [];

      // 如果没有任何账户，初始化默认账户
      if (accounts.length === 0) {
        const defaultAcc = {
          name: '现金',
          initialBalance: 0,
          icon: '💵'
        };
        const addRes = await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'addAccount',
            data: { groupId, account: defaultAcc }
          }
        });
        defaultAcc._id = addRes.result._id;
        accounts = [defaultAcc];
      }

      // 计算余额需要所有交易记录
      // 这里如果交易量大，应该放在云端计算 (getStats or specialized getAccountsWithBalance)
      // 暂时前端计算，使用 cloudApi 拉取
      const transRes = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getTransactions',
          data: { groupId, limit: 1000 }
        }
      });
      const transactions = transRes.result.list || [];

      // 计算每个账户的当前余额
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

      this.setData({ accounts });
    } catch (err) {
      console.error('加载账户失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  showAddModal() {
    this.setData({ showModal: true, newName: '', newBalance: '', iconIndex: 0, newIcon: '💳' });
  },

  hideAddModal() {
    this.setData({ showModal: false });
  },

  onNameInput(e) { this.setData({ newName: e.detail.value }); },
  onBalanceInput(e) { this.setData({ newBalance: e.detail.value }); },
  onIconChange(e) {
    this.setData({ 
      iconIndex: e.detail.value,
      newIcon: this.data.icons[e.detail.value]
    });
  },

  async addAccount() {
    const { newName, newBalance, newIcon } = this.data;
    if (!newName) return;

    const groupId = wx.getStorageSync('currentGroupId');
    try {
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'addAccount',
          data: {
            groupId,
            account: {
              name: newName,
              initialBalance: Number(newBalance) || 0,
              icon: newIcon
            }
          }
        }
      });
      this.setData({ showModal: false });
      this.loadAccounts();
      wx.showToast({ title: '添加成功' });
    } catch (err) {
      console.error('添加失败', err);
    }
  },

  async deleteAccount(e) {
    const id = e.currentTarget.dataset.id;
    if (this.data.accounts.length <= 1) {
      wx.showToast({ title: '至少保留一个账户', icon: 'none' });
      return;
    }

    wx.showModal({
      title: '提示',
      content: '删除账户不会删除账单，但相关账单将失去关联。确定吗？',
      success: async (res) => {
        if (res.confirm) {
          const groupId = wx.getStorageSync('currentGroupId');
          await wx.cloud.callFunction({
            name: 'cloudApi',
            data: {
              action: 'deleteAccount',
              data: { groupId, id }
            }
          });
          this.loadAccounts();
        }
      }
    });
  }
})
