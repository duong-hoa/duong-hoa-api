import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { Prisma, type ContentBlock, type Page } from '@prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { AssignPresetGroupDto, CreatePageFromPresetDto, CreatePresetDto, CreatePresetGroupDto, RenamePresetGroupDto, ResetPresetSelectionDto, UpdatePresetDto } from './presets.dto'

type PageSnapshot = {
  page: {
    title: Prisma.JsonValue
    description: Prisma.JsonValue | null
    seoImage: string | null
    audioUrl: string | null
    sortOrder: number
    subNav: Prisma.JsonValue
    categoryId: string | null
  }
  blocks: Array<{
    id: string
    blockType: string
    sortOrder: number
    content: Prisma.JsonValue
    isVisible: boolean
    label: string | null
  }>
}

function snapshotPage(page: Page & { blocks: ContentBlock[] }): PageSnapshot {
  return {
    page: {
      title: page.title, description: page.description, seoImage: page.seoImage,
      audioUrl: page.audioUrl, sortOrder: page.sortOrder, subNav: page.subNav, categoryId: page.categoryId,
    },
    blocks: page.blocks.map(block => ({
      id: block.id, blockType: block.blockType, sortOrder: block.sortOrder,
      content: block.content, isVisible: block.isVisible, label: block.label,
    })),
  }
}

function asSnapshot(value: Prisma.JsonValue): PageSnapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      !value.page || typeof value.page !== 'object' || Array.isArray(value.page) ||
      !Array.isArray(value.blocks) || value.blocks.length > 1000) {
    throw new BadRequestException('Dữ liệu preset trang không hợp lệ')
  }
  return value as unknown as PageSnapshot
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue
}

async function getPage(tx: Prisma.TransactionClient, id: string) {
  const page = await tx.page.findUnique({ where: { id }, include: { blocks: { orderBy: { sortOrder: 'asc' } } } })
  if (!page) throw new NotFoundException('Không tìm thấy trang')
  return page
}

async function categoryId(tx: Prisma.TransactionClient, value: string | null) {
  if (!value) return null
  return await tx.pageCategory.findUnique({ where: { id: value }, select: { id: true } }) ? value : null
}

// Keep IDs of surviving blocks so links and the selected site header/footer remain valid.
async function restoreSnapshot(tx: Prisma.TransactionClient, pageId: string, snapshot: PageSnapshot) {
  const current = await getPage(tx, pageId)
  const desiredIds = snapshot.blocks.map(block => block.id)
  if (new Set(desiredIds).size !== desiredIds.length) throw new BadRequestException('Preset có mã block trùng nhau')
  const currentIds = new Set(current.blocks.map(block => block.id))
  const removed = current.blocks.filter(block => !desiredIds.includes(block.id)).map(block => block.id)
  if (removed.length) {
    const settings = await tx.siteSetting.findMany({ where: { key: { in: ['header_settings', 'footer_settings'] } } })
    const protectedIds = settings.flatMap(setting => {
      const value = setting.value
      return value && typeof value === 'object' && !Array.isArray(value) && typeof value.blockId === 'string' ? [value.blockId] : []
    })
    if (removed.some(id => protectedIds.includes(id))) {
      throw new BadRequestException('Một block cần thay thế đang được dùng làm header hoặc footer chung. Hãy đổi cấu hình đó trước.')
    }
  }
  const otherBlocks = await tx.contentBlock.findMany({ where: { id: { in: desiredIds }, pageId: { not: pageId } }, select: { id: true } })
  if (otherBlocks.length) throw new BadRequestException('Không thể khôi phục vì mã block đã được dùng ở trang khác')

  await tx.page.update({ where: { id: pageId }, data: {
    title: json(snapshot.page.title),
    description: snapshot.page.description === null ? Prisma.DbNull : json(snapshot.page.description),
    seoImage: snapshot.page.seoImage, audioUrl: snapshot.page.audioUrl,
    sortOrder: snapshot.page.sortOrder, subNav: json(snapshot.page.subNav),
    categoryId: await categoryId(tx, snapshot.page.categoryId), updatedAt: new Date(),
  } })
  if (removed.length) await tx.contentBlock.deleteMany({ where: { pageId, id: { in: removed } } })
  for (const block of snapshot.blocks) {
    const data = {
      blockType: block.blockType, sortOrder: block.sortOrder, content: json(block.content),
      isVisible: block.isVisible, label: block.label,
    }
    if (currentIds.has(block.id)) await tx.contentBlock.update({ where: { id: block.id }, data: { ...data, updatedAt: new Date() } })
    else await tx.contentBlock.create({ data: { id: block.id, pageId, ...data } })
  }
}

