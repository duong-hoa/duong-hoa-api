const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { PrismaService } = require('../dist/prisma/prisma.service')
const { PagesService } = require('../dist/pages/pages.service')
const { PresetsService } = require('../dist/presets/presets.service')
const { remapCmsLinks } = require('../dist/common/cms-link.util')

async function main() {
  const url = new URL(process.env.DATABASE_URL || '')
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(url.port, '55432'); assert.equal(url.pathname, '/page_test')
  const db = new PrismaService(), pages = new PagesService(db), presets = new PresetsService(db), ids = [], presetIds = []
  try {
    const source = await pages.createPage({ slug: `qa-link-${randomUUID()}`, title: { vi: 'Trang liên kết thử' }, is_published: false })
    ids.push(source.id)
    const one = await pages.createBlock({ page_id: source.id, block_type: 'editorial_project', label: 'Câu chuyện đã đặt tên', content: { title: { vi: 'Tên công khai khác tên quản lý' }, navigation: [{ label: 'Câu chuyện', href: '#story' }] } })
    const two = await pages.createBlock({ page_id: source.id, block_type: 'hillbrook', sort_order: 10, label: 'Thư viện ảnh', content: { variant: 'gallery' } })
    const content = { navigation: [{ href: `#${two.id}` }, { href: `#editorial-${one.id}-gallery` }, { href: `/en/${source.slug}?tab=1#${two.id}` }, { href: '/vi/trang-khac#khong-doi' }, { href: 'https://example.test/other#keep' }, { href: '#story' }], title: { vi: `#${two.id}` }, image: `/vi/${source.slug}#${two.id}`, buttonHref: `/${source.slug}#${one.id}` }
    await pages.updateBlock(one.id, { content })
    await pages.updatePage(source.id, { sub_nav: [{ anchor: two.id, label: { vi: 'Hình ảnh' } }] })
    const assertCopy = async copy => {
      const loaded = await pages.getAdminPageBySlug(copy.slug), [a,b] = loaded.blocks
      assert.notEqual(a.id, one.id); assert.notEqual(b.id, two.id)
      assert.equal(a.label, one.label)
      assert.equal(a.content.navigation[0].href, `#${b.id}`)
      assert.equal(a.content.navigation[1].href, `#editorial-${a.id}-gallery`)
      assert.equal(a.content.navigation[2].href, `/en/${copy.slug}?tab=1#${b.id}`)
      assert.equal(a.content.navigation[3].href, content.navigation[3].href)
      assert.equal(a.content.navigation[4].href, content.navigation[4].href)
      assert.equal(a.content.navigation[5].href, '#story')
      assert.equal(a.content.buttonHref, `/${copy.slug}#${a.id}`)
      assert.deepEqual(a.content.title, content.title); assert.equal(a.content.image, content.image)
      assert.equal(loaded.page.sub_nav[0].anchor, b.id)
      assert.equal(loaded.page.is_published, false)
      return loaded
    }
    const duplicate = await pages.duplicatePage(source.id, { slug: `qa-copy-${randomUUID()}` }); ids.push(duplicate.id)
    await assertCopy(duplicate)
    const template = await pages.createPageTemplate({ name: 'QA named targets', source_page_id: source.id }); ids.push(template.id)
    await assertCopy(template)
    const clone = await pages.clonePageTemplate(template.id, 'QA clone'); ids.push(clone.id)
    await assertCopy(clone)
    const used = await pages.usePageTemplate(clone.id, { slug: `qa-used-${randomUUID()}` }); ids.push(used.id)
    await assertCopy(used)
    const preset = await presets.create({ kind: 'page', scope: template.id, source_page_id: template.id, name: 'QA linked page preset' }); presetIds.push(preset.id)
    const fromPreset = await presets.createPage(preset.id, { slug: `qa-preset-${randomUUID()}`, source_template_id: template.id }); ids.push(fromPreset.id)
    await assertCopy(fromPreset)
    await presets.resetPage(fromPreset.id)
    await assertCopy(fromPreset)
    const blockCopy = await pages.createBlock({ source_block_id: one.id, page_id: source.id, block_type: one.block_type, content, label: `${one.label} (bản sao)` })
    assert.equal(blockCopy.content.navigation[0].href, `#${two.id}`, 'Copying one block keeps links to its siblings')
    assert.equal(blockCopy.content.navigation[1].href, `#editorial-${blockCopy.id}-gallery`)
    await pages.updateBlock(two.id, { label: 'Tên mới sau khi liên kết' })
    assert.equal((await pages.getAdminPageBySlug(source.slug)).blocks.find(b => b.id === one.id).content.navigation[0].href, `#${two.id}`)
    const before = structuredClone(content)
    remapCmsLinks(content, { blockIds: new Map([[one.id, randomUUID()]]), sourceSlug: source.slug, targetSlug: 'new' })
    assert.deepEqual(content, before, 'Remapping does not mutate source JSON')
    console.log('Named CMS targets: page/template duplicate/use, editorial sections, block self/sibling links, locale paths, subnav and rename stability passed')
  } finally {
    await db.cmsPreset.deleteMany({ where: { id: { in: presetIds } } })
    await db.page.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
