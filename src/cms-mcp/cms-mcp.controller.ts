import { All, BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, Res, UseGuards } from '@nestjs/common'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { Request, Response } from 'express'
import type { AuthUser } from '../auth/auth.service'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { CmsMcpAuth } from './cms-mcp-auth'
import { CmsMcpService } from './cms-mcp.service'
import { makeCmsMcpServer, revisionSchema } from './cms-mcp-tools'

@Controller()
export class CmsMcpController {
  constructor(private readonly auth: CmsMcpAuth, private readonly cms: CmsMcpService) {}

  @Get('.well-known/oauth-protected-resource/mcp')
  metadata(@Res() response: Response) {
    const metadata = this.auth.metadata
    response.set('Cache-Control', 'no-store')
    if (!metadata) return response.sendStatus(404)
    return response.json(metadata)
  }

  @Get('.well-known/oauth-authorization-server')
  oauthMetadata(@Res() response: Response) {
    response.set('Cache-Control', 'no-store')
    return this.auth.service ? response.json(this.auth.service.metadata) : response.sendStatus(404)
  }

  @Get('.well-known/mcp-jwks.json')
  signingKeys(@Res() response: Response) {
    response.set('Cache-Control', 'no-store')
    return this.auth.service ? response.json(this.auth.service.jwks) : response.sendStatus(404)
  }

  @Post('api/mcp/oauth/token')
  async token(@Req() request: Request, @Res() response: Response) {
    response.set({ 'Cache-Control': 'no-store', Pragma: 'no-cache' })
    const service = this.auth.service
    if (!service) return response.sendStatus(404)
    if (!this.auth.allowsOrigin(request.get('Origin'))) return response.sendStatus(403)
    if (!request.is('application/x-www-form-urlencoded')) return response.status(400).json({ error: 'invalid_request' })
    const result = await service.issue(request.get('Authorization'), request.body)
    if (result.status === 401) response.set('WWW-Authenticate', 'Basic realm="Duong Hoa MCP"')
    return response.status(result.status).json(result.body)
  }

  @All('mcp')
  async handle(@Req() request: Request, @Res() response: Response) {
    response.set('Cache-Control', 'no-store')
    if (!this.auth.enabled) return response.sendStatus(404)
    if (!this.auth.allowsOrigin(request.get('Origin'))) return response.sendStatus(403)
    const authorization = request.get('Authorization')
    const agent = await this.auth.authenticate(authorization)
    if (!agent) return response.set('WWW-Authenticate', this.auth.challenge(authorization ? 'invalid_token' : undefined)).sendStatus(401)
    if (!agent.scopes.has('cms:read')) {
      return response.set('WWW-Authenticate', this.auth.challenge('insufficient_scope')).sendStatus(403)
    }
    if (request.method !== 'POST') return response.set('Allow', 'POST').sendStatus(405)
    if (!request.is('application/json')) return response.sendStatus(415)

    const server = makeCmsMcpServer(agent, this.cms)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    response.once('close', () => {
      void server.close().catch(() => undefined)
    })
    await server.connect(transport)
    await transport.handleRequest(request, response, request.body)
  }
}

@UseGuards(JwtAuthGuard)
@Controller('admin/pages/:id/agent-review')
export class CmsAgentReviewController {
  constructor(private readonly cms: CmsMcpService) {}

  @Get()
  async get(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    return { review: await this.cms.adminReview(id, request.user as AuthUser) }
  }

  @Post('publish')
  publish(@Param('id', ParseUUIDPipe) id: string, @Body('revision') value: unknown, @Req() request: Request) {
    const revision = revisionSchema.safeParse(value)
    if (!revision.success) throw new BadRequestException('Mã phiên bản không hợp lệ.')
    return this.cms.approveAndPublish(id, revision.data, request.user as AuthUser)
  }
}
