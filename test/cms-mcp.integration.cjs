const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { createServer } = require('node:http')
const { once } = require('node:events')
const { resolve } = require('node:path')
const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js')
const { generateKeyPair, exportJWK, SignJWT } = require('jose')
const bcrypt = require('bcryptjs')
const { PrismaService } = require('../dist/prisma/prisma.service')
const { PagesService } = require('../dist/pages/pages.service')
const { PresetsService } = require('../dist/presets/presets.service')

function fixtureBlocks() {
  if (process.env.CMS_MCP_HILLBROOK_SOURCE) {
    require('ts-node').register({ transpileOnly: true, skipProject: true, compilerOptions: { module: 'commonjs', target: 'es2022' } })
    const { HILLBROOK_OPTIONS } = require(resolve(process.env.CMS_MCP_HILLBROOK_SOURCE))
    return HILLBROOK_OPTIONS.map((block, index) => ({
      block_type: block.type, label: block.label, content: structuredClone(block.initialContent), sort_order: (index + 1) * 10,
    }))
  }
  return ['header', 'hero', 'intro', 'video', 'features', 'banner', 'services', 'map', 'activities', 'banner', 'gallery', 'contact', 'footer']
    .map((variant, index) => ({
      block_type: 'hillbrook',
      label: variant,
      sort_order: (index + 1) * 10,
      content: {
        variant, title: { vi: 'Hillbrook thử nghiệm', en: 'Hillbrook review', ru: 'Hillbrook', zh: 'Hillbrook' },
        image: variant === 'intro' ? '/references/hillbrook/map.webp' : '/references/hillbrook/hero.webp',
        titleStyle: { fontSize: 48, color: '#eee8df' },
        motionEnabled: true, animationDuration: 900,
        items: [{ title: { vi: 'Mục nội dung', en: 'Item' }, image: '/references/hillbrook/map.webp', href: '#gallery' }],
      },
    }))
}

