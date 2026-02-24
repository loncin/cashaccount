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
        const { recommendType, selectedMonth, duration, transport, distance, customDistance } = data;
        const typeMap = {
          'destination': '冷门目的地', 'flight': '冷门航班', 'hotel': '冷门酒店', 
          'restaurant': '冷门餐厅', 'attraction': '冷门景点'
        };
        
        const typeLabel = typeMap[recommendType] || '冷门目的地';
        
        const distanceLabel = customDistance ? `${customDistance}km以内` : (distance === 'short' ? '200km以内' : (distance === 'medium' ? '200-500km' : (distance === 'long' ? '500-800km' : '800km以上')));
        
        // 1. 更加明确的 Prompt，强制指定键名
        const prompt = `你是一个专业的旅游规划师。请推荐一个${typeLabel}。条件：${selectedMonth}出行，时长${duration}，交通${transport}，距离${distanceLabel}。
        必须严格按以下格式返回 JSON：
        {
          "title": "目的地名称",
          "intro": "简介内容",
          "reason": "推荐理由及冷门点",
          "itinerary": [{"day": 1, "title": "主题", "desc": "详情"}],
          "notices": ["注意事项1"]
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
            itinerary: [],
            notices: rawData.notices || rawData.precautions || []
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
