Page({
  data: {
    myGroups: [],
    currentGroupId: '',
    showAddModal: false,
    isEdit: false,
    editGroupId: '',
    newGroupName: ''
  },

  onShow() {
    const currentGroupId = wx.getStorageSync('currentGroupId');
    this.setData({ currentGroupId });
    this.loadGroups();
  },

  async loadGroups() {
    wx.showLoading({ title: '加载中' });
    try {
      let groupIds = wx.getStorageSync('myGroupIds') || [];
      const currentId = wx.getStorageSync('currentGroupId');
      
      if (currentId && !groupIds.includes(currentId)) {
        groupIds.push(currentId);
      }
      
      // 去重并过滤空值
      groupIds = [...new Set(groupIds.filter(id => !!id))];
      wx.setStorageSync('myGroupIds', groupIds);

      // 如果没有账本，显示空列表
      if (groupIds.length === 0) {
        this.setData({ myGroups: [], currentGroupId: currentId });
        return;
      }

      // 并发获取账本信息，限制并发数量
      const concurrency = 5;
      const myGroups = [];
      
      for (let i = 0; i < groupIds.length; i += concurrency) {
        const batch = groupIds.slice(i, i + concurrency);
        const promises = batch.map(id => 
          wx.cloud.callFunction({
            name: 'cloudApi',
            data: {
              action: 'getGroupInfo',
              data: { groupId: id }
            }
          }).then(res => {
            const groupData = res.result.data || { _id: id, name: '未知账本' };
            return { ...groupData, groupId: id }; // 确保每个对象都有固定的 groupId 字段
          })
            .catch(() => ({ _id: id, groupId: id, name: '加载失败' }))
        );
        
        const batchResults = await Promise.all(promises);
        myGroups.push(...batchResults);
      }
      
      this.setData({ myGroups, currentGroupId: currentId });
    } catch (err) {
      console.error('加载账本列表失败', err);
      wx.showToast({ title: '加载失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  switchGroup(e) {
    const groupId = e.currentTarget.dataset.id;
    if (groupId === this.data.currentGroupId) return;

    wx.setStorageSync('currentGroupId', groupId);
    this.setData({ currentGroupId: groupId });
    wx.showToast({ title: '切换成功' });
    
    setTimeout(() => {
      wx.navigateBack();
    }, 1000);
  },

  showAddModal() {
    this.setData({ showAddModal: true, isEdit: false, newGroupName: '' });
  },

  showEditModal(e) {
    const id = e.currentTarget.dataset.id;
    const group = this.data.myGroups.find(g => (g.groupId || g._id) === id);
    if (!group) return;

    this.setData({ 
      showAddModal: true, 
      isEdit: true, 
      editGroupId: id,
      newGroupName: group.name 
    });
  },

  hideAddModal() {
    this.setData({ showAddModal: false, isEdit: false, editGroupId: '' });
  },

  onNameInput(e) {
    this.setData({ newGroupName: e.detail.value });
  },

  async createGroup() {
    const name = this.data.newGroupName.trim();
    if (!name) {
      wx.showToast({ title: '请输入账本名称', icon: 'none' });
      return;
    }

    wx.showLoading({ title: this.data.isEdit ? '修改中' : '创建中' });
    try {
      if (this.data.isEdit) {
        const updateRes = await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'updateGroupInfo',
            data: { groupId: this.data.editGroupId, name }
          }
        });
        
        if (updateRes.result && updateRes.result.error) {
          throw new Error(updateRes.result.error);
        }
        
        wx.showToast({ title: '修改成功' });
      } else {
        const res = await wx.cloud.callFunction({
          name: 'cloudApi',
          data: { 
            action: 'createGroup',
            data: { name }
          }
        });
        
        const groupId = res.result.groupId;
        
        let groupIds = wx.getStorageSync('myGroupIds') || [];
        if (!groupIds.includes(groupId)) {
          groupIds.push(groupId);
          wx.setStorageSync('myGroupIds', groupIds);
        }

        wx.setStorageSync('currentGroupId', groupId);
        wx.showToast({ title: '创建成功' });
      }
      
      this.setData({ showAddModal: false, isEdit: false, editGroupId: '' });
      this.loadGroups();
    } catch (err) {
      console.error('操作失败', err);
    } finally {
      wx.hideLoading();
    }
  }
})
