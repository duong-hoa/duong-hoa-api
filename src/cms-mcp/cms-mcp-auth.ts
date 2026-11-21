import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import { z } from 'zod'
import { CmsMcpClientCredentials } from './cms-mcp-client-credentials'

const scope = z.enum(['cms:read', 'cms:draft', 'cms:media', 'cms:review'])
export type CmsMcpScope = z.infer<typeof scope>

const agentConfig = z.object({
  key: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,63}$/),
  subject: z.string().min(1).max(255),
  clientId: z.string().min(1).max(255),
  scopes: z.array(scope).min(1).max(4),
  sourcePageIds: z.array(z.uuid()).max(500),
}).strict()

export type CmsMcpAgent = {
  key: string
  scopes: ReadonlySet<CmsMcpScope>
  sourcePageIds: string[]
}

function configuredUrl(raw: string | undefined, local: boolean) {
  if (!raw) throw new Error('Missing MCP URL')
  const url = new URL(raw)
  const loopback = local && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  if (url.username || url.password || url.hash || (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:'))) {
    throw new Error('Invalid MCP URL')
  }
  return url
}

@Injectable()
export class CmsMcpAuth {
  private readonly logger = new Logger(CmsMcpAuth.name)
  private machine?: CmsMcpClientCredentials
  private options?: {
    issuer: string
    resource: string
    metadata: string
    origins: Set<string>
    agents: Array<z.infer<typeof agentConfig>>
    jwks: ReturnType<typeof createRemoteJWKSet> | CmsMcpClientCredentials['verification']
  }

  constructor(config: ConfigService) {
    const service = config.get<string>('CMS_MCP_SERVICE')
    if (config.get('CMS_MCP_ENABLED') === 'false' || (!service && config.get('CMS_MCP_ENABLED') !== 'true')) return
    try {
      const local = config.get('NODE_ENV') !== 'production'
      if (service) {
        const configuration = z.object({
          issuer: z.string(),
          privateKey: z.string().min(1000).max(5000),
          clients: z.array(agentConfig.extend({ secretHash: z.string().regex(/^[a-f0-9]{64}$/) })).min(1).max(20),
        }).strict().parse(JSON.parse(service))
        const issuer = configuredUrl(configuration.issuer, local)
        const clients = configuration.clients
        if (configuration.issuer !== issuer.origin ||
          new Set(clients.map(client => client.clientId)).size !== clients.length ||
          new Set(clients.map(client => client.key)).size !== clients.length ||
          clients.some(client => !client.scopes.includes('cms:read'))) throw new Error('Invalid MCP service configuration')
        this.machine = new CmsMcpClientCredentials(issuer.origin, configuration.privateKey, clients)
        this.options = {
          issuer: issuer.origin,
          resource: this.machine.resource,
          metadata: issuer.origin + '/.well-known/oauth-protected-resource/mcp',
          origins: new Set([issuer.origin]),
          agents: clients,
          jwks: this.machine.verification,
        }
        return
      }
      const issuer = config.get<string>('CMS_MCP_OAUTH_ISSUER')
      const issuerUrl = configuredUrl(issuer, local)
      const resource = configuredUrl(config.get<string>('CMS_MCP_RESOURCE_URL'), local)
      const jwks = configuredUrl(config.get<string>('CMS_MCP_OAUTH_JWKS_URL'), local)
      const agents = z.array(agentConfig).min(1).max(100).parse(JSON.parse(config.get<string>('CMS_MCP_AGENTS') ?? '[]'))
      if (!issuer || issuerUrl.search || resource.search || resource.pathname !== '/mcp') throw new Error('Invalid MCP endpoint metadata')
      if (new Set(agents.map(agent => agent.key)).size !== agents.length ||
          new Set(agents.map(agent => JSON.stringify([agent.subject, agent.clientId]))).size !== agents.length ||
          agents.some(agent => !agent.scopes.includes('cms:read'))) {
        throw new Error('Invalid MCP agent configuration')
      }
      const extraOrigins = (config.get<string>('CMS_MCP_ALLOWED_ORIGINS') ?? '').split(',').map(value => value.trim()).filter(Boolean)
      this.options = {
        issuer,
        resource: resource.href,
        metadata: new URL('/.well-known/oauth-protected-resource/mcp', resource.origin).href,
        origins: new Set([resource.origin, ...extraOrigins.map(value => configuredUrl(value, local).origin)]),
        agents,
        jwks: createRemoteJWKSet(jwks, { timeoutDuration: 4000 }),
      }
    } catch {
      this.logger.error('MCP is disabled because its configuration is invalid')
    }
  }

  get enabled() { return !!this.options }
  get service() { return this.machine }

  get metadata() {
    if (!this.options) return null
    return {
      resource: this.options.resource,
      authorization_servers: [this.options.issuer],
      scopes_supported: scope.options,
      bearer_methods_supported: ['header'],
    }
  }

  challenge(error?: 'invalid_token' | 'insufficient_scope') {
    return `Bearer resource_metadata="${this.options?.metadata}", scope="cms:read"${error ? `, error="${error}"` : ''}`
  }

  allowsOrigin(origin: string | undefined) {
    return origin === undefined || !!this.options?.origins.has(origin)
  }

  async authenticate(authorization: string | undefined): Promise<CmsMcpAgent | null> {
    if (!this.options || !authorization || authorization.length > 8192) return null
    const token = /^Bearer ([^\s]+)$/i.exec(authorization)?.[1]
    if (!token) return null
    const { issuer, resource, jwks, agents } = this.options
    try {
      const { payload, protectedHeader } = await jwtVerify(token, jwks, {
        issuer,
        audience: resource,
        requiredClaims: ['exp', 'iat', 'sub', 'aud'],
        algorithms: ['RS256', 'ES256'],
        maxTokenAge: '1h',
      })
      if (protectedHeader.typ !== 'at+jwt' && protectedHeader.typ !== 'application/at+jwt') return null
      if (payload.aud !== resource && (!Array.isArray(payload.aud) || payload.aud.length !== 1 || payload.aud[0] !== resource)) return null
      const agent = agents.find(candidate => candidate.subject === payload.sub && candidate.clientId === payload.client_id)
      if (!agent) return null
      const granted = new Set(typeof payload.scope === 'string' ? payload.scope.split(/\s+/) : [])
      return { key: agent.key, sourcePageIds: agent.sourcePageIds, scopes: new Set(agent.scopes.filter(value => granted.has(value))) }
    } catch {
      return null
    }
  }
}