@Injectable()
export class PresetsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(kind?: string, scope?: string) {
    if (kind && kind !== 'block' && kind !== 'page') throw new BadRequestException('Loại preset không hợp lệ')
    const presets = await this.prisma.cmsPreset.findMany({
      where: { ...(kind ? { kind } : {}), ...(scope ? { scope } : {}) },
      include: { selections: true, group: { select: { name: true } } }, orderBy: { createdAt: 'desc' },
    })
    return presets.map(preset => ({
      id: preset.id, kind: preset.kind, scope: preset.scope, name: preset.name, payload: preset.payload,
      group_id: preset.groupId, group_name: preset.group?.name ?? null,
      created_at: preset.createdAt, updated_at: preset.updatedAt,
      active: preset.selections.some(selection => selection.key === `${preset.kind}:${preset.scope}`),
      default_for_new_pages: preset.selections.some(selection => selection.key === 'page:new'),
    }))
  }

  async listGroups(kind?: string) {
    if (kind && kind !== 'block' && kind !== 'page') throw new BadRequestException('Loại preset không hợp lệ')
    const groups = await this.prisma.cmsPresetGroup.findMany({
      where: kind ? { kind } : {}, include: { _count: { select: { presets: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    })
    return groups.map(group => ({ id: group.id, kind: group.kind, name: group.name, preset_count: group._count.presets, created_at: group.createdAt, updated_at: group.updatedAt }))
  }

  async createGroup(input: CreatePresetGroupDto) {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Vui lòng nhập tên nhóm preset')
    if (await this.prisma.cmsPresetGroup.findFirst({ where: { kind: input.kind, name }, select: { id: true } })) {
      throw new BadRequestException('Tên nhóm preset đã tồn tại')
    }
    const group = await this.prisma.cmsPresetGroup.create({ data: { kind: input.kind, name } })
    return { id: group.id, kind: group.kind, name: group.name, preset_count: 0, created_at: group.createdAt, updated_at: group.updatedAt }
  }

  async renameGroup(id: string, input: RenamePresetGroupDto) {
    const name = input.name.trim()
    if (!name) throw new BadRequestException('Vui lòng nhập tên nhóm preset')
    const group = await this.prisma.cmsPresetGroup.findUnique({ where: { id } })
    if (!group) throw new NotFoundException('Không tìm thấy nhóm preset')
    if (await this.prisma.cmsPresetGroup.findFirst({ where: { kind: group.kind, name, id: { not: id } }, select: { id: true } })) {
      throw new BadRequestException('Tên nhóm preset đã tồn tại')
    }
    const updated = await this.prisma.cmsPresetGroup.update({ where: { id }, data: { name } })
    return { id: updated.id, kind: updated.kind, name: updated.name, preset_count: await this.prisma.cmsPreset.count({ where: { groupId: id } }), created_at: updated.createdAt, updated_at: updated.updatedAt }
  }

  async deleteGroup(id: string) {
    const group = await this.prisma.cmsPresetGroup.findUnique({ where: { id }, select: { id: true } })
    if (!group) throw new NotFoundException('Không tìm thấy nhóm preset')
    const count = await this.prisma.cmsPreset.count({ where: { groupId: id } })
    await this.prisma.cmsPresetGroup.delete({ where: { id } })
    return { success: true, ungrouped_count: count }
  }

  async assignGroup(id: string, input: AssignPresetGroupDto) {
    const preset = await this.prisma.cmsPreset.findUnique({ where: { id }, select: { id: true, kind: true } })
    if (!preset) throw new NotFoundException('Không tìm thấy preset')
    if (input.group_id) {
      const group = await this.prisma.cmsPresetGroup.findUnique({ where: { id: input.group_id }, select: { id: true, kind: true } })
      if (!group || group.kind !== preset.kind) throw new BadRequestException('Nhóm preset không phù hợp với loại preset này')
    }
    await this.prisma.cmsPreset.update({ where: { id }, data: { groupId: input.group_id ?? null } })
    return { success: true }
  }

  async create(input: CreatePresetDto) {
    const name = input.name.trim(), scope = input.scope.trim()
    if (!name || !scope) throw new BadRequestException('Tên và phạm vi preset không được để trống')
    let payload: unknown
    if (input.kind === 'page') {
      if (!input.source_page_id || input.source_page_id !== scope) throw new BadRequestException('Trang nguồn không hợp lệ')
      payload = snapshotPage(await getPage(this.prisma, input.source_page_id))
    } else {
      if (!input.payload || typeof input.payload.block_type !== 'string' ||
          !input.payload.content || typeof input.payload.content !== 'object' || Array.isArray(input.payload.content)) {
        throw new BadRequestException('Preset block phải có loại block và nội dung')
      }
      payload = input.payload
    }
    if (JSON.stringify(payload).length > 5_000_000) throw new BadRequestException('Preset vượt quá kích thước cho phép')
    if (input.group_id) {
      const group = await this.prisma.cmsPresetGroup.findUnique({ where: { id: input.group_id }, select: { kind: true } })
      if (!group || group.kind !== input.kind) throw new BadRequestException('Nhóm preset không phù hợp với loại preset này')
    }
    const preset = await this.prisma.cmsPreset.create({ data: { kind: input.kind, scope, name, groupId: input.group_id ?? null, payload: json(payload) } })
    return { id: preset.id }
  }

  async update(id: string, input: UpdatePresetDto) {
    const preset = await this.prisma.cmsPreset.findUnique({ where: { id } })
    if (!preset) throw new NotFoundException('Không tìm thấy preset')

    const data: Prisma.CmsPresetUpdateInput = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw new BadRequestException('Tên preset không được để trống')
      data.name = name
    }
    if (input.group_id !== undefined) {
      if (input.group_id) {
        const group = await this.prisma.cmsPresetGroup.findUnique({ where: { id: input.group_id }, select: { kind: true } })
        if (!group || group.kind !== preset.kind) throw new BadRequestException('Nhóm preset không phù hợp với loại preset này')
      }
      data.group = input.group_id ? { connect: { id: input.group_id } } : { disconnect: true }
    }

    let payload: unknown = preset.payload
    if (preset.kind === 'page' && input.source_page_id !== undefined) {
      if (input.source_page_id !== preset.scope) throw new BadRequestException('Trang nguồn không khớp phạm vi preset')
      payload = snapshotPage(await getPage(this.prisma, input.source_page_id))
    } else if (input.payload !== undefined) {
      if (preset.kind === 'page') {
        payload = input.payload
        asSnapshot(json(payload) as Prisma.JsonValue)
      } else {
        if (typeof input.payload.block_type !== 'string' ||
            !input.payload.content || typeof input.payload.content !== 'object' || Array.isArray(input.payload.content)) {
          throw new BadRequestException('Preset block phải có loại block và nội dung')
        }
        payload = input.payload
      }
    }

    if (JSON.stringify(payload).length > 5_000_000) throw new BadRequestException('Preset vượt quá kích thước cho phép')
    data.payload = json(payload)
    await this.prisma.cmsPreset.update({ where: { id }, data })
    return { success: true }
  }

  async activate(id: string, target: 'scope' | 'new-pages' | 'both') {
    const preset = await this.prisma.cmsPreset.findUnique({ where: { id } })
    if (!preset) throw new NotFoundException('Không tìm thấy preset')
    if (preset.kind !== 'page' && target !== 'scope') throw new BadRequestException('Preset block chỉ áp dụng cho loại block tương ứng')
    const keys = [
      ...(target !== 'new-pages' ? [`${preset.kind}:${preset.scope}`] : []),
      ...(target !== 'scope' ? ['page:new'] : []),
    ]
    await this.prisma.$transaction(keys.map(key => this.prisma.cmsPresetSelection.upsert({
      where: { key }, create: { key, presetId: id }, update: { presetId: id },
    })))
    return { success: true }
  }

  async resetSelection(input: ResetPresetSelectionDto) {
    await this.prisma.cmsPresetSelection.deleteMany({ where: { OR: [
      { key: `${input.kind}:${input.scope}` },
      ...(input.kind === 'page' ? [{ key: 'page:new', preset: { kind: 'page', scope: input.scope } }] : []),
    ] } })
    return { success: true }
  }

  async delete(id: string) {
    await this.prisma.cmsPreset.delete({ where: { id } })
    return { success: true }
  }

  async pageState(pageId: string) {
    await getPage(this.prisma, pageId)
    return { can_reset: !!(await this.prisma.cmsPresetPageBaseline.findUnique({ where: { pageId } })) }
  }

  async applyPage(pageId: string, id: string) {
    await this.prisma.$transaction(async tx => {
      const page = await getPage(tx, pageId)
      const preset = await tx.cmsPreset.findFirst({ where: { id, kind: 'page', scope: pageId } })
      if (!preset) throw new NotFoundException('Preset không thuộc trang này')
      await tx.cmsPresetPageBaseline.upsert({
        where: { pageId }, create: { pageId, sourceScope: preset.scope, snapshot: json(snapshotPage(page)) }, update: {},
      })
      await restoreSnapshot(tx, pageId, asSnapshot(preset.payload))
    })
    return { success: true }
  }

  async resetPage(pageId: string) {
    const result = await this.prisma.$transaction(async tx => {
      await getPage(tx, pageId)
      const baseline = await tx.cmsPresetPageBaseline.findUnique({ where: { pageId } })
      const sourceScope = baseline?.sourceScope ?? pageId
      if (baseline) {
        await restoreSnapshot(tx, pageId, asSnapshot(baseline.snapshot))
        await tx.cmsPresetPageBaseline.delete({ where: { pageId } })
      }
      await tx.cmsPresetSelection.deleteMany({ where: { OR: [
        { key: `page:${pageId}` },
        { key: `page:${sourceScope}` },
        { key: 'page:new', preset: { kind: 'page', scope: { in: [pageId, sourceScope] } } },
      ] } })
      return { restored: !!baseline }
    })
    return { success: true, ...result }
  }

  async createPage(id: string, input: CreatePageFromPresetDto) {
    return this.prisma.$transaction(async tx => {
      const preset = await tx.cmsPreset.findFirst({ where: { id, kind: 'page' } })
      if (!preset) throw new NotFoundException('Không tìm thấy preset trang')
      if (await tx.page.findUnique({ where: { slug: input.slug }, select: { id: true } })) throw new BadRequestException('Đường dẫn trang đã tồn tại')
      const snapshot = asSnapshot(preset.payload)
      let original: PageSnapshot | null = null
      if (input.source_template_id) {
        const template = await getPage(tx, input.source_template_id)
        if (!template.isTemplate) throw new BadRequestException('Trang nguồn không phải mẫu trang')
        original = snapshotPage(template)
      }
      const title = input.title ?? snapshot.page.title
      const sortOrder = input.sort_order ?? snapshot.page.sortOrder
      const selectedCategory = input.category_id === undefined ? snapshot.page.categoryId : input.category_id
      const selectedCategoryId = await categoryId(tx, selectedCategory)
      const page = await tx.page.create({ data: {
        slug: input.slug, title: json(title),
        description: snapshot.page.description === null ? Prisma.DbNull : json(snapshot.page.description),
        seoImage: snapshot.page.seoImage, audioUrl: snapshot.page.audioUrl,
        sortOrder, subNav: json(snapshot.page.subNav), categoryId: selectedCategoryId, isPublished: false,
      } })
      for (const block of snapshot.blocks) await tx.contentBlock.create({ data: {
        pageId: page.id, blockType: block.blockType, sortOrder: block.sortOrder,
        content: json(block.content), isVisible: block.isVisible, label: block.label,
      } })
      const baseline: PageSnapshot = original ? {
        page: { ...original.page, title: title as Prisma.JsonValue, sortOrder, categoryId: selectedCategoryId },
        blocks: original.blocks.map(block => ({ ...block, id: randomUUID() })),
      } : {
        page: { title: title as Prisma.JsonValue, description: { vi: '', en: '', ru: '', zh: '' }, seoImage: null, audioUrl: null, sortOrder, subNav: [], categoryId: selectedCategoryId },
        blocks: [],
      }
      await tx.cmsPresetPageBaseline.create({ data: { pageId: page.id, sourceScope: preset.scope, snapshot: json(baseline) } })
      return { id: page.id, slug: page.slug }
    })
  }
}
