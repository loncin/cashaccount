const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const { action, data } = event
  const { OPENID } = cloud.getWXContext()

  try {
    switch (action) {
      case 'getDifferentRecommendation': {
        const { recommendType, selectedMonth, duration, transport, distance, customDistance, startLocation, coords, isIdentifyLocation, budget, preferences } = data;
        
        // 识别位置逻辑
        if (isIdentifyLocation && coords) {
          const prompt = `根据经纬度（经度：${coords.longitude}, 纬度：${coords.latitude}），请返回该位置所属的城市名称（例如：北京市、杭州市）。只需返回 JSON：{"city": "城市名称"}`;
          const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
          if (!DEEPSEEK_API_KEY) return { address: `坐标 (${coords.longitude.toFixed(2)}, ${coords.latitude.toFixed(2)})` };
          
          const https = require('https');
          const payload = {
            model: "deepseek-chat",
            messages: [{ role: "user", content: prompt }],
            response_format: { type: "json_object" }
          };
          const postData = Buffer.from(JSON.stringify(payload), 'utf8');

          try {
            const aiRes = await new Promise((resolve, reject) => {
              const options = {
                hostname: 'api.deepseek.com',
                port: 443,
                path: '/v1/chat/completions',
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
                  'Content-Length': postData.length
                },
                timeout: 10000
              };
              const req = https.request(options, (res) => {
                let chunks = [];
                res.on('data', (chunk) => chunks.push(chunk));
                res.on('end', () => {
                  const body = Buffer.concat(chunks).toString('utf8');
                  resolve(JSON.parse(body));
                });
              });
              req.on('error', (e) => reject(e));
              req.write(postData);
              req.end();
            });
            const cityData = JSON.parse(aiRes.choices[0].message.content);
            return { address: cityData.city || cityData.location || '未知城市' };
          } catch (e) {
            return { address: `坐标 (${coords.longitude.toFixed(2)}, ${coords.latitude.toFixed(2)})` };
          }
        }

        const typeMap = {
          'destination': '冷门目的地', 'flight': '冷门航班', 'hotel': '冷门酒店', 
          'restaurant': '冷门餐厅', 'attraction': '冷门景点'
        };
        
        const typeLabel = typeMap[recommendType] || '冷门目的地';
        
        const budgetMap = { 'economy': '经济实惠', 'comfort': '舒适体验', 'luxury': '豪华品质' };
        const prefMap = { 'nature': '自然风光', 'culture': '历史人文', 'food': '地道美食', 'photo': '拍照出片', 'adventure': '户外冒险' };
        
        const budgetLabel = budgetMap[budget] || '舒适体验';
        const prefLabels = (preferences || []).map(p => prefMap[p]).join('、') || '自然风光';

        const distanceLabel = customDistance ? `${customDistance}km以内` : (distance === 'short' ? '200km以内' : (distance === 'medium' ? '200-500km' : (distance === 'long' ? '500-800km' : '800km以上')));
        
        const startPoint = startLocation || '用户当前所在城市';
        
        // 1. 更加明确的 Prompt，强制指定键名
        const prompt = `你是一个专业的旅游规划师。请推荐一个${typeLabel}。
        起点：${startPoint} ${coords ? `(经纬度: ${coords.longitude}, ${coords.latitude})` : ''}
        条件：${selectedMonth}出行，时长${duration}，交通${transport}，距离${distanceLabel}。
        预算偏好：预算级别为${budgetLabel}，旅行偏好包括${prefLabels}。
        请根据起点位置和预算偏好计算并推荐在规定距离范围内的目的地。
        必须严格按以下格式返回 JSON：
        {
          "title": "目的地名称",
          "intro": "简介内容",
          "reason": "推荐理由及冷门点",
          "weather": {"temp": "气温范围", "desc": "天气状况描述", "tips": "着装/出行建议"},
          "itinerary": [{"day": 1, "title": "主题", "desc": "详情"}],
          "notices": ["注意事项1"],
          "location": {"latitude": 目的地纬度(数字), "longitude": 目的地经度(数字), "address": "详细地址"}
        }`;

        const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'YOUR_DEEPSEEK_API_KEY';
        if (!DEEPSEEK_API_KEY || DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY') {
          return { recommendation: getMockData(typeLabel) };
        }

        const https = require('https');
        const payload = {
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "你是一个旅游专家，只返回 JSON 格式数据。" },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" }
        };

        const postData = Buffer.from(JSON.stringify(payload), 'utf8');

        const aiRes = await new Promise((resolve, reject) => {
          const options = {
            hostname: 'api.deepseek.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
              'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
              'Content-Length': postData.length
            },
            timeout: 50000
          };

          const req = https.request(options, (res) => {
            let chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
              const body = Buffer.concat(chunks).toString('utf8');
              try {
                const json = JSON.parse(body);
                if (res.statusCode !== 200) reject(new Error(`API报错[${res.statusCode}]`));
                else resolve(json);
              } catch(e) { reject(new Error('JSON解析失败')); }
            });
          });
          req.on('error', (e) => reject(e));
          req.write(postData);
          req.end();
        });

        if (aiRes.choices && aiRes.choices[0] && aiRes.choices[0].message) {
          let content = aiRes.choices[0].message.content.trim();
          content = content.replace(/^```json/, '').replace(/```$/, '').trim();
          
          let rawData = JSON.parse(content);
          
          // 2. 增加【健壮适配层】：将 AI 乱跑的键名拉回正轨
          const recommendation = {
            type: typeLabel,
            title: rawData.title || rawData.destination || rawData.name || '推荐方案',
            intro: rawData.intro || rawData.description || '暂无简介',
            reason: rawData.reason || rawData.recommend_reason || (rawData.high_quality_hotel ? rawData.high_quality_hotel.description : '值得一去'),
            weather: rawData.weather || null,
            itinerary: [],
            notices: rawData.notices || rawData.precautions || [],
            location: rawData.location || null
          };

          // 适配行程列表
          const rawItinerary = rawData.itinerary || rawData.daily_itinerary || [];
          recommendation.itinerary = rawItinerary.map(item => ({
            day: item.day || 1,
            title: item.title || item.morning || '行程',
            desc: item.desc || (item.afternoon ? `${item.afternoon} ${item.evening || ''}` : '自由活动')
          }));

          return { recommendation };
        } else {
          throw new Error('AI返回格式不完整');
        }
      }

      case 'addFavorite': return await db.collection('favorites').add({ data: { ...data.recommendation, _openid: OPENID, createTime: db.serverDate() } });
      case 'getFavorites': {
        const res = await db.collection('favorites').where({ _openid: OPENID }).orderBy('createTime', 'desc').get();
        return { list: res.data };
      }
      case 'deleteFavorite': return await db.collection('favorites').doc(data.id).remove();
      case 'getFavoriteById': {
        const res = await db.collection('favorites').doc(data.id).get();
        return { data: res.data };
      }
      case 'reverseGeocoder': {
        const { latitude, longitude } = data;
        // 使用简单的经纬度拼接作为兜底，如果需要精准地名，通常需要接入腾讯地图等第三方逆地理编码API
        // 为了演示和基础可用性，我们可以通过 AI 辅助识别这个经纬度的大致城市，或者返回经纬度
        // 在小程序端，推荐引导用户接入腾讯地图SDK
        return { address: `坐标 (${longitude.toFixed(2)}, ${latitude.toFixed(2)})` };
      }
      default: throw new Error('Unknown action');
    }
  } catch (err) {
    console.error('执行报错:', err);
    return { error: err.message, success: false };
  }
}

function getMockData(type) {
  return {
    type, title: "示例：探秘皖南落羽杉", intro: "环境配置中，这是演示数据。",
    reason: "API KEY尚未生效或配置错误。",
    itinerary: [{ day: 1, title: "出发", desc: "请检查云函数环境变量配置。" }],
    notices: ["提示：确保环境变量名为 DEEPSEEK_API_KEY"]
  };
}
