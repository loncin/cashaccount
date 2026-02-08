Page({
  data: {
    year: 0,
    month: 0,
    days: [],
    selectedDate: '',
    dailyTransactions: [],
    monthlyData: {}, // Map of 'YYYY-MM-DD' to {income, expense}
    dayNames: ['日', '一', '二', '三', '四', '五', '六']
  },

  onLoad() {
    const now = new Date();
    this.setData({
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      selectedDate: `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`
    });
  },

  onShow() {
    this.loadMonthlyData();
  },

  async loadMonthlyData() {
    const { year, month } = this.data;
    const groupId = wx.getStorageSync('currentGroupId');
    const monthStr = `${year}-${month.toString().padStart(2, '0')}`;
    
    wx.showLoading({ title: '加载中' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getTransactions',
          data: {
            groupId,
            limit: 1000,
            filter: { date: monthStr } // Prefix match for month
          }
        }
      });

      const monthlyData = {};
      res.result.list.forEach(t => {
        if (!monthlyData[t.date]) {
          monthlyData[t.date] = { income: 0, expense: 0 };
        }
        if (t.type === 'income') monthlyData[t.date].income += Number(t.amount);
        else monthlyData[t.date].expense += Number(t.amount);
      });

      this.setData({ monthlyData }, () => {
        this.generateCalendar();
        this.loadDailyTransactions();
      });
    } catch (err) {
      console.error('加载月度数据失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  generateCalendar() {
    const { year, month, monthlyData, selectedDate } = this.data;
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    
    const days = [];
    // Padding
    for (let i = 0; i < firstDay; i++) {
      days.push({ day: '', fullDate: '', hasData: false });
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`;
      days.push({
        day: i,
        fullDate: dateStr,
        hasData: !!monthlyData[dateStr],
        data: monthlyData[dateStr] || null,
        isSelected: dateStr === selectedDate
      });
    }
    
    this.setData({ days });
  },

  selectDate(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.setData({ selectedDate: date }, () => {
      this.generateCalendar();
      this.loadDailyTransactions();
    });
  },

  async loadDailyTransactions() {
    const { selectedDate } = this.data;
    const groupId = wx.getStorageSync('currentGroupId');
    
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getTransactions',
          data: {
            groupId,
            filter: {
              date: selectedDate,
              type: 'day' // Exact match
            }
          }
        }
      });
      this.setData({ dailyTransactions: res.result.list });
    } catch (err) {
      console.error('加载日流水失败', err);
    }
  },

  prevMonth() {
    let { year, month } = this.data;
    if (month === 1) {
      year--;
      month = 12;
    } else {
      month--;
    }
    this.setData({ year, month }, () => this.loadMonthlyData());
  },

  nextMonth() {
    let { year, month } = this.data;
    if (month === 12) {
      year++;
      month = 1;
    } else {
      month++;
    }
    this.setData({ year, month }, () => this.loadMonthlyData());
  },

  onItemClick(e) {
    const id = e.currentTarget.dataset.id;
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (res) => {
        if (res.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/add/add?id=${id}` });
        } else if (res.tapIndex === 1) {
          this.deleteTransaction(id);
        }
      }
    });
  },

  async deleteTransaction(id) {
    const groupId = wx.getStorageSync('currentGroupId');
    wx.showLoading({ title: '删除中' });
    try {
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'deleteTransaction',
          data: { id, groupId }
        }
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
});
