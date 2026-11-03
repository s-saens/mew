import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import type { McpServer } from '@agentclientprotocol/sdk'
import { DATA_DIR } from './dataDir.ts'
import { object, parseConfig, atKeys } from './harness-config.ts'

export interface SharedMcpConfig {
  command?: string
  args?: string[]
  env?: Record<string, string>
  cwd?: string
  type?: 'http' | 'sse'
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
  oauth?: { scope?: string; client_id?: string; client_secret?: string }
}

export const SHARED_MCP_FILE = 'servers.json'
const MAX_CONFIG_BYTES = 2 * 1024 * 1024

/** One registry and credential cache serve this installation's agent-enabled accounts. */
export function sharedMcpDirectory(): string {
  return path.join(DATA_DIR, 'mcp')
}

function strings(value: unknown, field: string): Record<string, string> | undefined {
  if (value === undefined) return undefined
  const entries = Object.entries(object(value))
  if (entries.some(([key, value]) => !key || typeof value !== 'string' || key.includes('\0') || value.includes('\0'))) throw new Error(`${field} 값은 문자열이어야 합니다`)
  return Object.fromEntries(entries) as Record<string, string>
}

/** Convert supported native transports, preserving credentials without importing native OAuth stores. */
export function normalizeSharedMcpConfig(value: unknown, agent?: string): SharedMcpConfig {
  const input = object(value)
  const result: SharedMcpConfig = {}
  if (input.enabled !== undefined && typeof input.enabled !== 'boolean' || input.disabled !== undefined && typeof input.disabled !== 'boolean') throw new Error('enabled 값은 true 또는 false여야 합니다')
  if (input.enabled === false || input.disabled === true) result.enabled = false
  else if (input.enabled === true) result.enabled = true
  let args = input.args
  const command = Array.isArray(input.command) ? input.command[0] : input.command
  if (Array.isArray(input.command)) {
    if (input.args !== undefined) throw new Error('command 배열과 args를 함께 사용할 수 없습니다')
    args = input.command.slice(1)
  }
  const url = input.url ?? input.serverUrl ?? input.httpUrl
  if (command !== undefined && url !== undefined) throw new Error('실행 명령과 서버 URL 중 하나만 지정하세요')
  if (command !== undefined) {
    if (typeof command !== 'string' || !command.trim() || command.includes('\0')) throw new Error('실행 명령이 필요합니다')
    if (args !== undefined && (!Array.isArray(args) || args.some(arg => typeof arg !== 'string' || arg.includes('\0')))) throw new Error('args는 문자열 배열이어야 합니다')
    result.command = command
    result.args = (args ?? []) as string[]
    if (input.cwd !== undefined) {
      if (typeof input.cwd !== 'string' || !path.isAbsolute(input.cwd) || input.cwd.includes('\0')) throw new Error('MCP 작업 폴더는 절대 경로여야 합니다')
      result.cwd = input.cwd
    }
    const env = strings(input.env ?? input.environment, 'env')
    if (env) result.env = env
    if (['headers', 'http_headers', 'env_http_headers', 'bearer_token_env_var', 'oauth'].some(key => input[key] !== undefined)) throw new Error('로컬 MCP에는 원격 인증 설정을 사용할 수 없습니다')
  } else {
    if (input.cwd !== undefined || input.args !== undefined) throw new Error('원격 MCP에는 실행 인자나 작업 폴더를 지정할 수 없습니다')
    if (typeof url !== 'string' || !url.trim()) throw new Error('command 또는 서버 URL이 필요합니다')
    const parsed = new URL(url)
    if (parsed.username || parsed.password || parsed.hash || !['http:', 'https:'].includes(parsed.protocol)
      || parsed.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('서버 URL은 HTTPS 또는 localhost HTTP 주소여야 합니다')
    const transport = input.type ?? input.transport
    if (transport && !['http', 'sse', 'streamable-http', 'remote'].includes(String(transport))) throw new Error('지원하지 않는 원격 MCP 연결 방식입니다')
    result.type = transport === 'sse' ? 'sse' : 'http'
    result.url = parsed.href
    const environment = strings(input.env ?? input.environment, 'env')
    if (environment) result.env = environment
    const headers = strings(input.headers ?? input.http_headers, 'headers') ?? {}
    const environmentHeaders = strings(input.env_http_headers, 'env_http_headers') ?? {}
    for (const [name, variable] of Object.entries(environmentHeaders)) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(variable)) throw new Error('HTTP 헤더의 환경 변수 이름을 확인하세요')
      headers[name] = `\${${variable}}`
    }
    if (input.bearer_token_env_var !== undefined) {
      if (typeof input.bearer_token_env_var !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(input.bearer_token_env_var)) throw new Error('토큰 환경 변수 이름을 확인하세요')
      headers.Authorization = `Bearer \${${input.bearer_token_env_var}}`
    }
    if (Object.keys(headers).length) {
      if (Object.entries(headers).some(([key, value]) => !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(key) || /[\r\n]/.test(value))) throw new Error('HTTP 헤더 이름과 값을 확인하세요')
      result.headers = headers
    }
    if (input.oauth !== undefined && input.oauth !== false) {
      const oauth = object(input.oauth)
      const unsupported = Object.keys(oauth).filter(key => !['scope', 'client_id', 'client_secret'].includes(key))
      if (unsupported.length) throw new Error('지원하지 않는 OAuth 설정이 있습니다')
      result.oauth = strings(oauth, 'oauth')
    }
  }
  const supported = new Set(['command', 'args', 'env', 'environment', 'cwd', 'type', 'transport', 'url', 'serverUrl', 'httpUrl', 'headers', 'http_headers', 'env_http_headers', 'bearer_token_env_var', 'enabled', 'disabled', 'oauth'])
  // Provider-specific execution, trust and tool filters cannot be silently discarded when sharing.
  if (Object.keys(input).some(key => !supported.has(key))) throw new Error(`${agent ? `${agent} ` : ''}MCP에 지원하지 않는 설정이 있습니다. 공통 설정에서 사용할 항목을 확인하세요`)
  return result
}

