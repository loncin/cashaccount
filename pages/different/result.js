Page({
  data: {
    recommendation: null,
    isFromShare: false
  },

  onLoad(options) {
    if (options.id) {
      this.loadById(options.id);
    } else {
      const recommendation = wx.getStorageSync('lastRecommendation');
      if (recommendation) {
        this.setData({ recommendation });
      } else {
        wx.showToast({ title: '没有找到推荐结果', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
      }
    }
  },

  async loadById(id) {
    wx.showLoading({ title: '加载分享中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'differentApi',
        data: {
          action: 'getFavoriteById',
          data: { id }
        }
      });
      if (res.result && res.result.data) {
        this.setData({ 
          recommendation: res.result.data,
          isFromShare: true
        });
      } else {
        wx.showToast({ title: '分享已失效', icon: 'none' });
      }
    } catch (err) {
      console.error('加载分享失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  onShareAppMessage() {
    const { recommendation } = this.data;
    if (recommendation && recommendation._id) {
      return {
        title: `发现一个超赞的冷门地点：${recommendation.title}`,
        path: `/pages/different/result?id=${recommendation._id}`,
        imageUrl: '/temp/ldbyy2.png' // 或者使用默认
      };
    }
    return {
      title: '来点不一样的 - AI 驱动的冷门推荐',
      path: '/pages/portal/index'
    };
  },

  onShareTimeline() {
    const { recommendation } = this.data;
    if (recommendation && recommendation._id) {
      return {
        title: `探秘${recommendation.title}`,
        query: `id=${recommendation._id}`
      };
    }
  },

  regenerate() {
    if (this.data.isFromShare) {
      wx.reLaunch({
        url: '/pages/portal/index'
      });
    } else {
      wx.navigateBack();
    }
  },

  async collect() {
    const { recommendation } = this.data;
    if (!recommendation) return;

    wx.showLoading({ title: '保存中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'differentApi',
        data: {
          action: 'addFavorite',
          data: { recommendation }
        }
      });
      
      const newId = res.result._id;
      this.setData({
        'recommendation._id': newId
      });
      
      wx.showToast({ title: '已收藏', icon: 'success' });
    } catch (err) {
      console.error('收藏失败', err);
      wx.showToast({ title: '收藏失败', icon: 'none' });
    }
  },

  openMap() {
    const { recommendation } = this.data;
    if (!recommendation || !recommendation.location) return;

    const { latitude, longitude, address, title } = recommendation.location;
    
    wx.openLocation({
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      name: recommendation.title,
      address: address || '',
      scale: 15
    });
  }
})
