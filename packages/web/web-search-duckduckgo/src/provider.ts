/**
 * Anonymous DuckDuckGo search for `ctx.web`: one form POST to the HTML endpoint per
 * search, bounded by a timeout and a response-size cap, with no cookies, API key, or
 * DeepSeek service in the path.
 * @module @deepseek-ai/dsh-web-search-duckduckgo/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type { WebSearchProvider, WebSearchRequest, WebSearchResult } from '@deepseek-ai/dsh-web'
import { deadline, timeoutOf } from '@deepseek-ai/dsh-timeout'
import { parseDuckDuckGoResults } from './parse.ts'

/** Resolved request options (the plugin's schemastery Config supplies defaults). */
export interface DuckDuckGoSearchOptions {
  /** HTML results endpoint that accepts a form-encoded `q`. */
  endpoint: string
  /** DuckDuckGo `kl` region code; `wt-wt` means no region. */
  region: string
  /** Per-search timeout in milliseconds. */
  timeoutMs: number
  /** Maximum response body size in bytes. */
  maxResponseBytes: number
  /** `User-Agent` header sent on every request. */
  userAgent: string
}

/** Stable id this provider registers under. */
export const DUCKDUCKGO_SEARCH_PROVIDER_ID = 'duckduckgo'

/** The anonymous DuckDuckGo search provider. */
export class DuckDuckGoSearchProvider implements WebSearchProvider {
  readonly id = DUCKDUCKGO_SEARCH_PROVIDER_ID
  readonly title = 'DuckDuckGo'
  /** Picker description: what this provider suits and what it costs or cannot do. */
  readonly description: NonNullable<WebSearchProvider['description']> = {
    en: 'Searches DuckDuckGo directly from this machine with no API key, account, or charges. Returns titles, links, and short snippets only; DuckDuckGo may refuse bursts of automated searches.',
    zh: '本机直接请求 DuckDuckGo，免 API Key、账号与计费。仅返回标题、链接和简短摘要；短时间内大量自动搜索可能被 DuckDuckGo 拒绝。',
    ja: 'このマシンから DuckDuckGo を直接検索し、API キー、アカウント、料金は不要です。タイトル、リンク、短いスニペットのみを返します。短時間に大量の自動検索を行うと DuckDuckGo に拒否される場合があります。',
    es: 'Busca en DuckDuckGo directamente desde este equipo, sin clave de API, cuenta ni cargos. Solo devuelve títulos, enlaces y fragmentos breves; DuckDuckGo puede rechazar ráfagas de búsquedas automatizadas.',
    fr: 'Effectue des recherches DuckDuckGo directement depuis cette machine, sans clé API, compte ni frais. Ne renvoie que des titres, des liens et de courts extraits ; DuckDuckGo peut refuser des rafales de recherches automatisées.',
    de: 'Durchsucht DuckDuckGo direkt von diesem Rechner, ohne API-Schlüssel, Konto oder Kosten. Liefert nur Titel, Links und kurze Auszüge; DuckDuckGo kann viele automatisierte Suchen in kurzer Zeit ablehnen.',
    ru: 'Выполняет поиск в DuckDuckGo напрямую с этого компьютера без ключа API, учетной записи и оплаты. Возвращает только заголовки, ссылки и короткие фрагменты; DuckDuckGo может отклонять серии автоматических запросов.',
    pt: 'Pesquisa no DuckDuckGo diretamente desta máquina, sem chave de API, conta nem cobranças. Retorna apenas títulos, links e trechos curtos; o DuckDuckGo pode recusar rajadas de pesquisas automatizadas.',
  }

  /**
   * @param options - resolved endpoint, region, and transport limits.
   * @param send - HTTP client; the global `fetch` honors the launcher's proxy dispatcher.
   */
  constructor(
    private readonly options: DuckDuckGoSearchOptions,
    private readonly send: typeof fetch = fetch,
  ) {}

  /** No credentials to check — an anonymous search is always usable. */
  available(): boolean {
    return true
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    if (signal?.aborted) throw new WebError('web search aborted', 'WEB_ABORTED')
    using d = deadline(signal, this.options.timeoutMs, 'WEB_SEARCH_TIMEOUT')
    let response: Response
    try {
      response = await this.send(this.options.endpoint, {
        method: 'POST',
        redirect: 'error',
        headers: {
          accept: 'text/html',
          'content-type': 'application/x-www-form-urlencoded',
          'user-agent': this.options.userAgent,
        },
        body: new URLSearchParams({ q: request.query, kl: this.options.region }).toString(),
        signal: d.signal,
      })
    } catch (error) {
      throw failure(error, d.signal)
    }
    if (response.status !== 200) {
      await response.body?.cancel()
      // DuckDuckGo answers 202 with its challenge page when it throttles automated traffic.
      throw new WebError(response.status === 202
        ? 'DuckDuckGo refused the automated search; retry later'
        : `DuckDuckGo search returned HTTP ${response.status}`, 'WEB_PROVIDER_ERROR')
    }
    let html: string
    try {
      html = await readCapped(response, this.options.maxResponseBytes)
    } catch (error) {
      throw error instanceof WebError ? error : failure(error, d.signal)
    }
    const page = parseDuckDuckGoResults(html)
    if (page.blocked) throw new WebError('DuckDuckGo refused the automated search; retry later', 'WEB_PROVIDER_ERROR')
    return { sources: page.sources, truncated: false }
  }
}

/** Read a UTF-8 body, aborting once it exceeds `maxBytes`. */
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const reader = response.body?.getReader()
  if (reader === undefined) return ''
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel()
      throw new WebError(`DuckDuckGo response exceeded ${maxBytes} bytes`, 'WEB_PROVIDER_ERROR')
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** Distinguish this provider's timeout and caller cancellation from transport failure. */
function failure(error: unknown, signal: AbortSignal): WebError {
  const timeout = timeoutOf(signal, 'WEB_SEARCH_TIMEOUT')
  if (timeout !== undefined) return new WebError('DuckDuckGo search timed out', 'WEB_SEARCH_TIMEOUT', { cause: timeout })
  if (signal.aborted) return new WebError('web search aborted', 'WEB_ABORTED', { cause: error })
  return new WebError('DuckDuckGo search request failed', 'WEB_PROVIDER_ERROR', { cause: error })
}
