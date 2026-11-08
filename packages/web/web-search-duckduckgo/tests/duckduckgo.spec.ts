import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime, { WebError } from '@deepseek-ai/dsh-web'
import * as plugin from '@deepseek-ai/dsh-web-search-duckduckgo'
import {
  DUCKDUCKGO_SEARCH_PROVIDER_ID, DuckDuckGoSearchProvider, parseDuckDuckGoResults, resolveResultUrl,
} from '@deepseek-ai/dsh-web-search-duckduckgo'
import type { DuckDuckGoSearchOptions } from '@deepseek-ai/dsh-web-search-duckduckgo'

function result(href: string, title: string, snippet?: string, extra = ''): string {
  return `<div class="result results_links results_links_deep web-result ${extra}">
    <div class="links_main links_deep result__body">
      <h2 class="result__title"><a rel="nofollow" class="result__a" href="${href}">${title}</a></h2>
      <div class="result__extras"><div class="result__extras__url"><a class="result__url" href="${href}">shown url</a></div></div>
      ${snippet === undefined ? '' : `<a class="result__snippet" href="${href}">${snippet}</a>`}
    </div></div>`
}

const PAGE = `<!DOCTYPE html><html><body><div class="results">
  ${result('https://nodejs.org/en/about/previous-releases', 'Node.js &mdash; <b>Releases</b>', 'Major <b>Node.js</b>   versions\n enter Current status.')}
  ${result('https://ads.example/track', 'Sponsored', 'Buy now', 'result--ad')}
  ${result('//duckduckgo.com/l/?uddg=https%3A%2F%2Fgithub.com%2Fnodejs%2FRelease&rut=abc', 'nodejs/Release')}
  ${result('https://nodejs.org/en/about/previous-releases', 'Duplicate', 'Repeated URL')}
  ${result('javascript:alert(1)', 'Script link', 'Not a page')}
  ${result('//example.org/path?q=1', 'Protocol relative', '')}
</div></body></html>`

const CHALLENGE = '<html><body><div class="anomaly-modal__modal"><div class="anomaly-modal__title">Unfortunately, bots use DuckDuckGo too.</div></div></body></html>'

describe('DuckDuckGo results parser', () => {
  it('extracts organic results in order, unwrapping redirects and dropping ads, duplicates, and non-HTTP links', () => {
    expect(parseDuckDuckGoResults(PAGE)).toEqual({
      blocked: false,
      sources: [
        { url: 'https://nodejs.org/en/about/previous-releases', title: 'Node.js — Releases', snippet: 'Major Node.js versions enter Current status.' },
        { url: 'https://github.com/nodejs/Release', title: 'nodejs/Release' },
        { url: 'https://example.org/path?q=1', title: 'Protocol relative' },
      ],
    })
  })

  it('reports the bot challenge only when the page has no results', () => {
    expect(parseDuckDuckGoResults(CHALLENGE)).toEqual({ sources: [], blocked: true })
    expect(parseDuckDuckGoResults('<html><body><div class="results"></div></body></html>')).toEqual({ sources: [], blocked: false })
  })

  it.each([
    ['//duckduckgo.com/l/?uddg=https%3A%2F%2Fa.example%2Fx', 'https://a.example/x'],
    ['https://html.duckduckgo.com/l/?uddg=http%3A%2F%2Fb.example%2F', 'http://b.example/'],
    ['https://duckduckgo.com/l/?uddg=ftp%3A%2F%2Fc.example%2F', undefined],
    ['https://duckduckgo.com/l/?uddg=not%20a%20url', undefined],
    ['mailto:someone@example.com', undefined],
    ['/relative/path', undefined],
  ])('resolves result link %s', (href, expected) => {
    expect(resolveResultUrl(href)).toBe(expected)
  })
})

type Handler = (request: IncomingMessage, body: string, response: ServerResponse) => void

let server: Server
let endpoint: string
let handler: Handler

