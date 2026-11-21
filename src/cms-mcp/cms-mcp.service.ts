import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { ContentBlock, Page, Prisma } from '@prisma/client'
import { createHash } from 'node:crypto'
import type { AuthUser } from '../auth/auth.service'
import { blockObject, namedBlockAnchor } from '../common/block-navigation.util'
import { lockPageForWrite } from '../pages/page-write-lock'
import { PagesService } from '../pages/pages.service'
import { PresetsService } from '../presets/presets.service'
import { PrismaService } from '../prisma/prisma.service'
import type { CmsMcpAgent } from './cms-mcp-auth'
import { describeBlockFields, editBlockText, getBlockField, mediaKindForUrl, type BlockChange } from './cms-mcp-fields'

const auditTarget = 'cms_agent_drafts'
const snapshotInclude = {
  agentDraft: true,
  blocks: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.PageInclude
type Snapshot = Prisma.PageGetPayload<{ include: typeof snapshotInclude }>
type Db = Prisma.TransactionClient

type Window = { offset: number; limit: number }
type CreateDraft = { templateId: string; presetId?: string; slug: string; title?: string; requestId: string }
type DraftInput = { pageId: string; expectedRevision: string }
type FieldDiff = { path: Array<string | number>; locale?: string; before: unknown; after: unknown }

function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, child]) => [key, canonical(child)]))
  }
  return value
}

function revision(value: unknown) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
}

function pageRevision({ agentDraft: _agentDraft, ...page }: Snapshot) {
  return revision(page)
}

function verifyRevision(page: Snapshot, expected: string) {
  const current = pageRevision(page)
  if (current !== expected) throw new ConflictException('Trang đã thay đổi. Hãy đọc lại trang và xem phiên bản mới.')
  return current
}

function adminPath(slug: string) {
  return '/admin/pages/' + encodeURIComponent(slug)
}

function pageSummary(page: Page) {
  return {
    id: page.id, slug: page.slug, title: page.title, name: page.templateName,
    status: page.isTemplate ? 'template' : page.isPublished ? 'published' : 'draft',
    categoryId: page.categoryId, sortOrder: page.sortOrder, updatedAt: page.updatedAt,
    adminPath: adminPath(page.slug),
    publicPath: page.isPublished ? '/vi/' + encodeURIComponent(page.slug) : null,
  }
}

function blockSummary(block: ContentBlock) {
  const content = blockObject(block.content)
  return {
    id: block.id, type: block.blockType, label: block.label, title: content.title ?? null,
    variant: typeof content.variant === 'string' ? content.variant : null,
    anchor: namedBlockAnchor(block.content, block.blockType) || null,
    visible: block.isVisible, sortOrder: block.sortOrder, updatedAt: block.updatedAt,
  }
}

function readScope(agent: CmsMcpAgent): Prisma.PageWhereInput {
  return { OR: [
    { id: { in: agent.sourcePageIds }, OR: [{ isTemplate: true }, { isPublished: true }] },
    { agentDraft: { agentKey: agent.key } },
  ] }
}

function slice<T>(rows: T[], { offset, limit }: Window) {
  return { items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null }
}

function statusFor(page: Snapshot, current: string) {
  const draft = page.agentDraft
  if (draft?.publishedAt) return 'published'
  if (!draft?.submittedRevision) return 'draft'
  return draft.submittedRevision === current ? 'pending' : 'stale'
}

async function readSnapshot(db: Db, pageId: string, agent?: CmsMcpAgent) {
  const page = await db.page.findFirst({
    where: { id: pageId, ...(agent ? readScope(agent) : {}) },
    include: snapshotInclude,
  })
  if (!page) throw new NotFoundException('Không tìm thấy trang trong phạm vi được cấp.')
  return page
}

async function writableDraft(tx: Db, agent: CmsMcpAgent, pageId: string) {
  await lockPageForWrite(tx, pageId)
  await tx.$queryRaw`SELECT id FROM pages WHERE id = ${pageId}::uuid FOR UPDATE`
  const page = await readSnapshot(tx, pageId, agent)
  if (page.agentDraft?.agentKey !== agent.key || page.agentDraft.publishedAt || page.isPublished || page.isTemplate) {
    throw new ForbiddenException('Agent chỉ có thể chỉnh bản nháp riêng chưa từng xuất bản.')
  }
  return page
}

function json(value: unknown) {
  return value as Prisma.InputJsonValue
}

async function audit(tx: Db, actor: { id?: string; label: string }, action: string, page: Page, change: unknown) {
  await tx.activityLog.create({
    data: {
      userId: actor.id, userEmail: actor.label, action, targetTable: auditTarget, targetId: page.id,
      targetName: page.slug, newData: json(change),
    },
  })
}

