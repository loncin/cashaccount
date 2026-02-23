const app = getApp();

Page({
  data: {
    netAsset: 0,
    monthlyIncome: 0,
    monthlyExpense: 0,
    budget: 0,
    budgetRemain: 0,
    budgetPercent: 0,
    showBudgetModal: false,
    newBudget: '',
    searchKeyword: '',
    filterType: 'month',
    filterDate: '',
    filterDateDisplay: '',
    transactions: [],
    filteredTransactions: []
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/portal/index'
    });
  },

  onShow() {
    this.initFilter();
    // 确保 App 初始化完成后再加载数据
    if (app.initData) {
      app.initData().then(() => {
        this.loadData();
        this.loadBudget();
      }).catch(err => {
        console.error('App 初始化失败', err);
      });
    } else {
      this.loadData();
      this.loadBudget();
    }
  },

  async loadBudget() {
    const groupId = wx.getStorageSync('currentGroupId');
    const now = new Date();
    const month = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getBudget',
          data: { groupId, month }
        }
      });
      
      if (res.result && res.result.list && res.result.list.length > 0) {
        this.setData({ 
          budget: Number(res.result.list[0].amount),
          budgetDocId: res.result.list[0]._id
        }, () => this.calculateBudgetProgress());
      } else {
        this.setData({ budget: 0, budgetPercent: 0 });
      }
    } catch (err) {
      console.error('加载预算失败', err);
    }
  },

  calculateBudgetProgress() {
    const { budget, monthlyExpense } = this.data;
    if (budget > 0) {
      const remain = (budget - monthlyExpense).toFixed(2);
      const percent = Math.min((monthlyExpense / budget) * 100, 100);
      this.setData({
        budgetRemain: remain,
        budgetPercent: percent
      });
    }
  },

  showBudgetModal() {
    this.setData({ 
      showBudgetModal: true, 
      newBudget: this.data.budget > 0 ? this.data.budget : '' 
    });
  },

  hideBudgetModal() {
    this.setData({ showBudgetModal: false });
  },

  onBudgetInput(e) {
    this.setData({ newBudget: e.detail.value });
  },

  async saveBudget() {
    const amount = Number(this.data.newBudget);
    if (isNaN(amount) || amount <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    const groupId = wx.getStorageSync('currentGroupId');
    const now = new Date();
    const month = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;

    try {
      wx.showLoading({ title: '保存中' });
      const budget = {
        amount,
        month
      };
      if (this.data.budgetDocId) {
        budget._id = this.data.budgetDocId;
      }
      
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'saveBudget',
          data: { groupId, budget }
        }
      });

      this.setData({ showBudgetModal: false });
      this.loadBudget();
      wx.showToast({ title: '设置成功' });
    } catch (err) {
      console.error('保存预算失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  initFilter() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    
    let date = `${year}-${month}`;
    if (this.data.filterType === 'day') date = `${year}-${month}-${day}`;
    if (this.data.filterType === 'year') date = `${year}`;

    this.setData({
      filterDate: date,
      filterDateDisplay: date
    });
  },

  async loadData() {
    const groupId = wx.getStorageSync('currentGroupId');
    if (!groupId) {
      return;
    }
    wx.showLoading({ title: '加载中' });
    
    try {
      // 获取交易列表
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getTransactions',
          data: { 
            groupId, 
            limit: 100,
            filter: {
              date: this.data.filterDate,
              type: this.data.filterType,
              keyword: this.data.searchKeyword
            }
          }
        }
      });

      // 获取统计数据 (复用 filterDate 对应的月份)
      const now = new Date();
      const currentMonth = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
      
      const statsRes = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getStats',
          data: { groupId, month: currentMonth }
        }
      });
        
      if (!res.result || res.result.error) {
        console.error('获取交易列表失败', res.result ? res.result.error : '未知错误');
        this.setData({ transactions: [], filteredTransactions: [] });
      } else {
        this.setData({ transactions: res.result.list || [] }, () => {
          this.setData({ filteredTransactions: res.result.list || [] });
        });
      }

      // 解析统计数据
      let netAsset = 0, monthlyIncome = 0, monthlyExpense = 0;
      
      if (statsRes.result && !statsRes.result.error) {
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
    } catch (err) {
      console.error('获取数据失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  // filterTransactions 不再需要复杂的逻辑，或者仅作为快速筛选缓存
  filterTransactions() {
    // 触发云端搜索
    this.loadData();
  },

  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value }, () => {
      // 防抖？简单起见直接请求
      this.loadData();
    });
  },

  clearSearch() {
    this.setData({ searchKeyword: '' }, () => {
      this.loadData();
    });
  },

  goToCalendar() {
    wx.navigateTo({ url: '/pages/calendar/calendar' });
  },

  async importScreenshot() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '识别截图中...' });

        try {
          const cloudPath = `ocr_temp/import_${Date.now()}${tempFilePath.match(/\.[^.]+$/)[0]}`;
          const uploadRes = await wx.cloud.uploadFile({
            cloudPath,
            filePath: tempFilePath
          });

          const ocrRes = await wx.cloud.callFunction({
            name: 'ocrAction',
            data: { fileId: uploadRes.fileID }
          });
          
          // 识别完成后删除临时文件
          wx.cloud.deleteFile({ fileList: [uploadRes.fileID] });

          if (ocrRes.result && ocrRes.result.items) {
            this.parseWechatScreenshot(ocrRes.result.items, tempFilePath);
          } else {
            wx.showToast({ title: '识别失败', icon: 'none' });
          }
        } catch (err) {
          console.error('导入失败', err);
          wx.showToast({ title: '识别异常', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  parseWechatScreenshot(items, filePath) {
    let amount = '';
    let date = '';
    let note = '';
    
    // 微信支付截图常见特征
    const amountReg = /([0-9]+\.[0-9]{2})/;
    const dateReg = /(\d{4}-\d{2}-\d{2})/;
    
    for (let i = 0; i < items.length; i++) {
      const text = items[i].text;
      
      // 1. 寻找金额：通常在“付款金额”之后或是一个巨大的数字
      if (!amount && (text.includes('付款金额') || text.includes('金额'))) {
        // 尝试看下一行或当前行是否有数字
        const nextText = items[i+1] ? items[i+1].text : '';
        const match = (text + nextText).match(amountReg);
        if (match) amount = match[1];
      }
      
      // 2. 寻找商户/备注：通常在“商户全称”或开头
      if (!note && text.includes('商户全称')) {
        note = items[i+1] ? items[i+1].text : '';
      }

      // 3. 寻找日期
      if (!date && text.includes('支付时间')) {
        const match = (text + (items[i+1] ? items[i+1].text : '')).match(dateReg);
        if (match) date = match[1];
      }
    }

    // 后备方案：如果没有识别到明确标签，找最大的数字和第一个看起来像名字的行
    if (!amount) {
      const allAmounts = items.map(it => it.text.match(amountReg)).filter(m => m).map(m => parseFloat(m[1]));
      if (allAmounts.length > 0) amount = Math.max(...allAmounts).toFixed(2);
    }

    if (amount) {
      wx.navigateTo({
        url: `/pages/add/add?amount=${amount}&date=${date || ''}&note=${note || ''}&tempImage=${encodeURIComponent(filePath)}`
      });
    } else {
      wx.showToast({ title: '未能识别出金额，请重试', icon: 'none' });
    }
  },

  previewReceipt(e) {
    const url = e.currentTarget.dataset.url;
    wx.previewImage({
      urls: [url]
    });
  },

  exportData() {
    const data = this.data.filteredTransactions;
    if (data.length === 0) {
      wx.showToast({ title: '暂无数据可导出', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '导出中' });

    // CSV 表头
    let csvContent = '\ufeff日期,类型,分类,金额,成员,备注\n';
    
    data.forEach(t => {
      const type = t.type === 'expense' ? '支出' : '收入';
      const note = (t.note || '').replace(/,/g, '，'); // 替换逗号防止格式错乱
      csvContent += `${t.date},${type},${t.category},${t.amount},${t.memberName},${note}\n`;
    });

    const fs = wx.getFileSystemManager();
    const filePath = `${wx.env.USER_DATA_PATH}/账单导出_${new Date().getTime()}.xls`;

    fs.writeFile({
      filePath: filePath,
      data: csvContent,
      encoding: 'utf8',
      success: () => {
        wx.hideLoading();
        wx.openDocument({
          filePath: filePath,
          fileType: 'xls',
          showMenu: true, // 允许转发分享
          success: () => {
            console.log('打开文档成功');
          },
          fail: (err) => {
            console.error('打开文档失败', err);
            wx.showToast({ title: '打开失败，请稍后重试', icon: 'none' });
          }
        });
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('写入文件失败', err);
        wx.showToast({ title: '导出失败', icon: 'none' });
      }
    });
  },

  onDateChange(e) {
    this.setData({
      filterDate: e.detail.value,
      filterDateDisplay: e.detail.value
    }, () => {
      this.loadData();
    });
  },

  changeFilterType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ filterType: type }, () => {
      this.initFilter();
      this.loadData();
    });
  },

  onItemClick(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) {
      console.warn('Transaction ID is missing');
      return;
    }
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      itemColor: '#333',
      success: (res) => {
        if (res.tapIndex === 0) {
          this.editTransaction(id);
        } else if (res.tapIndex === 1) {
          this.deleteTransaction(id);
        }
      },
      fail: (err) => {
        console.error('ActionSheet failed', err);
      }
    });
  },

  editTransaction(id) {
    // 因为 pages/add/add 是 TabBar 页面，不能使用 navigateTo 传参
    // 使用全局变量传递 ID 并通过 switchTab 跳转
    app.globalData.editId = id;
    wx.switchTab({
      url: '/pages/add/add'
    });
  },

  deleteTransaction(id) {
    wx.showModal({
      title: '提示',
      content: '确定要删除这条记录吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            wx.showLoading({ title: '删除中' });
            const groupId = wx.getStorageSync('currentGroupId');
            await wx.cloud.callFunction({
              name: 'cloudApi',
              data: {
                action: 'deleteTransaction',
                data: { id, groupId }
              }
            });
            wx.showToast({ title: '删除成功' });
            this.loadData();
          } catch (err) {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          } finally {
            wx.hideLoading();
          }
        }
      }
    });
  },

  onPullDownRefresh() {
    this.loadData().then(() => {
      wx.stopPullDownRefresh();
    });
  }
})
