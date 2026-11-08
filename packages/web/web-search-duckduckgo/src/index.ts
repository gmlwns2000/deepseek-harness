/**
 * DuckDuckGo `WebSearchProvider` plugin. It contributes to the `ctx.web`
 * registry without owning the service.
 *
 * @module @deepseek-ai/dsh-web-search-duckduckgo
 */

import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import { DuckDuckGoSearchProvider } from './provider.ts'

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647

export { DUCKDUCKGO_SEARCH_PROVIDER_ID, DuckDuckGoSearchProvider } from './provider.ts'
export type { DuckDuckGoSearchOptions } from './provider.ts'
export { parseDuckDuckGoResults, resolveResultUrl } from './parse.ts'
export type { DuckDuckGoPage } from './parse.ts'

/** Default endpoint: DuckDuckGo's script-free HTML results page. */
export const DEFAULT_ENDPOINT = 'https://html.duckduckgo.com/html/'

/** Default `User-Agent`: an explicit product agent, never a browser disguise. */
export const DEFAULT_USER_AGENT = 'deepseek-harness/0.0.1 (+https://github.com/deepseek-ai)'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-duckduckgo'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Plugin config: the endpoint, region, and transport limits (all defaulted). */
export interface Config {
  /** HTML results endpoint; an HTTP(S) URL accepting a form-encoded `q`. */
  endpoint?: string
  /** DuckDuckGo `kl` region code, such as `wt-wt` (no region) or `kr-kr`. */
  region?: string
  /** Per-search timeout in milliseconds, within Node's timer range. */
  timeoutMs?: number
  /** Maximum response body size in bytes. */
  maxResponseBytes?: number
  /** `User-Agent` header sent on every request. */
  userAgent?: string
}

export const Config: z<Config> = z.object({
  endpoint: z.string().default(DEFAULT_ENDPOINT),
  region: z.string().default('wt-wt'),
  timeoutMs: z.number().default(20_000),
  maxResponseBytes: z.number().default(2_000_000),
  userAgent: z.string().default(DEFAULT_USER_AGENT),
})

/** Complete config after schemastery applies every field default. */
type ResolvedConfig = Required<Config>

function assertPositiveFinite(field: string, value: number, max = Number.POSITIVE_INFINITY): void {
  if (!Number.isFinite(value) || value <= 0 || value > max) {
    throw new Error(`web-search-duckduckgo: ${field} must be a positive finite number no greater than ${max}`)
  }
}

/** Register the DuckDuckGo search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  // schemastery (Config) has already filled every defaulted field.
  const resolved = config as ResolvedConfig
  if (!URL.canParse(resolved.endpoint) || !['http:', 'https:'].includes(new URL(resolved.endpoint).protocol)) {
    throw new Error('web-search-duckduckgo: endpoint must be an HTTP(S) URL')
  }
  if (!/^[a-z]{2}-[a-z]{2}$/u.test(resolved.region)) {
    throw new Error('web-search-duckduckgo: region must be a DuckDuckGo kl code such as wt-wt or kr-kr')
  }
  assertPositiveFinite('timeoutMs', resolved.timeoutMs, MAX_NODE_TIMER_DELAY_MS)
  assertPositiveFinite('maxResponseBytes', resolved.maxResponseBytes)
  if (resolved.userAgent.trim() === '') throw new Error('web-search-duckduckgo: userAgent must not be empty')
  ctx.web.registerSearchProvider(new DuckDuckGoSearchProvider({
    endpoint: resolved.endpoint,
    region: resolved.region,
    timeoutMs: resolved.timeoutMs,
    maxResponseBytes: resolved.maxResponseBytes,
    userAgent: resolved.userAgent,
  }))
}