function agentActor(agent: CmsMcpAgent) {
  return { label: 'mcp:' + agent.key }
}

function cleanDiff(diffs: FieldDiff[]) {
  return diffs.filter(diff => diff.before !== diff.after)
}

@Injectable()
export class CmsMcpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pages: PagesService,
    private readonly presets: PresetsService,
  ) {}

  async listPages(agent: CmsMcpAgent, input: Window & { kind: 'all' | 'template' | 'published' | 'draft'; query?: string }) {
    const { kind, query, offset, limit } = input
    const state: Prisma.PageWhereInput = kind === 'template' ? { isTemplate: true }
      : kind === 'published' ? { isPublished: true, isTemplate: false }
      : kind === 'draft' ? { isPublished: false, isTemplate: false }
      : {}
    const search: Prisma.PageWhereInput = query ? { OR: [
      { slug: { contains: query, mode: 'insensitive' } },
      { templateName: { contains: query, mode: 'insensitive' } },
      ...['vi', 'en', 'ru', 'zh'].map(lang => ({ title: { path: [lang], string_contains: query, mode: 'insensitive' as const } })),
    ] } : {}
    const rows = await this.prisma.page.findMany({
      where: { AND: [readScope(agent), state, search] },
      include: { _count: { select: { blocks: true } } },
      orderBy: { slug: 'asc' }, skip: offset, take: limit + 1,
    })
    return slice(rows.map(row => ({ ...pageSummary(row), blockCount: row._count.blocks })), input)
  }

  async getPage(agent: CmsMcpAgent, pageId: string, window: Window) {
    const page = await this.prisma.$transaction(tx => readSnapshot(tx, pageId, agent), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    })
    const current = pageRevision(page)
    return {
      ...pageSummary(page), description: page.description, seoImage: page.seoImage, audioUrl: page.audioUrl,
      subNav: page.subNav, revision: current, blockCount: page.blocks.length,
      blocks: page.blocks.slice(window.offset, window.offset + window.limit).map(blockSummary),
      nextOffset: window.offset + window.limit < page.blocks.length ? window.offset + window.limit : null,
      reviewStatus: page.agentDraft?.agentKey === agent.key ? statusFor(page, current) : null,
    }
  }

  async getBlock(agent: CmsMcpAgent, input: { pageId: string; blockId: string; offset: number; limit: number }) {
    const block = await this.prisma.contentBlock.findFirst({
      where: { id: input.blockId, pageId: input.pageId, page: readScope(agent) },
    })
    if (!block) throw new NotFoundException('Không tìm thấy block trong phạm vi được cấp.')
    const compact = Buffer.byteLength(JSON.stringify(block.content)) > 256_000
    const fields = describeBlockFields(block.blockType, block.content, input.offset, input.limit)
    return {
      ...blockSummary(block), content: compact ? null : block.content, contentOmitted: compact,
      editableFields: fields.fields.map(field => {
        const { value } = getBlockField(block.blockType, block.content, field.path)
        return { ...field, value: Buffer.byteLength(JSON.stringify(value)) <= 16_000 ? value : null }
      }),
      nextOffset: fields.nextOffset,
    }
  }

  async listPresets(agent: CmsMcpAgent, input: Window & { pageId: string }) {
    const page = await readSnapshot(this.prisma, input.pageId, agent)
    // Persisted picker scopes are the same identifiers the CMS stores when inserting blocks.
    const scopes = [...new Set(page.blocks.flatMap(block => {
      const scope = blockObject(block.content)._cmsPresetScope
      return typeof scope === 'string' && scope.startsWith(encodeURIComponent(block.blockType) + '|') ? [scope] : []
    }))]
    const rows = await this.prisma.cmsPreset.findMany({
      where: { OR: [{ kind: 'page', scope: page.id }, { kind: 'block', scope: { in: scopes } }] },
      select: { id: true, kind: true, scope: true, name: true, updatedAt: true, group: { select: { name: true } }, selections: { select: { key: true } } },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }], skip: input.offset, take: input.limit + 1,
    })
    return slice(rows.map(({ selections, ...preset }) => ({
      ...preset, activeForScope: selections.some(item => item.key === preset.kind + ':' + preset.scope),
      activeForNewPages: selections.some(item => item.key === 'page:new'),
    })), input)
  }

  async listMedia(input: Window & { query?: string }) {
    const rows = await this.prisma.media.findMany({
      where: input.query ? { filename: { contains: input.query, mode: 'insensitive' } } : {},
      select: { id: true, filename: true, url: true, fileType: true, altVi: true, altEn: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], skip: input.offset, take: input.limit + 1,
    })
    return slice(rows.map(row => ({ ...row, selectableAs: mediaKindForUrl(row.url) })), input)
  }

  async createDraft(agent: CmsMcpAgent, input: CreateDraft) {
    const signature = revision({
      template: input.templateId, preset: input.presetId ?? null, slug: input.slug, title: input.title ?? null,
    })
    return this.prisma.$transaction(async tx => {
      // Concurrent retries of the same request can only make one copy.
      const requestLock = 'cms-agent:' + agent.key + ':' + input.requestId
      await lockPageForWrite(tx, requestLock)
      const prior = await tx.cmsAgentDraft.findUnique({
        where: { agentKey_createKey: { agentKey: agent.key, createKey: input.requestId } },
      })
      if (prior) {
        if (prior.createSignature !== signature) throw new ConflictException('Mã yêu cầu đã dùng với dữ liệu khác.')
        await lockPageForWrite(tx, prior.pageId)
        const page = await readSnapshot(tx, prior.pageId, agent)
        return { ...pageSummary(page), revision: pageRevision(page), blockCount: page.blocks.length, replayed: true }
      }
      if (!agent.sourcePageIds.includes(input.templateId)) throw new NotFoundException('Mẫu không nằm trong phạm vi được cấp.')
      await lockPageForWrite(tx, input.templateId)
      const template = await tx.page.findFirst({ where: { id: input.templateId, isTemplate: true } })
      if (!template) throw new NotFoundException('Không tìm thấy mẫu trang.')
      const title = input.title === undefined ? undefined : { ...blockObject(template.title), vi: input.title }
      if (input.presetId) {
        const preset = await tx.cmsPreset.findFirst({ where: { id: input.presetId, kind: 'page', scope: template.id } })
        if (!preset) throw new NotFoundException('Preset không thuộc mẫu đã chọn.')
      }
      const created = input.presetId
        ? await this.presets.createPage(input.presetId, { slug: input.slug, title, source_template_id: template.id }, tx)
        : await this.pages.usePageTemplate(template.id, { slug: input.slug, title }, tx)
      await tx.cmsAgentDraft.create({
        data: { pageId: created.id, agentKey: agent.key, createKey: input.requestId, createSignature: signature },
      })
      const page = await readSnapshot(tx, created.id)
      const current = pageRevision(page)
      await audit(tx, agentActor(agent), 'mcp_create_draft', page, {
        sourceTemplateId: template.id, presetId: input.presetId ?? null, revision: current, requestId: input.requestId,
      })
      return { ...pageSummary(page), revision: current, blockCount: page.blocks.length, replayed: false }
    }, { timeout: 20_000 }).catch(error => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Đường dẫn trang đã tồn tại.')
      }
      throw error
    })
  }

  private async mediaUrl(tx: Db, agent: CmsMcpAgent, source: Extract<BlockChange, { kind: 'media' }>['source']) {
    if (!agent.scopes.has('cms:media')) throw new ForbiddenException('Thiếu quyền cms:media.')
    if (source.kind === 'library') {
      const item = await tx.media.findUnique({ where: { id: source.mediaId }, select: { url: true } })
      if (!item) throw new NotFoundException('Không tìm thấy media trong thư viện.')
      return item.url
    }
    const block = await tx.contentBlock.findFirst({
      where: { id: source.blockId, pageId: source.pageId, page: readScope(agent) },
    })
    if (!block) throw new NotFoundException('Không tìm thấy block media trong phạm vi được cấp.')
    const field = getBlockField(block.blockType, block.content, source.path)
    if (field.kind === 'text' || typeof field.value !== 'string') throw new BadRequestException('Nguồn không phải trường media.')
    return field.value
  }

  async updateBlock(agent: CmsMcpAgent, input: DraftInput & { blockId: string; changes: BlockChange[] }) {
    return this.prisma.$transaction(async tx => {
      const page = await writableDraft(tx, agent, input.pageId)
      const previous = verifyRevision(page, input.expectedRevision)
      const block = page.blocks.find(row => row.id === input.blockId)
      if (!block) throw new NotFoundException('Block không thuộc bản nháp này.')
      const content = structuredClone(block.content)
      const diffs: FieldDiff[] = []
      const paths = new Set<string>()
      for (const change of input.changes) {
        const key = JSON.stringify([change.path, change.kind === 'text' ? change.locale : null])
        if (paths.has(key)) throw new BadRequestException('Trùng trường chỉnh sửa.')
        paths.add(key)
        if (change.kind === 'text') {
          const before = editBlockText(block.blockType, content, change.path, change.locale, change.value)
          diffs.push({ path: change.path, locale: change.locale, before, after: change.value })
          continue
        }
        const field = getBlockField(block.blockType, content, change.path)
        const url = await this.mediaUrl(tx, agent, change.source)
        if (field.kind === 'text' || field.kind !== mediaKindForUrl(url)) {
          throw new BadRequestException('Media không phù hợp với kiểu trường đích.')
        }
        field.object[field.key] = url
        diffs.push({ path: change.path, before: field.value, after: url })
      }
      const changes = cleanDiff(diffs)
      if (!changes.length) return { revision: previous, changes }
      await this.pages.updateBlock(block.id, { content }, tx)
      const current = pageRevision(await readSnapshot(tx, page.id))
      await audit(tx, agentActor(agent), 'mcp_update_block', page, { blockId: block.id, blockLabel: block.label, changes, previous, revision: current })
      return { revision: current, changes }
    })
  }

  async reorderBlocks(agent: CmsMcpAgent, input: DraftInput & { blockIds: string[] }) {
    return this.prisma.$transaction(async tx => {
      const page = await writableDraft(tx, agent, input.pageId)
      const previous = verifyRevision(page, input.expectedRevision)
      const before = page.blocks.map(block => block.id)
      const after = input.blockIds
      if (after.length !== before.length || new Set(after).size !== after.length || before.some(id => !after.includes(id))) {
        throw new BadRequestException('Phải gửi đủ mã block của đúng trang, mỗi mã xuất hiện một lần.')
      }
      if (before.every((id, index) => id === after[index])) return { revision: previous, blockIds: before }
      await this.pages.reorderBlocks(after.map((id, index) => ({ id, sort_order: (index + 1) * 10 })), tx)
      const current = pageRevision(await readSnapshot(tx, page.id))
      await audit(tx, agentActor(agent), 'mcp_reorder_blocks', page, { before, after, previous, revision: current })
      return { revision: current, blockIds: after }
    })
  }

  async submitReview(agent: CmsMcpAgent, input: DraftInput & { note?: string }) {
    return this.prisma.$transaction(async tx => {
      const page = await writableDraft(tx, agent, input.pageId)
      const current = verifyRevision(page, input.expectedRevision)
      const note = input.note ?? null
      if (page.agentDraft?.submittedRevision !== current || page.agentDraft.reviewNote !== note) {
        await tx.cmsAgentDraft.update({
          where: { pageId: page.id }, data: { submittedRevision: current, submittedAt: new Date(), reviewNote: note },
        })
        await audit(tx, agentActor(agent), 'mcp_submit_review', page, { revision: current })
      }
      return { status: 'pending', revision: current, adminPath: adminPath(page.slug) }
    })
  }

  async adminReview(pageId: string, user: AuthUser) {
    const page = await this.prisma.$transaction(tx => readSnapshot(tx, pageId), {
      isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
    })
    if (!page.agentDraft || page.agentDraft.publishedAt) return null
    const current = pageRevision(page)
    const [account, entries] = await Promise.all([
      this.prisma.adminUser.findUnique({ where: { id: user.id }, select: { role: true } }),
      this.prisma.activityLog.findMany({
        where: { targetTable: auditTarget, targetId: page.id, action: { in: ['mcp_update_block', 'mcp_reorder_blocks'] } },
        select: { id: true, action: true, createdAt: true, newData: true },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 12,
      }),
    ])
    return {
      agentKey: page.agentDraft.agentKey, status: statusFor(page, current),
      revision: current, submittedAt: page.agentDraft.submittedAt,
      note: page.agentDraft.reviewNote, canPublish: user.role === 'admin' && account?.role === 'admin',
      entries,
    }
  }

  async approveAndPublish(pageId: string, expected: string, user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Chỉ quản trị viên có quyền duyệt và xuất bản.')
    return this.prisma.$transaction(async tx => {
      await lockPageForWrite(tx, pageId)
      await tx.$queryRaw`SELECT id FROM pages WHERE id = ${pageId}::uuid FOR UPDATE`
      const account = await tx.adminUser.findUnique({ where: { id: user.id }, select: { role: true, email: true } })
      if (account?.role !== 'admin') throw new ForbiddenException('Tài khoản không còn quyền duyệt và xuất bản.')
      const page = await readSnapshot(tx, pageId)
      if (!page.agentDraft || page.agentDraft.publishedAt || page.isPublished || page.isTemplate) {
        throw new ConflictException('Trang không còn là bản nháp Agent đang chờ duyệt.')
      }
      const current = verifyRevision(page, expected)
      if (page.agentDraft.submittedRevision !== current) throw new ConflictException('Agent cần gửi duyệt lại đúng phiên bản hiện tại.')
      const now = new Date()
      await tx.page.update({ where: { id: page.id }, data: { isPublished: true, updatedAt: now } })
      await tx.cmsAgentDraft.update({ where: { pageId: page.id }, data: { publishedAt: now } })
      await audit(tx, { id: user.id, label: account.email }, 'mcp_approve_and_publish', page, { revision: current })
      return { slug: page.slug, isPublished: true }
    })
  }
}
