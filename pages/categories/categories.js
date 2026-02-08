Page({
  data: {
    type: 'expense',
    categories: [],
    showModal: false,
    newName: '',
    docId: ''
  },

  onShow() {
    this.loadCategories();
  },

  async loadCategories() {
    const groupId = wx.getStorageSync('currentGroupId');
    try {
      const res = await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'getMetadata',
          data: { groupId }
        }
      });
      
      const catsData = res.result.categories;
      
      if (catsData.length > 0) {
        const doc = catsData[0];
        this.setData({ 
          allCategories: doc,
          categories: doc[this.data.type],
          docId: doc._id
        });
      } else {
        // 初始化默认分类（带图标）
        const defaultCats = {
          expense: [
            { name: '餐饮', icon: '🍚' },
            { name: '交通', icon: '🚗' },
            { name: '购物', icon: '🛒' },
            { name: '娱乐', icon: '🎮' },
            { name: '居住', icon: '🏠' },
            { name: '医疗', icon: '🏥' },
            { name: '教育', icon: '🎓' },
            { name: '其他', icon: '📦' }
          ],
          income: [
            { name: '工资', icon: '💰' },
            { name: '奖金', icon: '🧧' },
            { name: '投资', icon: '📈' },
            { name: '兼职', icon: '🕒' },
            { name: '其他', icon: '💵' }
          ]
        };
        
        // 调用 addCategory 初始化
        await wx.cloud.callFunction({
          name: 'cloudApi',
          data: {
            action: 'addCategory', // 此 action 在 cloudApi 中实现了更新或新增
            data: { groupId, category: defaultCats }
          }
        });
        
        // 重新加载以获取 _id
        this.loadCategories();
      }
    } catch (err) {
      console.error('加载分类失败', err);
    }
  },

  changeType(e) {
    const type = e.currentTarget.dataset.type;
    this.setData({ 
      type,
      categories: this.data.allCategories[type]
    });
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

  async addCategory() {
    const name = this.data.newName.trim();
    if (!name) return;

    const { allCategories, type } = this.data;
    if (allCategories[type].some(cat => cat.name === name)) {
      wx.showToast({ title: '已存在', icon: 'none' });
      return;
    }

    // 随机选一个默认图标或固定一个
    const icon = type === 'expense' ? '💸' : '💰';
    
    // 更新本地数据结构
    const newAllCategories = { ...allCategories };
    newAllCategories[type].push({ name, icon });
    
    // 清理 _id 等字段以便更新
    const categoryUpdate = {
      expense: newAllCategories.expense,
      income: newAllCategories.income
    };
    
    const groupId = wx.getStorageSync('currentGroupId');

    try {
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'addCategory',
          data: { groupId, category: categoryUpdate }
        }
      });
      this.setData({ showModal: false });
      this.loadCategories();
    } catch (err) {
      console.error('更新分类失败', err);
    }
  },

  async removeCategory(e) {
    const val = e.currentTarget.dataset.val;
    const { allCategories, type } = this.data;
    
    const newAllCategories = { ...allCategories };
    newAllCategories[type] = newAllCategories[type].filter(item => item.name !== val);
    
    const categoryUpdate = {
      expense: newAllCategories.expense,
      income: newAllCategories.income
    };
    
    const groupId = wx.getStorageSync('currentGroupId');
    
    try {
      await wx.cloud.callFunction({
        name: 'cloudApi',
        data: {
          action: 'addCategory',
          data: { groupId, category: categoryUpdate }
        }
      });
      this.loadCategories();
    } catch (err) {
      console.error('删除分类失败', err);
    }
  }
})
