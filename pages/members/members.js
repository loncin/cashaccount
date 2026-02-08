Page({
  data: {
    members: [],
    showModal: false,
    newName: '',
    groupId: ''
  },

  onShow() {
    const groupId = wx.getStorageSync('currentGroupId');
    this.setData({ groupId });
    this.loadMembers();
  },

  onShareAppMessage() {
    const groupId = this.data.groupId;
    return {
      title: '邀请你加入我的共享账本，一起记账吧！',
      path: `/pages/index/index?groupId=${groupId}`,
      imageUrl: '/images/share-cover.png' // 可选：添加分享封面图
    };
  },

  async loadMembers() {
    const groupId = wx.getStorageSync('currentGroupId');
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getMetadata',
          data: { groupId }
        }
      });
      this.setData({ members: res.result.members });
    } catch (err) {
      console.error('获取成员失败', err);
    }
  },

  showAddModal() {
    this.setData({ showModal: true, newName: '' });
  },

  hideAddModal() {
    this.setData({ showModal: false });
  },

  onNameInput(e) {
    this.setData({ newName: e.detail.value });
  },

  async addMember() {
    const name = this.data.newName.trim();
    const groupId = wx.getStorageSync('currentGroupId');
    if (!name) {
      wx.showToast({ title: '请输入名称', icon: 'none' });
      return;
    }

    try {
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'addMember',
          data: {
            groupId,
            member: {
              name: name,
              isOwner: false
            }
          }
        }
      });
      this.setData({ showModal: false });
      this.loadMembers();
      wx.showToast({ title: '添加成功' });
    } catch (err) {
      console.error('添加失败', err);
    }
  },

  async deleteMember(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '提示',
      content: '确定要移除该成员吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            const groupId = wx.getStorageSync('currentGroupId');
            await wx.cloud.callFunction({
              name: 'cloudApi',
              data: {
                action: 'deleteMember',
                data: { groupId, id }
              }
            });
            this.loadMembers();
            wx.showToast({ title: '已移除' });
          } catch (err) {
            console.error('移除失败', err);
          }
        }
      }
    });
  }
})
