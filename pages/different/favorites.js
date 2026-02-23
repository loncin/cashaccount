Page({
  data: {
    favorites: []
  },

  onShow() {
    this.loadFavorites();
  },

  async loadFavorites() {
    wx.showLoading({ title: '加载中...' });
    try {
      const res = await wx.cloud.callFunction({
        name: 'differentApi',
        data: {
          action: 'getFavorites',
          data: {}
        }
      });
      
      const list = (res.result.list || []).map(item => {
        const d = new Date(item.createTime);
        item.displayTime = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        return item;
      });

      this.setData({ favorites: list });
    } catch (err) {
      console.error('加载收藏失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() {
    this.loadFavorites();
  },

  viewDetail(e) {
    const index = e.currentTarget.dataset.index;
    const item = this.data.favorites[index];
    wx.setStorageSync('lastRecommendation', item);
    wx.navigateTo({
      url: '/pages/different/result'
    });
  },

  async deleteItem(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要删除这条收藏吗？',
      success: async (res) => {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });
          try {
            await wx.cloud.callFunction({
              name: 'differentApi',
              data: {
                action: 'deleteFavorite',
                data: { id }
              }
            });
            wx.showToast({ title: '已删除', icon: 'success' });
            this.loadFavorites();
          } catch (err) {
            console.error('删除失败', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        }
      }
    });
  },

  goToGenerate() {
    wx.navigateTo({
      url: '/pages/different/index'
    });
  }
})