async function main() {
  // Prevent accidental use against a configured development or production DB.
  const dbUrl = new URL(process.env.DATABASE_URL || '')
  assert.equal(dbUrl.hostname, '127.0.0.1')
  assert.ok(['55432/page_test', '55487/duong_hoa_mcp_test'].includes(dbUrl.port + dbUrl.pathname), 'Requires the dedicated test database')
  const keep = process.argv.includes('--keep-preview')
  assert.ok(!keep || dbUrl.port === '55487', 'Preview fixtures must use the local disposable database')
  const db = new PrismaService()
  const pages = new PagesService(db)
  const presets = new PresetsService(db)
  const pageIds = []
  const presetIds = []
  const mediaIds = []
  const accountIds = []
  const kept = new Set()
  const clients = []
  let app, jwksServer
  const suffix = randomUUID().slice(0, 8)
  const agentKey = 'primary-' + suffix

  try {
    const template = await pages.createPageTemplate({ name: 'Hillbrook — 13 block · QA ' + suffix, blocks: fixtureBlocks() })
    pageIds.push(template.id)
    const privatePage = await pages.createPage({ slug: 'private-' + suffix, title: { vi: 'Hillbrook ngoài phạm vi' } })
    pageIds.push(privatePage.id)
    const preset = await presets.create({ kind: 'page', scope: template.id, source_page_id: template.id, name: 'Hillbrook QA preset' })
    presetIds.push(preset.id)
    const img = await db.media.create({ data: { filename: 'pool-' + suffix + '.webp', storagePath: 'references/hillbrook/pool.webp', url: '/references/hillbrook/pool.webp', fileType: 'image' } })
    mediaIds.push(img.id)
    const password = 'local-cms-mcp-test-only'
    const passwordHash = await bcrypt.hash(password, 4)
    const adminEmail = 'admin-' + suffix + '@local.invalid'
    const editorEmail = 'edit-' + suffix + '@local.invalid'
    const admin = await db.adminUser.create({ data: { email: adminEmail, displayName: 'QA admin', role: 'admin', passwordHash } })
    const editor = await db.adminUser.create({ data: { email: editorEmail, displayName: 'QA editor', role: 'edit', passwordHash } })
    accountIds.push(admin.id, editor.id)

    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const publicJwk = { ...await exportJWK(publicKey), kid: 'qa-signing-key', alg: 'RS256', use: 'sig' }
    jwksServer = createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ keys: [publicJwk] }))
    }).listen(0, '127.0.0.1')
    await once(jwksServer, 'listening')
    const issuer = 'http://127.0.0.1:' + jwksServer.address().port
    // The audience is the canonical endpoint identity; the in-process client
    // reaches it through the randomly allocated local test listener.
    const resource = 'http://127.0.0.1:4107/mcp'
    process.env.NODE_ENV = 'test'
    process.env.JWT_SECRET = randomUUID()
    process.env.CMS_MCP_ENABLED = 'true'
    process.env.CMS_MCP_OAUTH_ISSUER = issuer
    process.env.CMS_MCP_OAUTH_JWKS_URL = issuer + '/jwks'
    process.env.CMS_MCP_RESOURCE_URL = resource
    process.env.CMS_MCP_AGENTS = JSON.stringify([
      { key: agentKey, subject: 'qa-subject', clientId: 'qa-client', scopes: ['cms:read', 'cms:draft', 'cms:media', 'cms:review'], sourcePageIds: [template.id, privatePage.id] },
      { key: 'reader', subject: 'qa-reader', clientId: 'qa-reader-client', scopes: ['cms:read'], sourcePageIds: [template.id] },
    ])

    const { NestFactory } = require('@nestjs/core')
    const { ValidationPipe } = require('@nestjs/common')
    const { AppModule } = require('../dist/app.module')
    app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] })
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
    await app.listen(0, '127.0.0.1')
    const origin = await app.getUrl()
    const token = (scopes, overrides = {}) => new SignJWT({ scope: scopes, client_id: overrides.clientId || 'qa-client' })
      .setProtectedHeader({ alg: 'RS256', kid: 'qa-signing-key', typ: 'at+jwt' })
      .setIssuer(issuer).setSubject(overrides.subject || 'qa-subject')
      .setAudience(overrides.audience || resource).setIssuedAt()
      .setExpirationTime(overrides.exp || '5m').sign(privateKey)
    const fullToken = await token('cms:read cms:draft cms:media cms:review')

    async function http(path, options = {}) {
      const { bearer, body, headers, ...init } = options
      return fetch(origin + path, {
        ...init,
        headers: { ...headers, ...(bearer ? { Authorization: 'Bearer ' + bearer } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    }

    async function connect(bearer) {
      const client = new Client({ name: 'cms-mcp-test', version: '1.0.0' })
      clients.push(client)
      await client.connect(new StreamableHTTPClientTransport(new URL(origin + '/mcp'), {
        requestInit: { headers: { Authorization: 'Bearer ' + bearer } },
      }))
      return client
    }

    async function call(client, name, args, errorStatus) {
      const output = await client.callTool({ name, arguments: args })
      if (errorStatus) {
        assert.equal(output.isError, true, name + ' must return an error')
        assert.equal(JSON.parse(output.content[0].text).status, errorStatus, output.content[0].text)
        return
      }
      assert.ok(!output.isError, name + ' failed: ' + JSON.stringify(output.content))
      return output.structuredContent
    }

    const metadata = await (await http('/.well-known/oauth-protected-resource/mcp')).json()
    assert.equal(metadata.resource, resource)
    assert.deepEqual(metadata.authorization_servers, [issuer])
    const missing = await http('/mcp', { method: 'POST', body: {} })
    assert.equal(missing.status, 401)
    assert.match(missing.headers.get('www-authenticate'), /oauth-protected-resource\/mcp/)
    assert.equal((await http('/mcp', { method: 'POST', bearer: fullToken, body: {}, headers: { Origin: 'https://foreign.invalid' } })).status, 403)
    for (const bad of [
      await token('cms:read', { audience: issuer }),
      await token('cms:read', { audience: [resource, issuer] }),
      await token('cms:read', { clientId: 'other-client' }),
      await token('cms:read', { exp: '1 second ago' }),
    ]) assert.equal((await http('/mcp', { method: 'POST', bearer: bad, body: {} })).status, 401)
    assert.equal((await http('/mcp', { method: 'POST', bearer: await token('cms:media'), body: {} })).status, 403)

    const full = await connect(fullToken)
    const reader = await connect(await token('cms:read cms:draft cms:media cms:review', { subject: 'qa-reader', clientId: 'qa-reader-client' }))
    const editorWithoutMedia = await connect(await token('cms:read cms:draft'))
    assert.equal((await full.listTools()).tools.length, 9)
    assert.deepEqual((await reader.listTools()).tools.map(tool => tool.name).sort(), [
      'cms_get_block', 'cms_get_page', 'cms_list_presets', 'cms_search_pages',
    ])
    const found = await call(full, 'cms_search_pages', { query: 'hillbrook' })
    assert.equal(found.items.length, 1)
    assert.equal(found.items[0].blockCount, 13)
    await call(full, 'cms_get_page', { pageId: privatePage.id }, 404)
    const original = await call(full, 'cms_get_page', { pageId: template.id })
    assert.equal(original.blocks.length, 13)
    const detail = await call(full, 'cms_list_presets', { pageId: template.id })
    assert.equal(detail.items[0].id, preset.id)
    const media = await call(full, 'cms_list_media', { query: img.filename })
    assert.equal(media.items[0].id, img.id)

    const createInput = { templateId: template.id, slug: 'hillbrook-mcp-' + suffix, requestId: randomUUID(), title: 'Hillbrook · Nghiệm thu MCP' }
    const drafts = await Promise.all([call(full, 'cms_create_draft', createInput), call(full, 'cms_create_draft', createInput)])
    assert.equal(drafts[0].id, drafts[1].id)
    assert.deepEqual(drafts.map(draft => draft.replayed).sort(), [false, true])
    assert.equal(drafts[0].revision, drafts[1].revision)
    const draft = drafts[0]
    pageIds.push(draft.id)
    await call(full, 'cms_create_draft', { ...createInput, slug: 'different-' + suffix }, 409)
    await call(reader, 'cms_get_page', { pageId: draft.id }, 404)
    const getDraft = () => call(full, 'cms_get_page', { pageId: draft.id })
    let current = await getDraft()
    assert.equal(current.blockCount, 13)
    assert.notEqual(current.blocks[1].id, original.blocks[1].id)
    const hero = current.blocks.find(block => block.variant === 'hero')
    const heroDetail = await call(full, 'cms_get_block', { pageId: draft.id, blockId: hero.id })
    assert.ok(heroDetail.editableFields.some(field => field.kind === 'image' && field.path[0] === 'image'))
    assert.ok(heroDetail.editableFields.some(field => field.kind === 'text' && field.path[0] === 'title'))
    assert.ok(!heroDetail.editableFields.some(field => field.path[0] === 'body' || field.path[0] === 'items'), 'Unused hero fields are not suggested')
    const update = {
      pageId: draft.id, blockId: hero.id, expectedRevision: current.revision,
      changes: [
        { kind: 'text', path: ['title'], locale: 'vi', value: 'Hillbrook · Tiêu đề nghiệm thu MCP' },
        { kind: 'media', path: ['image'], source: { kind: 'library', mediaId: img.id } },
      ],
    }
    await call(editorWithoutMedia, 'cms_update_draft_block', update, 403)
    assert.equal((await getDraft()).revision, current.revision, 'A denied batch makes no partial edits')
    await call(full, 'cms_update_draft_block', { ...update, changes: [{ kind: 'text', path: ['linkAnchor'], locale: 'vi', value: 'wrong' }] }, 400)
    await call(full, 'cms_update_draft_block', { ...update, pageId: template.id, blockId: original.blocks[1].id }, 403)
    const saved = await call(full, 'cms_update_draft_block', update)
    assert.equal(saved.changes.length, 2)
    await call(full, 'cms_update_draft_block', update, 409)
    const after = await call(full, 'cms_get_block', { pageId: draft.id, blockId: hero.id })
    assert.deepEqual(after.content, {
      ...heroDetail.content, title: { ...heroDetail.content.title, vi: update.changes[0].value }, image: img.url,
    }, 'All other block fields are preserved')
    assert.equal((await call(full, 'cms_get_page', { pageId: template.id })).revision, original.revision)

    const order = current.blocks.map(block => block.id)
    await call(full, 'cms_reorder_draft_blocks', { pageId: draft.id, expectedRevision: saved.revision, blockIds: order.slice(1) }, 400)
    const reversed = await call(full, 'cms_reorder_draft_blocks', { pageId: draft.id, expectedRevision: saved.revision, blockIds: [...order].reverse() })
    await call(full, 'cms_reorder_draft_blocks', { pageId: draft.id, expectedRevision: reversed.revision, blockIds: order })
    current = await getDraft()
    assert.deepEqual(current.blocks.map(block => block.id), order)

    const login = async email => {
      const reply = await http('/auth/login', { method: 'POST', body: { email, password } })
      assert.ok(reply.ok)
      return (await reply.json()).accessToken
    }
    const adminToken = await login(adminEmail)
    const editorToken = await login(editorEmail)
    const publish = (bearer, revision) => http('/admin/pages/' + draft.id + '/agent-review/publish', { method: 'POST', bearer, body: { revision } })
    const privateBlocks = await http('/public/pages/' + draft.slug + '/blocks')
    assert.ok(privateBlocks.status === 404 || /^\s*(?:null)?\s*$/.test(await privateBlocks.text()))
    await call(full, 'cms_submit_draft_review', { pageId: draft.id, expectedRevision: current.revision, note: 'Kiểm tra chữ và ảnh.' })
    assert.equal((await publish(fullToken, current.revision)).status, 401)
    assert.equal((await publish(editorToken, current.revision)).status, 403)
    assert.equal((await http('/admin/pages/' + draft.id, { method: 'PATCH', bearer: adminToken, body: { is_published: true } })).status, 409)

    const adminEdit = await http('/admin/blocks/' + hero.id, { method: 'PATCH', bearer: adminToken, body: { label: 'Hero do CMS chỉnh' } })
    assert.ok(adminEdit.ok)
    assert.equal((await publish(adminToken, current.revision)).status, 409, 'New editor edits invalidate old approval')
    current = await getDraft()
    assert.equal(current.reviewStatus, 'stale')
    await call(full, 'cms_submit_draft_review', { pageId: draft.id, expectedRevision: current.revision })
    const published = await publish(adminToken, current.revision)
    assert.ok(published.ok, await published.text())
    await call(full, 'cms_update_draft_block', { ...update, expectedRevision: current.revision }, 403)
    const publicBlocks = await (await http('/public/pages/' + draft.slug + '/blocks')).json()
    assert.equal(publicBlocks.length, 13)
    const events = await db.activityLog.findMany({ where: { targetTable: 'cms_agent_drafts', targetId: draft.id }, orderBy: { createdAt: 'asc' } })
    assert.deepEqual(events.map(event => event.action), [
      'mcp_create_draft', 'mcp_update_block', 'mcp_reorder_blocks', 'mcp_reorder_blocks',
      'mcp_submit_review', 'mcp_submit_review', 'mcp_approve_and_publish',
    ])
    assert.equal(events[1].userEmail, 'mcp:' + agentKey)
    assert.equal(events.at(-1).userId, admin.id)

    const presetDraft = await call(full, 'cms_create_draft', {
      templateId: template.id, presetId: preset.id, slug: 'hillbrook-mcp-preset-' + suffix, requestId: randomUUID(),
    })
    pageIds.push(presetDraft.id)
    assert.equal(presetDraft.blockCount, 13)
    assert.ok(await db.cmsPresetPageBaseline.findUnique({ where: { pageId: presetDraft.id } }))
    const fromPreset = await call(full, 'cms_get_page', { pageId: presetDraft.id })
    const targetHero = fromPreset.blocks.find(block => block.variant === 'hero')
    const sourceImage = original.blocks.find(block => block.variant === 'intro')
    const sourceFields = await call(full, 'cms_get_block', { pageId: template.id, blockId: sourceImage.id })
    const reuse = await call(full, 'cms_update_draft_block', {
      pageId: presetDraft.id, blockId: targetHero.id, expectedRevision: fromPreset.revision,
      changes: [{ kind: 'media', path: ['image'], source: { kind: 'block', pageId: template.id, blockId: sourceImage.id, path: ['image'] } }],
    })
    assert.equal(reuse.changes[0].after, sourceFields.content.image)

    if (keep) {
      const ready = await call(full, 'cms_get_page', { pageId: presetDraft.id })
      const block = ready.blocks.find(item => item.variant === 'hero')
      const edited = await call(full, 'cms_update_draft_block', { ...update, pageId: presetDraft.id, blockId: block.id, expectedRevision: ready.revision })
      await call(full, 'cms_submit_draft_review', { pageId: presetDraft.id, expectedRevision: edited.revision, note: 'Nghiệm thu local · Kiểm tra tiêu đề và ảnh hồ bơi.' })
      kept.add(presetDraft.id)
      kept.add(admin.id)
      console.log(JSON.stringify({ localPreviewSlug: presetDraft.slug, localAdminEmail: adminEmail }))
    }

    console.log('CMS MCP: authenticated HTTP, scopes and source isolation, 13 blocks, idempotent clone, preset, media, locale merge, reorder, revision conflict, CMS approval, public readback and audit passed')
  } finally {
    await Promise.allSettled(clients.map(client => client.close()))
    if (app) await app.close()
    if (jwksServer) await new Promise(resolve => jwksServer.close(resolve))
    const cleanupPages = pageIds.filter(id => !kept.has(id))
    await db.activityLog.deleteMany({ where: { targetTable: 'cms_agent_drafts', targetId: { in: cleanupPages } } })
    await db.cmsPreset.deleteMany({ where: { id: { in: presetIds } } })
    await db.page.deleteMany({ where: { id: { in: cleanupPages } } })
    await db.media.deleteMany({ where: { id: { in: mediaIds } } })
    await db.adminUser.deleteMany({ where: { id: { in: accountIds.filter(id => !kept.has(id)) } } })
    await db.$disconnect()
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
