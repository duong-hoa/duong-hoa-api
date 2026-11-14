const assert = require('node:assert/strict')
const { PagesService } = require('../dist/pages/pages.service')
const { SettingsService } = require('../dist/settings/settings.service')
const { siteChromeMode, siteBlockKind } = require('../dist/common/site-block.util')

async function main() {
  const headerId = '11111111-1111-4111-8111-111111111111', footerId = '22222222-2222-4222-8222-222222222222'
  const header = { id: headerId, pageId: 'page', blockType: 'lusano', sortOrder: 0, isVisible: true, content: { variant: 'header', title: { vi: 'Tên', en: 'Name' }, items: [{ href: '#story' }] }, page: { slug: 'source', title: { vi: 'Mẫu' }, isPublished: false, isTemplate: true } }
  const footer = { ...header, id: footerId, sortOrder: 2, blockType: 'hba', content: { variant: 'footer' } }
  const body = { ...header, id: 'body', sortOrder: 1, blockType: 'split', content: { title: { vi: 'Bài viết' } } }
  const rows = [header, body, footer]
  const saved = new Map()
  let writes = 0
  const db = {
    siteSetting: {
      findMany: async () => [...saved].map(([key, value]) => ({ key, value })),
      upsert: async ({ where, update }) => { writes++; saved.set(where.key, update.value); return update },
    },
    contentBlock: {
      findFirst: async ({ where }) => rows.find(row => row.id === where.id && row.isVisible === where.isVisible) || null,
      findMany: async ({ where }) => rows.filter(row => where.isVisible === undefined || row.isVisible === where.isVisible),
    },
    page: { findFirst: async () => ({ id: 'page', audioUrl: null }) },
    $transaction: async requests => Promise.all(requests),
  }
  const pages = new PagesService(db), settings = new SettingsService(db, pages, {})
  assert.equal(siteChromeMode({ blockId: headerId }), 'block')
  assert.equal(siteBlockKind('lusano', { variant: 'header' }), 'header')
  const candidates = await pages.getSiteBlockCandidates()
  assert.equal(candidates.length, 2)
  assert.equal(candidates[0].page_template, true)
  assert.deepEqual(candidates[0].local_links, ['#story'])
  for (const h of ['none', 'block', 'default']) for (const f of ['none', 'block', 'default']) {
    await settings.setAdminSettings({ header_settings: { mode: h, blockId: headerId }, footer_settings: { mode: f, blockId: footerId } })
    const result = await pages.getSiteBlocks('en')
    assert.deepEqual(result.modes, { header: h, footer: f })
    assert.equal(result.header?.id || null, h === 'block' ? headerId : null)
    assert.equal(result.footer?.id || null, f === 'block' ? footerId : null)
    if (result.header) {
      assert.equal(result.header.content.title, 'Name')
      assert.equal(result.header.source_page_slug, 'source')
      assert.equal(result.header.source_page_published, false)
    }
    assert.deepEqual((await pages.getPublishedPageBlocks('source', 'vi', true)).map(row => row.id), rows.map(row => row.id), 'New clients retain complete page blocks')
    assert.equal((await pages.getPublishedPageBlocks('source', 'vi')).some(row => row.id === headerId), h !== 'block', 'Older clients retain their existing response')
  }
  saved.set('header_settings', { blockId: headerId })
  assert.equal((await pages.getSiteBlocks('vi')).header.id, headerId)
  header.isVisible = false
  assert.equal((await pages.getSiteBlocks('vi')).header, null)
  const before = writes
  await assert.rejects(settings.setAdminSettings({ site_title: { vi: 'Should not save' }, header_settings: { mode: 'block', blockId: headerId } }), /Block header/)
  assert.equal(writes, before, 'Validate all modes before changing any settings')
  await assert.rejects(settings.setAdminSettings({ header_settings: { mode: 'block', blockId: footerId } }), /Block header/)
  await assert.rejects(settings.setAdminSettings({ header_settings: { mode: 'invalid' } }), /Chế độ/)
  await settings.setAdminSettings({ header_settings: { mode: 'none', blockId: headerId } })
  assert.equal((await pages.getSiteBlocks('vi')).header, null)
  console.log('API header/footer: nine modes, stored legacy settings, selected template, hidden/wrong type validation and complete page blocks passed')
}
main().catch(error => { console.error(error); process.exitCode = 1 })
