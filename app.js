App({
  onLaunch(options) {
    this.initPromise = null;
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-0gg6t3kd1e60a948', // 需替换为您的云开发环境ID
        traceUser: true,
      });
    }

    this.handleShareOptions(options);
  },

  onShow(options) {
    this.handleShareOptions(options);
    this.checkAndGenerateRecurring();
  },

  async checkAndGenerateRecurring() {
    const groupId = wx.getStorageSync('currentGroupId');
    if (!groupId) return;

    try {
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'checkAndGenerateRecurring',
          data: { groupId }
        }
      });
    } catch (err) {
      console.error('执行周期性记账检查失败', err);
    }
  },

  async handleShareOptions(options) {
    if (options && options.query && options.query.groupId) {
      const newGroupId = options.query.groupId;
      const currentGroupId = wx.getStorageSync('currentGroupId');
      
      if (newGroupId !== currentGroupId) {
        wx.showModal({
          title: '加入账本',
          content: '确定加入分享给您的共享账本吗？',
          success: async (res) => {
            if (res.confirm) {
              wx.showLoading({ title: '加入中' });
              try {
                // 调用云函数加入群组
                await wx.cloud.callFunction({
                  name: 'cloudApi',
                  data: {
                    action: 'joinGroup',
                    data: { groupId: newGroupId }
                  }
                });

                wx.setStorageSync('currentGroupId', newGroupId);
                
                // 将新账本ID加入已记录列表
                let groupIds = wx.getStorageSync('myGroupIds') || [];
                if (!groupIds.includes(newGroupId)) {
                  groupIds.push(newGroupId);
                  wx.setStorageSync('myGroupIds', groupIds);
                }

                wx.showToast({ title: '已切换账本', icon: 'success' });
                // 跳转到账本首页
                wx.switchTab({
                  url: '/pages/index/index'
                });
              } catch (err) {
                console.error('加入群组失败', err);
                wx.showToast({ title: '加入失败', icon: 'none' });
              } finally {
                wx.hideLoading();
              }
            }
          }
        });
      }
    } else {
      // 确保 initData 完成后再继续
      try {
        await this.initData();
      } catch (err) {
        console.error('初始化数据失败', err);
      }
    }
  },

  async initData() {
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      let groupId = wx.getStorageSync('currentGroupId');
      if (!groupId) {
        try {
          const res = await wx.cloud.callFunction({
            name: 'cloudApi',
            data: { action: 'createGroup' }
          });
          
          if (res.result && res.result.groupId) {
            groupId = res.result.groupId;
            wx.setStorageSync('currentGroupId', groupId);
            
            let groupIds = [groupId];
            wx.setStorageSync('myGroupIds', groupIds);
          } else {
            throw new Error('创建群组返回数据异常');
          }
        } catch (err) {
          console.error('初始化账本失败', err);
          wx.showToast({ title: '初始化失败，请重试', icon: 'none' });
          this.initPromise = null; // 失败后允许重试
          throw err;
        }
      }
      return groupId;
    })();

    return this.initPromise;
  },
  globalData: {
    userInfo: null
  }
})
