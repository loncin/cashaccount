Page({
  data: {
    userInfo: null,
    currentGroupName: '加载中...',
    hasUserInfo: false
  },

  onShow() {
    this.loadCurrentGroup();
    this.checkUserInfo();
  },

  checkUserInfo() {
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) {
      this.setData({
        userInfo,
        hasUserInfo: true
      });
    }
  },

  async loadCurrentGroup() {
    const groupId = wx.getStorageSync('currentGroupId');
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getGroupInfo',
          data: { groupId }
        }
      });
      
      if (res.result && res.result.data) {
        this.setData({ currentGroupName: res.result.data.name || '默认账本' });
      } else {
        this.setData({ currentGroupName: '默认账本' });
      }
    } catch (err) {
      console.error('加载账本名失败', err);
      this.setData({ currentGroupName: '默认账本' });
    }
  },

  login() {
    wx.getUserProfile({
      desc: '用于完善会员资料',
      success: (res) => {
        wx.setStorageSync('userInfo', res.userInfo);
        this.setData({
          userInfo: res.userInfo,
          hasUserInfo: true
        });
      }
    });
  },

  navTo(e) {
    const url = e.currentTarget.dataset.url;
    wx.navigateTo({ url });
  },

  navToPortal() {
    wx.reLaunch({
      url: '/pages/portal/index'
    });
  },

  clearCache() {
    wx.showModal({
      title: '提示',
      content: '确定要清除缓存吗？这将清除您的本地设置，但云端数据不会丢失。',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync();
          wx.showToast({ title: '清理成功' });
          setTimeout(() => {
            wx.reLaunch({ url: '/pages/portal/index' });
          }, 1000);
        }
      }
    });
  },

  about() {
    wx.showModal({
      title: '关于共享记账',
      content: '这是一款支持多人协作、实时共享的记账小程序。感谢您的使用！',
      showCancel: false
    });
  }
})
