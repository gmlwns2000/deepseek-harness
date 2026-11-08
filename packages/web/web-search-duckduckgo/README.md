---
description: "The anonymous DuckDuckGo search backend for ctx.web: how deployments search the public web directly from the machine without an API key or a DeepSeek service."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-duckduckgo

English | [中文](README.zh.md)

## Summary

With `dsh-web-search-duckduckgo`, the harness searches the public web through the web service (`ctx.web`) by posting the query to DuckDuckGo's script-free HTML results page and returning titles, links, and snippets. Choose it when a deployment needs search without an API key, an account, charges, or any DeepSeek service in the request path; the shared base composition selects it as the default search provider.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Mount the provider in a composition that already loads the web service; it registers as the `duckduckgo` search provider, so `ctx.web.search()` resolves it automatically when it is the only usable search backend — or pin it with `searchProvider: duckduckgo`.

### When to choose it

Choose this backend when searches must leave the machine only for DuckDuckGo: each search is one HTTPS form POST from this process, carrying the query, the region code, and an explicit product `User-Agent`, with no cookies or credentials.

### Minimal configuration

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: duckduckgo
    fetchProvider: http
- id: web-search-duckduckgo
  name: '@deepseek-ai/dsh-web-search-duckduckgo'
  config:
    region: wt-wt          # optional; DuckDuckGo kl code, wt-wt = no region
    timeoutMs: 20000       # optional; per-search timeout
    maxResponseBytes: 2000000 # optional; larger responses fail
```

`endpoint` (default `https://html.duckduckgo.com/html/`) and `userAgent` are also configurable. Loading fails for a non-HTTP(S) endpoint, a region that is not a two-part `kl` code, a non-positive or out-of-range limit, or an empty `User-Agent`.

### What a search returns

Organic results in page order, each with its destination URL and, when DuckDuckGo shows them, the title and snippet text. Advertisements, non-HTTP(S) links, and repeated URLs are dropped, and `duckduckgo.com/l/?uddg=` redirect links are unwrapped to their destination. The provider returns every result on the page; `ctx.web` truncates to the request's `maxResults`. No answer `content` is generated.

### Failures and recovery

Every failure is a `WebError`. A non-200 status, a redirect, an oversized body, an unreachable endpoint, and DuckDuckGo's automated-traffic challenge (a 202 response or a challenge page without results) fail as `WEB_PROVIDER_ERROR`; the challenge message asks to retry later. The provider's own timeout fails as `WEB_SEARCH_TIMEOUT`, and caller cancellation as `WEB_ABORTED`. A results page with no results returns an empty source list.

<a id="understand-the-implementation"></a>
## Understand the implementation

The provider is stateless: it holds the resolved options and the global `fetch`, which uses the launcher's proxy dispatcher when one is configured.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry, `Config` defaults and load-time validation, provider registration |
| [`src/provider.ts`](src/provider.ts) | One bounded form POST per search, status and body checks, error classification |
| [`src/parse.ts`](src/parse.ts) | `parse5`-based extraction of organic results and challenge detection |

<a id="further-exploration"></a>
## Further Exploration

- [`dsh-web`](../web/README.md) — the provider registry and the selection rules `searchProvider` feeds.
- [`dsh-tool-web`](../tool-web/README.md) — how `web_search` renders these sources for the model.
- [`dsh-web-fetch-http`](../web-fetch-http/README.md) — the anonymous fetch backend the base composition pairs with this search provider.

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which renders each source's title, URL, and snippet under its search-result wrapper; the endpoint, region, and transport limits remain hidden.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the provider is a poor fit. They are current package constraints.

- **The HTML page is not a stable API** — DuckDuckGo can change its markup; results then stop parsing and searches return no sources until the parser follows the new markup.
- **Automated traffic can be refused** — bursts of searches from one address may receive DuckDuckGo's challenge page, which fails the search until DuckDuckGo lifts the throttle.
- **One page per search** — the provider reads only the first results page (about ten results) and offers no time, site, or safe-search filters beyond the region code.
- **Snippets are short** — sources carry DuckDuckGo's display snippet only; models fetch a page with `web_fetch` for its full text.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
