const db = wx.cloud.database();

Page({
  data: {
    isEdit: false,
    editId: '',
    type: 'expense',
    amount: '',
    categories: [],
    categoryOptions: [],
    categoryIndex: 0,
    date: '',
    members: [],
    memberNames: [],
    memberIndex: 0,
    accounts: [],
    accountNames: [],
    accountIndex: 0,
    note: '',
    tempImagePath: '', // 用于本地预览
    receiptUrl: '',     // 存储云文件ID
    isRecurring: false,
    periods: ['每天', '每周', '每月'],
    periodIndex: 0,
    showCalendar: false,
    currentYear: 0,
    currentMonth: 0,
    calendarDays: [],
    showCategory: false
  },

  goHome() {
    wx.reLaunch({
      url: '/pages/portal/index'
    });
  },

  onLoad(options) {
    if (options.id) {
      this.setData({
        isEdit: true,
        editId: options.id
      });
      wx.setNavigationBarTitle({ title: '编辑账单' });
    } else if (options.amount) {
      // 截图导入模式
      this.setData({
        amount: options.amount,
        date: options.date || this.data.date,
        note: options.note || '',
        tempImagePath: options.tempImage ? decodeURIComponent(options.tempImage) : ''
      });
      wx.showToast({ title: '已自动填入信息', icon: 'none' });
    }
  },

  onShow() {
    const app = getApp();
    if (app.globalData && app.globalData.editId) {
      const id = app.globalData.editId;
      app.globalData.editId = null; // 消费掉 ID
      this.setData({
        isEdit: true,
        editId: id
      });
      wx.setNavigationBarTitle({ title: '编辑账单' });
    } else if (!this.data.isEdit) {
      // 正常点击 Tab 进入，确保是新增模式
      wx.setNavigationBarTitle({ title: '记账' });
    }
    
    this.initData();
  },

  async initData() {
    const groupId = wx.getStorageSync('currentGroupId');
    if (!groupId) {
      console.warn('currentGroupId is missing');
      return;
    }
    const now = new Date();
    const today = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;

    try {
      // 通过云函数获取元数据（分类、成员、账户）
      const metaRes = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getMetadata',
          data: { groupId }
        }
      });
      
      const meta = metaRes.result;
      
      if (!meta || meta.error) {
        console.error('获取元数据失败', meta ? meta.error : '未知错误');
        return;
      }
      
      let allCategories = meta.categories[0] || {
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
        ]
      };

      const members = meta.members.length > 0 ? meta.members : [{ name: '本人', id: 'self' }];
      const memberNames = members.map(m => m.name);

      const accounts = meta.accounts;
      const accountNames = accounts.map(a => `${a.icon} ${a.name}`);

      const categoryOptions = allCategories[this.data.type].map(c => `${c.icon} ${c.name}`);

      this.setData({
        allCategories,
        categories: allCategories[this.data.type],
        categoryOptions,
        members,
        memberNames,
        accounts,
        accountNames,
        date: this.data.date || today
      });

      // 如果是编辑模式，获取原有数据
      if (this.data.isEdit && this.data.editId) {
        // 调用 cloudApi 获取单个交易详情
        const tRes = await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'getTransaction',
            data: { id: this.data.editId, groupId }
          }
        });
        
        const t = tRes.result.data;
        
        // 查找分类索引
        const cats = allCategories[t.type];
        const categoryIndex = cats.findIndex(c => c.name === t.category);
        
        // 查找成员索引
        const memberIndex = memberNames.indexOf(t.memberName);

        // 查找账户索引
        const accountIndex = accounts.findIndex(a => a._id === t.accountId);

        this.setData({
          type: t.type,
          amount: t.amount,
          categories: cats,
          categoryOptions: cats.map(c => `${c.icon} ${c.name}`),
          categoryIndex: categoryIndex !== -1 ? categoryIndex : 0,
          date: t.date,
          memberIndex: memberIndex !== -1 ? memberIndex : 0,
          accountIndex: accountIndex !== -1 ? accountIndex : 0,
          note: t.note || '',
          tempImagePath: t.receiptUrl || '',
          receiptUrl: t.receiptUrl || ''
        });
      }
    } catch (err) {
      console.error('初始化数据失败', err);
    }
  },

  changeType(e) {
    const type = e.currentTarget.dataset.type;
    const cats = this.data.allCategories[type];
    this.setData({
      type,
      categories: cats,
      categoryOptions: cats.map(c => `${c.icon} ${c.name}`),
      categoryIndex: 0
    });
  },

  onAmountInput(e) {
    this.setData({ amount: e.detail.value });
  },

  onCategorySelect(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      categoryIndex: index,
      showCategory: false
    });
  },

  showCategoryModal() {
    this.setData({ showCategory: true });
  },

  hideCategoryModal() {
    this.setData({ showCategory: false });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  showCalendarModal() {
    const dateStr = this.data.date;
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);
    
    this.setData({
      showCalendar: true,
      currentYear: year,
      currentMonth: month
    });
    this.generateCalendar(year, month);
  },

  hideCalendarModal() {
    this.setData({ showCalendar: false });
  },

  generateCalendar(year, month) {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', fullDate: '', isEmpty: true });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      days.push({
        day: i,
        fullDate: dateStr,
        isEmpty: false
      });
    }
    
    this.setData({ calendarDays: days });
  },

  prevMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 1) {
      currentYear--;
      currentMonth = 12;
    } else {
      currentMonth--;
    }
    this.setData({ currentYear, currentMonth });
    this.generateCalendar(currentYear, currentMonth);
  },

  nextMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 12) {
      currentYear++;
      currentMonth = 1;
    } else {
      currentMonth++;
    }
    this.setData({ currentYear, currentMonth });
    this.generateCalendar(currentYear, currentMonth);
  },

  onDaySelect(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ 
      date,
      showCalendar: false 
    });
  },

  onMemberChange(e) {
    this.setData({ memberIndex: e.detail.value });
  },

  onAccountChange(e) {
    this.setData({ accountIndex: e.detail.value });
  },

  onNoteInput(e) {
    this.setData({ note: e.detail.value });
  },

  async scanInvoice() {
    wx.showToast({ title: '尽请期待！' });
    // wx.chooseMedia({
    //   count: 1,
    //   mediaType: ['image'],
    //   sourceType: ['album', 'camera'],
    //   success: async (res) => {
    //     const tempFilePath = res.tempFiles[0].tempFilePath;
    //     wx.showLoading({ title: '识别中...' });

    //     try {
    //       const cloudPath = `ocr_temp/${Date.now()}${tempFilePath.match(/\.[^.]+$/)[0]}`;
    //       const uploadRes = await wx.cloud.uploadFile({
    //         cloudPath,
    //         filePath: tempFilePath
    //       });

    //       const ocrRes = await wx.cloud.callFunction({
    //         name: 'ocrAction',
    //         data: { fileId: uploadRes.fileID }
    //       });
          
    //       wx.cloud.deleteFile({ fileList: [uploadRes.fileID] });

    //       if (ocrRes.result && ocrRes.result.items) {
    //         this.parseOcrResult(ocrRes.result.items);
    //         this.setData({ tempImagePath: tempFilePath });
    //       } else {
    //         wx.showToast({ title: '识别失败，请手动输入', icon: 'none' });
    //       }
    //     } catch (err) {
    //       console.error('OCR 失败', err);
    //       wx.showToast({ title: '识别服务异常', icon: 'none' });
    //     } finally {
    //       wx.hideLoading();
    //     }
    //   }
    // });
  },

  parseOcrResult(items) {
    let amount = '';
    let date = '';
    
    const amountReg = /([0-9]+\.[0-9]{2})/;
    const dateReg = /(\d{4}-\d{2}-\d{2})/;
    
    for (const item of items) {
      const text = item.text;
      
      if (!amount && amountReg.test(text)) {
        const match = text.match(amountReg);
        if (match) amount = match[1];
      }

      if (!date && dateReg.test(text)) {
        const match = text.match(dateReg);
        if (match) date = match[1];
      }
    }

    if (amount) this.setData({ amount });
    if (date) this.setData({ date });

    if (amount || date) {
      wx.showToast({ title: '识别成功' });
    }
  },

  onRecurringChange(e) {
    this.setData({ isRecurring: e.detail.value });
  },

  onPeriodChange(e) {
    this.setData({ periodIndex: e.detail.value });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = res.tempFiles[0].tempFilePath;
        this.setData({
          tempImagePath: path
        });
      }
    });
  },

  removeImage() {
    this.setData({
      tempImagePath: '',
      receiptUrl: ''
    });
  },

  previewImage() {
    wx.previewImage({
      urls: [this.data.tempImagePath]
    });
  },

  async uploadFile(tempFilePath) {
    if (tempFilePath.startsWith('cloud://')) return tempFilePath;
    
    const extension = tempFilePath.match(/\.[^.]+$/)[0];
    const cloudPath = `receipts/${Date.now()}-${Math.floor(Math.random() * 1000)}${extension}`;
    
    const res = await wx.cloud.uploadFile({
      cloudPath,
      filePath: tempFilePath
    });
    return res.fileID;
  },

  async submit() {
    const { isEdit, editId, type, amount, categories, categoryIndex, date, members, memberIndex, accounts, accountIndex, note, tempImagePath } = this.data;
    const groupId = wx.getStorageSync('currentGroupId');

    if (!groupId) {
      wx.showToast({ title: '请先创建或加入账本', icon: 'none' });
      return;
    }

    if (!amount || isNaN(amount) || Number(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
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

    wx.showLoading({ title: '保存中' });

    try {
      let finalReceiptUrl = '';
      if (tempImagePath) {
        finalReceiptUrl = await this.uploadFile(tempImagePath);
      }

      const transactionData = {
        type,
        amount: parseFloat(Number(amount).toFixed(2)),
        category: categories[categoryIndex].name,
        categoryIcon: categories[categoryIndex].icon,
        date,
        memberName: members[memberIndex].name,
        accountId: accounts[accountIndex]._id,
        accountName: accounts[accountIndex].name,
        note,
        receiptUrl: finalReceiptUrl
      };

      // 预算检查
      if (type === 'expense') {
        const now = new Date();
        const month = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`;
        
        // 获取预算和支出统计
        const statsRes = await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'getStats',
            data: { groupId, month }
          }
        });
        
        const budgetRes = await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'getBudget',
            data: { groupId, month }
          }
        });

        if (budgetRes.result.list && budgetRes.result.list.length > 0) {
          const budgetAmount = Number(budgetRes.result.list[0].amount);
          
          let totalSpent = 0;
          if (statsRes.result && statsRes.result.month) {
             statsRes.result.month.forEach(item => {
               if (item._id === 'expense') totalSpent = item.total;
             });
          }
          
          // 如果是编辑模式，需要从已支出中减去原金额（但这里为了简化，暂时忽略精确校验，只做大概提醒）
          // 精确做法是：云函数里做事务检查。这里仅前端提示。
          
          const newTotal = totalSpent + Number(amount);
          if (newTotal > budgetAmount) {
            const over = (newTotal - budgetAmount).toFixed(2);
            const userConfirmed = await new Promise((resolve) => {
              wx.showModal({
                title: '预算超支提醒',
                content: `本次支出后，本月总支出将达到 ${newTotal.toFixed(2)}，超出预算 ${over}。确定要保存吗？`,
                success: (res) => {
                  resolve(res.confirm);
                },
                fail: () => {
                  resolve(false);
                }
              });
            });
            
            if (!userConfirmed) {
              wx.hideLoading();
              return; // 用户取消，不保存
            }
          }
        }
      }

      if (isEdit) {
        await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'updateTransaction',
            data: {
              id: editId,
              groupId,
              transaction: transactionData
            }
          }
        });
      } else {
        await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'addTransaction',
            data: {
              groupId,
              transaction: transactionData
            }
          }
        });
        
        if (this.data.isRecurring) {
          const rule = {
             type,
             amount: transactionData.amount,
             category: transactionData.category,
             categoryIcon: transactionData.categoryIcon,
             memberName: transactionData.memberName,
             note: transactionData.note + ' (周期性自动记账)',
             period: this.data.periods[this.data.periodIndex],
             lastGeneratedDate: transactionData.date,
             isActive: true,
             groupId // 添加 groupId 字段
          };
          
          await wx.cloud.callFunction({
            name: 'cloudApi',
            data: {
              action: 'addRecurringRule',
              data: { groupId, rule }
            }
          });
        }
      }

      wx.showToast({
        title: isEdit ? '修改成功' : '保存成功',
        icon: 'success'
      });
      
      setTimeout(() => {
        wx.switchTab({ url: '/pages/index/index' });
        this.setData({ amount: '', note: '', isEdit: false, editId: '' });
      }, 1000);
    } catch (err) {
      console.error('提交失败', err);
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  }
})
