const assert = require('node:assert/strict')
const { createHash, generateKeyPairSync, randomBytes, randomUUID } = require('node:crypto')
const { ConfigService } = require('@nestjs/config')
const { CmsMcpAuth } = require('../dist/cms-mcp/cms-mcp-auth')

async function main() {
  const issuer = 'https://duong-hoa-mcp.test'
  const secret = randomBytes(48).toString('base64url')
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const source = randomUUID()
  const configuration = {
    NODE_ENV: 'production',
    CMS_MCP_SERVICE: JSON.stringify({
      issuer,
      privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'),
      clients: [{
        clientId: 'qa-client', subject: 'qa-subject', key: 'qa-agent', sourcePageIds: [source],
        scopes: ['cms:read', 'cms:draft'], secretHash: createHash('sha256').update(secret).digest('hex'),
      }],
    }),
  }
  const auth = new CmsMcpAuth(new ConfigService(configuration))
  const service = auth.service
  assert.ok(service)
  assert.equal(service.metadata.token_endpoint, issuer + '/api/mcp/oauth/token')
  assert.equal(auth.metadata.resource, issuer + '/mcp')
  assert.ok(!('d' in service.jwks.keys[0]), 'JWKS serves public key only')
  const basic = 'Basic ' + Buffer.from('qa-client:' + secret, 'utf8').toString('base64')
  const grant = { grant_type: 'client_credentials', resource: issuer + '/mcp' }
  assert.equal((await service.issue(undefined, grant)).status, 401)
  assert.equal((await service.issue('Basic ' + Buffer.from('qa-client:bad-secret').toString('base64'), grant)).status, 401)
  assert.equal((await service.issue(basic, { ...grant, grant_type: 'password' })).body.error, 'unsupported_grant_type')
  assert.equal((await service.issue(basic, { ...grant, resource: 'https://different.test/mcp' })).body.error, 'invalid_target')
  assert.equal((await service.issue(basic, { ...grant, scope: 'cms:read cms:review' })).body.error, 'invalid_scope')
  const readonly = await service.issue(basic, grant)
  assert.equal(readonly.body.scope, 'cms:read')
  const issued = await service.issue(basic, { ...grant, scope: 'cms:read cms:draft' })
  assert.equal(issued.status, 200)
  assert.equal(issued.body.expires_in, 300)
  const agent = await auth.authenticate('Bearer ' + issued.body.access_token)
  assert.deepEqual(agent, { key: 'qa-agent', sourcePageIds: [source], scopes: new Set(['cms:read', 'cms:draft']) })
  assert.equal(await auth.authenticate('Bearer malformed'), null)
  const disabled = new CmsMcpAuth(new ConfigService({ ...configuration, CMS_MCP_ENABLED: 'false' }))
  assert.equal(disabled.enabled, false)
  assert.equal(disabled.service, undefined)
  console.log('Production-shaped OAuth client credentials: independent signing, resource, scope, identity and default-off checks passed')
}
main().catch(err => { console.error(err); process.exitCode = 1 })
