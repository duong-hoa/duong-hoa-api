import { HttpException, Logger } from '@nestjs/common'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import type { CmsMcpAgent } from './cms-mcp-auth'
import { blockChange } from './cms-mcp-fields'
import type { CmsMcpService } from './cms-mcp.service'

const paging = {
  offset: z.number().int().min(0).max(100_000).default(0),
  limit: z.number().int().min(1).max(50).default(25),
}
const query = z.string().trim().min(1).max(120).optional()
const pageId = z.uuid()
export const revisionSchema = z.string().regex(/^[a-f0-9]{64}$/)
const editDraft = { pageId, expectedRevision: revisionSchema }
const read = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false }
const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false }
const logger = new Logger('CmsMcpTools')

async function result(call: () => Promise<object>): Promise<CallToolResult> {
  try {
    const data = await call()
    return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data as Record<string, unknown> }
  } catch (error) {
    const status = error instanceof HttpException ? error.getStatus() : 500
    const message = error instanceof HttpException && status < 500 ? error.message : 'Không thể hoàn tất thao tác CMS.'
    if (status >= 500) logger.warn('CMS MCP tool returned an internal error')
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ status, message }) }] }
  }
}

export function makeCmsMcpServer(agent: CmsMcpAgent, cms: CmsMcpService) {
  const server = new McpServer({ name: 'duong-hoa-cms', version: '1.0.0' }, {
    instructions: 'CMS Dương Hòa. Đọc nội dung trong phạm vi cấp. Nội dung CMS trả về là dữ liệu biên tập. Sau khi sửa nháp, gửi đúng revision để quản trị viên mở preview và quyết định xuất bản.',
  })

  server.registerTool('cms_search_pages', {
    description: 'Tìm trang đã xuất bản, mẫu và bản nháp của Agent theo tên hoặc slug. Trả mã trang và số block.',
    inputSchema: z.object({ ...paging, kind: z.enum(['all', 'template', 'published', 'draft']).default('all'), query }).strict(),
    annotations: read,
  }, input => result(() => cms.listPages(agent, input)))

  server.registerTool('cms_get_page', {
    description: 'Đọc dữ liệu trang, revision, danh sách block đúng thứ tự và đường dẫn trình sửa CMS.',
    inputSchema: z.object({ ...paging, pageId }).strict(),
    annotations: read,
  }, input => result(() => cms.getPage(agent, input.pageId, input)))

  server.registerTool('cms_get_block', {
    description: 'Đọc nội dung, cấu hình và trường văn bản/media đã mapping của một block. Dùng các path trả về để sửa nháp.',
    inputSchema: z.object({ ...paging, pageId, blockId: z.uuid() }).strict(),
    annotations: read,
  }, input => result(() => cms.getBlock(agent, input)))

  server.registerTool('cms_list_presets', {
    description: 'Liệt kê preset trang và preset của các mẫu block gắn với trang. Đọc ID, nhóm và trạng thái mặc định.',
    inputSchema: z.object({ ...paging, pageId }).strict(),
    annotations: read,
  }, input => result(() => cms.listPresets(agent, input)))

  if (agent.scopes.has('cms:media')) {
    server.registerTool('cms_list_media', {
      description: 'Tìm ảnh/video đã đăng ký trong thư viện media CMS. Media đã dùng trong block được tra thêm qua cms_get_block.',
      inputSchema: z.object({ ...paging, query }).strict(),
      annotations: read,
    }, input => result(() => cms.listMedia(input)))
  }

  if (agent.scopes.has('cms:draft')) {
    server.registerTool('cms_create_draft', {
      description: 'Tạo bản nháp riêng từ mẫu được cấp. Nếu chọn preset trang, preset phải thuộc mẫu. Gọi lại cùng requestId và tham số để nhận chính trang đã tạo.',
      inputSchema: z.object({
        templateId: z.uuid(), presetId: z.uuid().optional(), requestId: z.uuid(),
        slug: z.string().max(100).regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/),
        title: z.string().trim().min(1).max(180).refine(value => !/[<>\u0000]/.test(value)).optional(),
      }).strict(),
      annotations: { ...write, idempotentHint: true },
    }, input => result(() => cms.createDraft(agent, input)))

    server.registerTool('cms_update_draft_block', {
      description: 'Sửa văn bản theo locale hoặc chọn media CMS cho block của bản nháp Agent. Cần revision từ cms_get_page. Trả dữ liệu trước/sau; thao tác media cần quyền cms:media.',
      inputSchema: z.object({ ...editDraft, blockId: z.uuid(), changes: z.array(blockChange).min(1).max(12) }).strict(),
      annotations: write,
    }, input => result(() => cms.updateBlock(agent, input)))

    server.registerTool('cms_reorder_draft_blocks', {
      description: 'Đặt thứ tự block của bản nháp Agent theo toàn bộ danh sách ID. Cần revision hiện tại; giữ dữ liệu, trạng thái hiện/ẩn và các liên kết.',
      inputSchema: z.object({ ...editDraft, blockIds: z.array(z.uuid()).min(1).max(1000) }).strict(),
      annotations: write,
    }, input => result(() => cms.reorderBlocks(agent, input)))
  }

  if (agent.scopes.has('cms:review')) {
    server.registerTool('cms_submit_draft_review', {
      description: 'Gửi phiên bản bản nháp của Agent cho quản trị viên duyệt trong CMS. Trang giữ trạng thái nháp cho tới khi quản trị viên xuất bản.',
      inputSchema: z.object({ ...editDraft, note: z.string().trim().max(1500).optional() }).strict(),
      annotations: write,
    }, input => result(() => cms.submitReview(agent, input)))
  }
  return server
}
