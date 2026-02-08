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
    this.initDate();
    this.loadData();
  },

  initDate() {
    const now = new Date();
    const date = this.data.rangeType === 'month' 
      ? `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}`
      : `${now.getFullYear()}`;
    this.setData({ date });
  },

  changeType(e) {
    this.setData({ type: e.currentTarget.dataset.type }, () => this.loadData());
  },

  changeRange(e) {
    this.setData({ rangeType: e.currentTarget.dataset.type }, () => {
      this.initDate();
      this.loadData();
    });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value }, () => this.loadData());
  },

  async loadData() {
    const { type, rangeType, date } = this.data;
    const groupId = wx.getStorageSync('currentGroupId');
    
    wx.showLoading({ title: '统计中' });
    try {
      // 通过云函数获取详细统计
      // 注意：getDetailedStats 返回的格式是聚合过的 { categoryStats, dailyStats }
      // 前端 processData 需要相应调整，或者让云函数返回原始数据
      // 为了保持前端图表逻辑不变，我们暂时还是获取列表，但在列表较大时性能会差
      // 更好的方式是 update cloudApi to return processed stats
      
      // 这里我们使用 getTransactions 配合 filter，但考虑到数据量，最好用聚合
      // 使用 cloudApi 中新加的 getDetailedStats (假设已实现聚合)
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getDetailedStats',
          data: {
            groupId,
            month: date, // 目前 getDetailedStats 只支持按月前缀匹配，如果 rangeType 是 year 需要调整云函数
            type
          }
        }
      });
      
      // 如果 rangeType 是 year，云函数 getDetailedStats 的正则匹配可能需要调整
      // 为了兼容年视图，我们在云函数调用前判断
      // 这里的 date 格式：Month: 'YYYY-MM', Year: 'YYYY'
      // cloudApi 的 getDetailedStats 正则是 '^' + month，所以传年份也能匹配整年
      
      this.processAggregatedData(res.result);
    } catch (err) {
      console.error('统计加载失败', err);
    } finally {
      wx.hideLoading();
    }
  },

  processAggregatedData(data) {
    const { categoryStats, dailyStats } = data;
    
    // categoryStats: [{ _id: '餐饮', total: 100, count: 5, icon: '...' }]
    // 注意：云函数聚合目前没返回 icon，需要在云函数里 lookup 或者前端匹配
    // 前端有 allCategories，可以匹配 icon
    // 这里简化，假设云函数没返回 icon，我们先显示默认
    
    let total = 0;
    categoryStats.forEach(c => total += c.total);
    
    const processedCatStats = categoryStats.map(c => ({
      name: c._id,
      amount: c.total.toFixed(2),
      percent: total > 0 ? ((c.total / total) * 100).toFixed(1) : 0,
      icon: '📦' // 暂时默认，后续优化
    }));
    
    // Member stats (cloudApi getDetailedStats 还没聚合 member，需要补充)
    // 暂时置空或在云函数添加 memberStats
    
    // Trend data
    const trendMap = {};
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
    
    const trendData = [];
    const maxVal = Math.max(...Object.values(trendMap), 1);
    
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
      memberStats: [], // 暂不支持 member 统计，除非更新云函数
      trendData
    });
  }
});
