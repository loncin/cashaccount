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
        const { recommendType, selectedMonth, duration, transport, distance } = data;
        
        const typeMap = {
          'destination': '冷门目的地',
          'flight': '冷门航班',
          'hotel': '冷门酒店',
          'restaurant': '冷门餐厅',
          'attraction': '冷门景点'
        };
        
        const prompt = `你是一个专业的旅行规划师。请根据以下条件推荐一个${typeMap[recommendType] || '冷门目的地'}：
        - 出行月份：${selectedMonth}
        - 旅行时长：${duration}
        - 交通方式：${transport}
        - 路程距离：${distance}
        
        要求：
        1. 目的地必须是真正冷门、小众、避开人流的，但景色或体验极佳。
        2. 如果是目的地推荐，请务必推荐 1-2 家高品质、有特色、评价极好的酒店或民宿。
        3. 请根据旅行时长规划每日详细行程。
        4. 注意事项应包含当地气候、民俗禁忌、必备物品等。
        
        请严格按以下 JSON 格式返回，不要包含任何其他文字描述：
        {
          "type": "${typeMap[recommendType]}",
          "title": "推荐标题（如：探秘甘南秘境：扎尕那石城）",
          "intro": "一段引人入胜的简介",
          "reason": "推荐理由，突出为什么值得去以及为什么冷门",
          "itinerary": [
            {"day": 1, "title": "第一天主题", "desc": "具体行程描述"},
            {"day": 2, "title": "第二天主题", "desc": "具体行程描述"}
          ],
          "notices": ["注意事项1", "注意事项2"]
        }`;

        try {
          const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'YOUR_DEEPSEEK_API_KEY';
          
          if (DEEPSEEK_API_KEY === 'YOUR_DEEPSEEK_API_KEY') {
            return {
              recommendation: {
                type: typeMap[recommendType],
                title: "模拟推荐：浙西川藏线 - 宁国落羽杉林",
                intro: "位于安徽宁国的方塘乡，有一片如童话般的落羽杉林，深秋时节万山红遍。",
                reason: "避开热门景点，路况适合自驾，景色具有极强的视觉冲击力，且周边民宿品质极高。",
                itinerary: [
                  { day: 1, title: "抵达宁国，入驻山间民宿", desc: "从周边城市出发，抵达方塘乡。下午在落羽杉林划船，傍晚享受民宿私汤。" },
                  { day: 2, title: "穿越皖南川藏线", desc: "自驾行驶在著名的‘桃岭公路’，体验 S 型弯道的刺激，俯瞰群山。" }
                ],
                notices: [
                  "落羽杉最佳观赏期为 11 月中下旬",
                  "山路崎岖，自驾需注意安全",
                  "山区温差大，请带好保暖衣物"
                ]
              }
            };
          }

          const https = require('https');
          const postData = JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: "你是一个专业的旅行助手，只返回 JSON 格式的内容。" },
              { role: "user", content: prompt }
            ],
            response_format: { type: "json_object" }
          });

          const options = {
            hostname: 'api.deepseek.com',
            port: 443,
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
              'Content-Length': postData.length
            },
            timeout: 60000
          };

          const aiRes = await new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
              let body = '';
              res.on('data', (d) => body += d);
              res.on('end', () => {
                try { resolve(JSON.parse(body)); } catch(e) { reject(e); }
              });
            });
            req.on('error', (e) => reject(e));
            req.write(postData);
            req.end();
          });

          const content = aiRes.choices[0].message.content;
          return { recommendation: JSON.parse(content) };
        } catch (aiErr) {
          console.error('DeepSeek 调用失败', aiErr);
          throw aiErr;
        }
      }

      case 'addFavorite': {
        const { recommendation } = data
        const res = await db.collection('favorites').add({
          data: {
            ...recommendation,
            _openid: OPENID,
            createTime: db.serverDate()
          }
        })
        return res
      }

      case 'getFavorites': {
        const res = await db.collection('favorites')
          .where({ _openid: OPENID })
          .orderBy('createTime', 'desc')
          .get()
        return { list: res.data }
      }

      case 'deleteFavorite': {
        const { id } = data
        const res = await db.collection('favorites').doc(id).remove()
        return res
      }

      case 'getFavoriteById': {
        const { id } = data
        const res = await db.collection('favorites').doc(id).get()
        return { data: res.data }
      }

      default:
        throw new Error('Unknown action')
    }
  } catch (err) {
    console.error(err)
    return { error: err.message }
  }
}
