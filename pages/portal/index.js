Page({
  data: {},
  onLoad() {},

  goToDifferent() {
    wx.navigateTo({
      url: '/pages/different/index'
    });
  },

  goToBookkeeping() {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  goToFavorites() {
    wx.navigateTo({
      url: '/pages/different/favorites'
    });
  }
})
