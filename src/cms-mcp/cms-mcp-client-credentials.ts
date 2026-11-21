import { createHash, createPrivateKey, createPublicKey, timingSafeEqual } from 'node:crypto'
import { createLocalJWKSet, SignJWT } from 'jose'
import { z } from 'zod'
import type { CmsMcpScope } from './cms-mcp-auth'

type Agent = { key: string; subject: string; clientId: string; scopes: CmsMcpScope[]; sourcePageIds: string[] }
const grant = z.object({
  grant_type: z.string(),
  resource: z.string(),
  scope: z.string().max(200).optional(),
}).strict()

function credentials(authorization: string | undefined) {
  if (!authorization || authorization.length > 800) return null
  const encoded = /^Basic ([a-z0-9+/]+={0,2})$/i.exec(authorization)?.[1]
  if (!encoded) return null
  const value = Buffer.from(encoded, 'base64').toString('utf8')
  const separator = value.indexOf(':')
  if (separator < 1) return null
  try {
    return value.split(/:(.*)/s, 2).map(part => decodeURIComponent(part.replace(/\+/g, ' ')))
  } catch {
    return null
  }
}

export class CmsMcpClientCredentials {
  private readonly key
  private readonly jwk
  private readonly kid
  readonly resource: string

  constructor(readonly issuer: string, privateKey: string, readonly clients: Array<Agent & { secretHash: string }>) {
    this.resource = issuer + '/mcp'
    this.key = createPrivateKey({ key: Buffer.from(privateKey, 'base64'), format: 'der', type: 'pkcs8' })
    if (this.key.asymmetricKeyType !== 'rsa' || (this.key.asymmetricKeyDetails?.modulusLength ?? 0) < 2048) {
      throw new Error('Invalid MCP signing key')
    }
    this.jwk = createPublicKey(this.key).export({ format: 'jwk' })
    this.kid = createHash('sha256').update(JSON.stringify(this.jwk)).digest('base64url')
  }

  get jwks() {
    return { keys: [{ ...this.jwk, use: 'sig', alg: 'RS256', kid: this.kid }] }
  }

  get verification() { return createLocalJWKSet(this.jwks) }

  get metadata() {
    return {
      issuer: this.issuer,
      token_endpoint: this.issuer + '/api/mcp/oauth/token',
      jwks_uri: this.issuer + '/.well-known/mcp-jwks.json',
      response_types_supported: [],
      grant_types_supported: ['client_credentials'],
      token_endpoint_auth_methods_supported: ['client_secret_basic'],
      scopes_supported: [...new Set(this.clients.flatMap(client => client.scopes))],
    }
  }

  async issue(authorization: string | undefined, body: unknown) {
    const pair = credentials(authorization)
    const client = pair && this.clients.find(entry => entry.clientId === pair[0])
    const inputHash = createHash('sha256').update(pair?.[1] || '').digest()
    const storedHash = Buffer.from(client ? client.secretHash : '0'.repeat(64), 'hex')
    if (!timingSafeEqual(inputHash, storedHash) || !client) return { status: 401, body: { error: 'invalid_client' } }
    const input = grant.safeParse(body)
    if (!input.success) return { status: 400, body: { error: 'invalid_request' } }
    if (input.data.grant_type !== 'client_credentials') return { status: 400, body: { error: 'unsupported_grant_type' } }
    if (input.data.resource !== this.resource) return { status: 400, body: { error: 'invalid_target' } }
    const requested = input.data.scope === undefined ? ['cms:read'] : [...new Set(input.data.scope.trim().split(/\s+/))]
    if (!requested.includes('cms:read') || !requested.every(scope => client.scopes.includes(scope as CmsMcpScope))) {
      return { status: 400, body: { error: 'invalid_scope' } }
    }
    const scope = requested.join(' ')
    const accessToken = await new SignJWT({ scope, client_id: client.clientId })
      .setProtectedHeader({ alg: 'RS256', kid: this.kid, typ: 'at+jwt' })
      .setIssuer(this.issuer)
      .setSubject(client.subject)
      .setAudience(this.resource)
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(this.key)
    return { status: 200, body: { access_token: accessToken, token_type: 'Bearer', expires_in: 300, scope } }
  }
}