beforeEach(async () => {
  handler = (_request, _body, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end(PAGE) }
  server = createServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => { body += chunk.toString() })
    request.on('end', () => { handler(request, body, response) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/html/`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise<void>(resolve => server.close(() => { resolve() }))
})

function provider(overrides: Partial<DuckDuckGoSearchOptions> = {}): DuckDuckGoSearchProvider {
  return new DuckDuckGoSearchProvider({
    endpoint, region: 'wt-wt', timeoutMs: 5_000, maxResponseBytes: 1_000_000, userAgent: 'test-agent/1.0', ...overrides,
  })
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error: unknown = await promise.then(() => undefined, (rejection: unknown) => rejection)
  if (!(error instanceof WebError)) throw new Error(`expected a WebError, got ${String(error)}`)
  return error.code
}

describe('DuckDuckGo search provider', () => {
  it('posts one form-encoded query with the configured region and product User-Agent', async () => {
    type Seen = {
      method: string | undefined
      type: string | undefined
      agent: string | undefined
      cookie: string | undefined
      body: string
    }
    let seen: Seen = { method: undefined, type: undefined, agent: undefined, cookie: undefined, body: '' }
    handler = (request, body, response) => {
      seen = { method: request.method, type: request.headers['content-type'], agent: request.headers['user-agent'],
        cookie: request.headers.cookie, body }
      response.writeHead(200, { 'content-type': 'text/html' })
      response.end(PAGE)
    }
    const found = await provider({ region: 'kr-kr' }).search({ query: 'node release & schedule', maxResults: 2 })
    expect(seen).toEqual({ method: 'POST', type: 'application/x-www-form-urlencoded', agent: 'test-agent/1.0', cookie: undefined,
      body: 'q=node+release+%26+schedule&kl=kr-kr' })
    expect(found.truncated).toBe(false)
    expect(found.sources.map(source => source.url)).toEqual([
      'https://nodejs.org/en/about/previous-releases', 'https://github.com/nodejs/Release', 'https://example.org/path?q=1',
    ])
  })

  it.each([
    [500, 'boom'],
    [202, CHALLENGE],
  ])('fails HTTP %i as a provider error', async (status, body) => {
    handler = (_request, _body, response) => { response.writeHead(status, { 'content-type': 'text/html' }); response.end(body) }
    expect(await codeOf(provider().search({ query: 'x' }))).toBe('WEB_PROVIDER_ERROR')
  })

  it('fails a challenge page served with 200 instead of returning no results', async () => {
    handler = (_request, _body, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end(CHALLENGE) }
    await expect(provider().search({ query: 'x' })).rejects.toThrow('refused the automated search')
  })

  it('stops reading a body larger than the configured cap', async () => {
    handler = (_request, _body, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end(PAGE.repeat(20)) }
    await expect(provider({ maxResponseBytes: 1_000 }).search({ query: 'x' })).rejects.toThrow('exceeded 1000 bytes')
  })

  it('refuses redirects rather than following them', async () => {
    handler = (_request, _body, response) => { response.writeHead(302, { location: 'https://elsewhere.example/' }); response.end() }
    expect(await codeOf(provider().search({ query: 'x' }))).toBe('WEB_PROVIDER_ERROR')
  })

  it('separates its own timeout from caller cancellation', async () => {
    handler = () => { /* never answers */ }
    expect(await codeOf(provider({ timeoutMs: 50 }).search({ query: 'x' }))).toBe('WEB_SEARCH_TIMEOUT')
    const controller = new AbortController()
    const pending = provider().search({ query: 'x' }, controller.signal)
    setTimeout(() => { controller.abort() }, 20)
    expect(await codeOf(pending)).toBe('WEB_ABORTED')
    expect(await codeOf(provider().search({ query: 'x' }, AbortSignal.abort()))).toBe('WEB_ABORTED')
  })

  it('reports an unreachable endpoint as a provider error', async () => {
    const closed = provider({ endpoint: 'http://127.0.0.1:1/html/' })
    expect(await codeOf(closed.search({ query: 'x' }))).toBe('WEB_PROVIDER_ERROR')
  })
})

describe('web-search-duckduckgo plugin', () => {
  async function mount(config: plugin.Config): Promise<Context> {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: DUCKDUCKGO_SEARCH_PROVIDER_ID })
    await ctx.plugin(plugin, config)
    return ctx
  }

  it('registers the provider so ctx.web.search reaches it', async () => {
    const ctx = await mount({ endpoint })
    const found = await ctx.web.search({ query: 'node', maxResults: 1 })
    expect(found.sources).toHaveLength(1)
    expect(found.truncated).toBe(true)
    await ctx.fiber.dispose()
  })

  it.each([
    [{ endpoint: 'file:///etc/hosts' }, 'endpoint must be an HTTP(S) URL'],
    [{ region: 'korea' }, 'region must be a DuckDuckGo kl code'],
    [{ timeoutMs: 0 }, 'timeoutMs must be a positive finite number'],
    [{ timeoutMs: 2_147_483_648 }, 'timeoutMs must be a positive finite number'],
    [{ maxResponseBytes: Number.NaN }, 'maxResponseBytes must be a positive finite number'],
    [{ userAgent: ' ' }, 'userAgent must not be empty'],
  ])('rejects invalid configuration %j at load', async (config, message) => {
    const ctx = new Context()
    await ctx.plugin(WebRuntime, {})
    expect(() => { plugin.apply(ctx, plugin.Config(config)) }).toThrow(message)
    expect(ctx.web.listProviders().search).toEqual([])
    await ctx.fiber.dispose()
  })
})
