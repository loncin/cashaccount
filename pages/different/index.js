Page({
  data: {
    recommendType: 'destination',
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    selectedMonth: '1月',
    duration: '1-3',
    transport: 'car',
    distance: 'short'
  },

  selectType(e) {
    this.setData({ recommendType: e.currentTarget.dataset.type });
  },

  selectMonth(e) {
    this.setData({ selectedMonth: e.currentTarget.dataset.value });
  },

  selectDuration(e) {
    this.setData({ duration: e.currentTarget.dataset.value });
  },

  selectTransport(e) {
    this.setData({ transport: e.currentTarget.dataset.value });
  },

  selectDistance(e) {
    this.setData({ distance: e.currentTarget.dataset.value });
  },

  generateRecommendation() {
    const { recommendType, selectedMonth, duration, transport, distance } = this.data;
    
    wx.showLoading({ title: 'AI 思考中...' });
    
    wx.cloud.callFunction({
      name: 'cloudApi',
      data: {
        action: 'getDifferentRecommendation',
        data: {
          recommendType,
          selectedMonth,
          duration,
          transport,
          distance
        }
      },
      success: (res) => {
        if (res.result && res.result.recommendation) {
          // 将推荐结果存入全局或通过 URL 传递
          // 这里通过存储传递复杂对象
          wx.setStorageSync('lastRecommendation', res.result.recommendation);
          wx.navigateTo({
            url: '/pages/different/result'
          });
        } else {
          wx.showToast({ title: '推荐生成失败，请重试', icon: 'none' });
        }
      },
      fail: (err) => {
        console.error('AI 推荐请求失败', err);
        wx.showToast({ title: '网络错误', icon: 'none' });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  }
})