export function readSharedMcpConfig(directory: string, name: string): SharedMcpConfig {
  const file = path.join(directory, SHARED_MCP_FILE)
  if (fs.statSync(file).size > MAX_CONFIG_BYTES) throw new Error('MCP 설정 파일이 너무 큽니다')
  const servers = atKeys(parseConfig(fs.readFileSync(file, 'utf8'), 'json'), ['mcpServers'])
  if (!Object.hasOwn(servers, name)) throw new Error('Mew 공통 MCP를 찾을 수 없습니다')
  return normalizeSharedMcpConfig(servers[name])
}

export function sharedMcpConfigIdentity(config: SharedMcpConfig): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, canonical(value)])) : value
  // Enabling a definition does not change its authentication identity.
  const { enabled: _enabled, ...identity } = config
  return createHash('sha256').update(JSON.stringify(canonical(identity))).digest('hex')
}

export function sharedMcpRuntimeName(name: string): string {
  return `mew_${name.replace(/[^A-Za-z0-9_]/g, '_').slice(0, 42)}_${createHash('sha256').update(name).digest('hex').slice(0, 8)}`
}

export function sharedMcpServers(directory = sharedMcpDirectory()): McpServer[] {
  const file = path.join(directory, SHARED_MCP_FILE)
  if (!fs.existsSync(file)) return []
  if (fs.statSync(file).size > MAX_CONFIG_BYTES) throw new Error('Mew 공통 MCP 설정 파일이 너무 큽니다')
  const servers = atKeys(parseConfig(fs.readFileSync(file, 'utf8'), 'json'), ['mcpServers'])
  return Object.keys(servers).sort().flatMap(name => {
    const config = normalizeSharedMcpConfig(servers[name])
    if (config.enabled === false) return []
    return [{ name: sharedMcpRuntimeName(name), command: process.execPath,
      args: [fileURLToPath(new URL('./shared-mcp-stdio.ts', import.meta.url)), directory, name], env: [] }]
  })
}
