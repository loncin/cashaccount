Page({
  data: {
    recommendType: 'destination',
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    selectedMonth: '1月',
    duration: '1-3',
    transport: 'car',
    distance: 'short',
    customDistance: 200
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
    const value = e.currentTarget.dataset.value;
    let customDistance = this.data.customDistance;
    if (value === 'short') customDistance = 200;
    else if (value === 'medium') customDistance = 500;
    else if (value === 'long') customDistance = 800;
    else if (value === 'extra-long') customDistance = 1500;
    
    this.setData({ 
      distance: value,
      customDistance
    });
  },

  onDistanceSliderChange(e) {
    const val = e.detail.value;
    let distance = 'extra-long';
    if (val <= 200) distance = 'short';
    else if (val <= 500) distance = 'medium';
    else if (val <= 800) distance = 'long';
    
    this.setData({
      customDistance: val,
      distance: distance
    });
  },

  generateRecommendation() {
    const { recommendType, selectedMonth, duration, transport, distance } = this.data;
    
    wx.showLoading({ title: 'AI 思考中...' });
    
    wx.cloud.callFunction({
      name: 'differentApi',
      data: {
        action: 'getDifferentRecommendation',
        data: {
          recommendType,
          selectedMonth,
          duration,
          transport,
          distance,
          customDistance: this.data.customDistance
        }
      },
      config: {
        timeout: 60000
      },
      success: (res) => {
        if (res.result && res.result.recommendation) {
          wx.setStorageSync('lastRecommendation', res.result.recommendation);
          wx.navigateTo({
            url: '/pages/different/result'
          });
        } else {
          const errMsg = res.result && res.result.error ? res.result.error : '未知错误';
          wx.showModal({
            title: '生成失败',
            content: `AI 调用异常: ${errMsg}`,
            showCancel: false
          });
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
