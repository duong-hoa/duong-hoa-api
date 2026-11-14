// Run after `npm run build`. Covers the public CMS payload, including nested media.
const assert = require('node:assert/strict')
const { translateContent } = require('../dist/common/localize.util')

const source = {
  title: { vi: 'Di sản Dương Hòa', en: '   ' },
  description: { vi: 'Giới thiệu', en: 'Introduction' },
  pictures: [{ src: 'https://example.com/photo.jpg', alt: { vi: 'Cổng di tích', en: '' }, tone: 'grayscale' }],
  editorialLayout: 'right', thumbnailRadius: 0,
}
const result = translateContent(source, 'en')
assert.equal(result.title, 'Di sản Dương Hòa')
assert.equal(result.description, 'Introduction')
assert.equal(result.pictures[0].alt, 'Cổng di tích')
assert.equal(result.pictures[0].src, source.pictures[0].src)
assert.equal(result.pictures[0].tone, 'grayscale')
assert.equal(result.editorialLayout, 'right')
assert.equal(result.thumbnailRadius, 0)
assert.equal(source.title.en, '   ')
const arrays = { body: { vi: ['Một', 'Hai'], en: [], ru: [], zh: [] }, nested: { vi: [{ title: { vi: 'Ảnh', en: 'Photo' } }], en: [] } }
for (const locale of ['en', 'ru', 'zh']) assert.deepEqual(translateContent(arrays, locale).body, ['Một', 'Hai'])
assert.equal(translateContent(arrays, 'en').nested[0].title, 'Photo')
assert.deepEqual(arrays.body.en, [])
console.log('Localized CMS content falls back for blank translations')
