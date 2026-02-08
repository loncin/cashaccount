const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { fileId } = event
  
  if (!fileId) {
    return {
      code: -1,
      message: '缺少 fileId 参数',
      items: []
    }
  }
  
  try {
    const result = await cloud.openapi.ocr.printedText({
      imgUrl: fileId
    })
    return {
      code: 0,
      message: 'success',
      ...result
    }
  } catch (err) {
    console.error('OCR 识别失败:', err)
    return {
      code: -1,
      message: err.message || 'OCR 识别失败',
      error: err,
      items: []
    }
  }
}
