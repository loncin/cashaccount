Page({
  data: {
    type: 'expense', // expense, income
    rangeType: 'month', // month, year
    date: '',
    totalAmount: 0,
    categoryStats: [],
    memberStats: [],
    trendData: [] // For bar chart
  },

  onShow() {
    const app = getApp();
    // 确保初始化日期后再执行后续逻辑
    this.initDate(() => {
      if (app.initData) {
        app.initData().then(() => {
          this.loadData();
        }).catch(err => {
          console.error('统计页面等待初始化失败', err);
          this.loadData(); // 尝试直接加载
        });
      } else {
        this.loadData();
      }
    });
  },

  getInitialDate() {
    const now = new Date();
    return this.data.rangeType === 'month' 
      ? `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`
      : `${now.getFullYear()}`;
  },

  initDate(callback) {
    const date = this.getInitialDate();
    this.setData({ date }, typeof callback === 'function' ? callback : null);
  },

  changeType(e) {
    this.setData({ type: e.currentTarget.dataset.type }, () => this.loadData());
  },

  changeRange(e) {
    const rangeType = e.currentTarget.dataset.type;
    this.setData({ rangeType }, () => {
      this.initDate(() => {
        this.loadData();
      });
    });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value }, () => this.loadData());
  },

  async loadData() {
    const { type, rangeType, date } = this.data;
    const groupId = wx.getStorageSync('currentGroupId');
    
    if (!groupId) {
      console.warn('currentGroupId is missing');
      return;
    }
    
    wx.showLoading({ title: '统计中' });
    try {
      // 并发获取元数据和统计数据，提高效率
      const [metaRes, statsRes] = await Promise.all([
        wx.cloud.callFunction({
          name: 'cloudApi',
          data: { action: 'getMetadata', data: { groupId } }
        }),
        wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'getDetailedStats',
            data: { groupId, month: date, type }
          }
        })
      ]);

      if (metaRes.result && metaRes.result.categories) {
        this.setData({ allCategories: metaRes.result.categories[0] || {} });
      }

      if (statsRes.result && !statsRes.result.error) {
        this.processAggregatedData(statsRes.result);
      } else {
        console.error('统计加载失败', statsRes.result ? statsRes.result.error : '未知错误');
        // 清空数据
        this.processAggregatedData({});
      }
    } catch (err) {
      console.error('统计加载失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  processAggregatedData(data) {
    if (!data) data = {};
    // 添加默认值处理，防止 undefined 错误
    const { categoryStats = [], dailyStats = [], memberStats = [] } = data;
    
    // categoryStats: [{ _id: '餐饮', total: 100, count: 5, icon: '...' }]
    // 注意：云函数聚合目前没返回 icon，需要在云函数里 lookup 或者前端匹配
    // 前端有 allCategories，可以匹配 icon
    // 这里简化，假设云函数没返回 icon，我们先显示默认
    
    let total = 0;
    categoryStats.forEach(c => total += (c.total || 0));
    
    const processedCatStats = categoryStats.map(c => ({
      name: c._id,
      amount: (c.total || 0).toFixed(2),
      percent: total > 0 ? (((c.total || 0) / total) * 100).toFixed(1) : 0,
      icon: this.getCategoryIcon(c._id)
    }));
    
    // 处理成员统计
    let memberTotal = 0;
    memberStats.forEach(m => memberTotal += (m.total || 0));
    
    const processedMemberStats = memberStats.map(m => ({
      name: m._id,
      amount: (m.total || 0).toFixed(2),
      percent: memberTotal > 0 ? (((m.total || 0) / memberTotal) * 100).toFixed(1) : 0
    }));
    
    // Trend data
    const trendMap = {};
    if (Array.isArray(dailyStats)) {
      dailyStats.forEach(d => {
         // d._id is 'YYYY-MM-DD'
         let key = '';
         if (this.data.rangeType === 'month') {
           key = d._id.split('-')[2];
         } else {
           key = d._id.split('-')[1];
         }
         trendMap[key] = d.total;
      });
    }
    
    const trendData = [];
    const trendValues = Object.values(trendMap);
    const maxVal = trendValues.length > 0 ? Math.max(...trendValues, 1) : 1;
    
    if (this.data.rangeType === 'month') {
      for (let i = 1; i <= 31; i++) {
        const key = i.toString().padStart(2, '0');
        trendData.push({
          label: i,
          height: trendMap[key] ? (trendMap[key] / maxVal * 100) : 0,
          value: trendMap[key] || 0
        });
      }
    } else {
      for (let i = 1; i <= 12; i++) {
        const key = i.toString().padStart(2, '0');
        trendData.push({
          label: i + '月',
          height: trendMap[key] ? (trendMap[key] / maxVal * 100) : 0,
          value: trendMap[key] || 0
        });
      }
    }
    
    this.setData({
      totalAmount: total.toFixed(2),
      categoryStats: processedCatStats,
      memberStats: processedMemberStats,
      trendData
    });
  },

  getCategoryIcon(name) {
    if (!this.data.allCategories) return '📦';
    const cats = [...(this.data.allCategories.expense || []), ...(this.data.allCategories.income || [])];
    const cat = cats.find(c => c.name === name);
    return cat ? cat.icon : '📦';
  }
});
