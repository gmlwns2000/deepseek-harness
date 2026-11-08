/**
 * Extract organic results from a DuckDuckGo HTML results page. Advertisements,
 * non-HTTP(S) links, and repeated URLs are dropped; DuckDuckGo redirect links
 * are unwrapped to their destination.
 * @module @deepseek-ai/dsh-web-search-duckduckgo/parse
 */

import { parse } from 'parse5'
import type { DefaultTreeAdapterMap } from 'parse5'
import type { WebSearchSource } from '@deepseek-ai/dsh-web'

type Node = DefaultTreeAdapterMap['node']
type Element = DefaultTreeAdapterMap['element']

/** Organic results of one page, or the bot challenge DuckDuckGo shows instead of results. */
export interface DuckDuckGoPage {
  /** Results in page order. */
  readonly sources: readonly WebSearchSource[]
  /** True when the page is DuckDuckGo's automated-traffic challenge rather than a results page. */
  readonly blocked: boolean
}

function isElement(node: Node): node is Element {
  return 'tagName' in node
}

function childrenOf(node: Node): readonly Node[] {
  if (node.nodeName === 'template' && 'content' in node) return node.content.childNodes
  return 'childNodes' in node ? node.childNodes : []
}

function classes(element: Element): readonly string[] {
  const value = element.attrs.find(attr => attr.name === 'class')?.value ?? ''
  return value.split(/\s+/u).filter(Boolean)
}

function attribute(element: Element, name: string): string | undefined {
  return element.attrs.find(attr => attr.name === name)?.value
}

/** Depth-first elements below `root`, in document order. */
function* descendants(root: Node): Generator<Element> {
  for (const child of childrenOf(root)) {
    if (isElement(child)) yield child
    yield* descendants(child)
  }
}

function firstWithClass(root: Node, name: string): Element | undefined {
  for (const element of descendants(root)) if (classes(element).includes(name)) return element
  return undefined
}

/** Visible text with whitespace runs collapsed; parse5 has already decoded entities. */
function textOf(root: Node): string {
  const parts: string[] = []
  const visit = (node: Node): void => {
    if (node.nodeName === '#text' && 'value' in node) parts.push(node.value)
    for (const child of childrenOf(node)) visit(child)
  }
  visit(root)
  return parts.join('').replace(/\s+/gu, ' ').trim()
}

/**
 * Resolve a result link to its destination.
 * @param href - `href` of a result title, possibly protocol-relative or a `duckduckgo.com/l/?uddg=` redirect.
 * @returns the absolute HTTP(S) destination, or undefined for any other link.
 */
export function resolveResultUrl(href: string): string | undefined {
  const absolute = href.startsWith('//') ? `https:${href}` : href
  if (!URL.canParse(absolute)) return undefined
  let url = new URL(absolute)
  const redirect = url.searchParams.get('uddg')
  if (/(^|\.)duckduckgo\.com$/u.test(url.hostname) && url.pathname === '/l/' && redirect !== null) {
    if (!URL.canParse(redirect)) return undefined
    url = new URL(redirect)
  }
  return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined
}

/**
 * Parse one DuckDuckGo HTML results page.
 * @param html - response body of the `html.duckduckgo.com/html/` endpoint.
 * @returns organic sources in page order, and whether the page is a bot challenge.
 */
export function parseDuckDuckGoResults(html: string): DuckDuckGoPage {
  const document = parse(html)
  const sources: WebSearchSource[] = []
  const seen = new Set<string>()
  let blocked = false
  for (const element of descendants(document)) {
    const names = classes(element)
    if (names.some(name => name.startsWith('anomaly'))) blocked = true
    if (!names.includes('result') || names.includes('result--ad')) continue
    const link = firstWithClass(element, 'result__a')
    const href = link === undefined ? undefined : attribute(link, 'href')
    const url = href === undefined ? undefined : resolveResultUrl(href)
    if (link === undefined || url === undefined || seen.has(url)) continue
    seen.add(url)
    const title = textOf(link)
    const snippetElement = firstWithClass(element, 'result__snippet')
    const snippet = snippetElement === undefined ? '' : textOf(snippetElement)
    sources.push({ url, ...title === '' ? {} : { title }, ...snippet === '' ? {} : { snippet } })
  }
  return { sources, blocked: blocked && sources.length === 0 }
}
