const assert = require('node:assert/strict')
const { TranslateService } = require('../dist/translate/translate.service')
const { translateContent } = require('../dist/common/localize.util')

async function main() {
  const service = new TranslateService({ get: () => undefined })
  service.translateText = async (text, _from, to) => `${to}:${text}`
  service.translateHTML = service.translateText
  const originalTimer = global.setTimeout
  global.setTimeout = callback => { callback(); return 0 }
  try {
    const input = {
      variant: 'footer', title: 'Câu chuyện', layoutChoice: 'alternate',
      body: ['Đoạn giới thiệu'],
      columns: [{ title: { vi: 'Khám phá' }, links: [{ label: { vi: 'Điểm đến' }, href: '/vi/denmau' }] }],
      items: [{ title: { vi: 'Lượt truy cập' }, category: 'THỐNG KÊ TRUY CẬP', body: { vi: 'Chưa cập nhật' } }],
      images: [{ src: '/uploads/anh.jpg', alt: { vi: 'Ảnh di sản' }, caption: 'Chú thích' }],
      galleryBelow: [{ src: 'https://example.com/anh.jpg', caption: { vi: 'Cổng cổ' } }],
      prefix: { vi: 'Di sản' }, bgImage: '/uploads/nen.jpg',
    }
    const out = await service.translateContentObject(input, 'vi', 'gemini')
    assert.equal(out.title.en, 'en:Câu chuyện')
    assert.equal(out.body[0].ru, 'ru:Đoạn giới thiệu')
    assert.equal(out.columns[0].title.en, 'en:Khám phá')
    assert.equal(out.columns[0].links[0].label.en, 'en:Điểm đến')
    assert.equal(out.columns[0].links[0].href, '/vi/denmau')
    assert.equal(out.items[0].category.en, 'en:THỐNG KÊ TRUY CẬP')
    assert.equal(out.items[0].groupCode, 'stats')
    assert.equal(out.images[0].alt.en, 'en:Ảnh di sản')
    assert.equal(out.images[0].caption.en, 'en:Chú thích')
    assert.equal(out.images[0].src, '/uploads/anh.jpg')
    assert.equal(out.galleryBelow[0].caption.zh, 'zh:Cổng cổ')
    assert.equal(out.prefix.ru, 'ru:Di sản')
    const legacy = await service.translateContentObject({ prefix: 'Di sản' }, 'vi', 'gemini')
    assert.equal(legacy.prefix.en, 'en:Di sản')
    const publicContent = translateContent({ title: {vi:'Di sản',en:''}, pictures:[{src:'/images/anh.jpg',alt:{vi:'Đình',en:'Communal house'}}] }, 'en')
    assert.equal(publicContent.title, 'Di sản')
    assert.equal(publicContent.pictures[0].alt, 'Communal house')
    assert.equal(publicContent.pictures[0].src, '/images/anh.jpg')
    assert.equal(out.bgImage, '/uploads/nen.jpg')
    assert.equal(out.layoutChoice, 'alternate')
    assert.equal(input.items[0].category, 'THỐNG KÊ TRUY CẬP')
    const failingService = new TranslateService({ get: () => undefined })
    const originalFetch = global.fetch
    const originalError = console.error
    try {
      global.fetch = async () => { throw new Error('network unavailable') }
      console.error = () => {}
      await assert.rejects(() => failingService.translateText('Di sản', 'vi', 'en', 'google'), error => error.getStatus() === 503)
      global.fetch = async () => ({ status: 429, ok: false })
      await assert.rejects(() => failingService.translateText('Di sản', 'vi', 'en', 'google'), error => error.getStatus() === 429)
    } finally {
      global.fetch = originalFetch
      console.error = originalError
    }
    console.log('Nested block translation preserves media, URLs, and layout fields')
  } finally {
    global.setTimeout = originalTimer
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
