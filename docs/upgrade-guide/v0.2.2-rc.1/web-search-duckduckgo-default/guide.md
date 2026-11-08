---
kind: upgrade-guide
description: "The shipped Search default moves from the DeepSeek Search API to anonymous DuckDuckGo, and the DeepSeek web providers are disabled."
---

# Search defaults to DuckDuckGo; the DeepSeek web providers are disabled

English | [中文](guide.zh.md)

## Change

Previously, the shared base composition set `web.searchProvider` to `deepseek-search-api` and mounted the DeepSeek web providers: `deepseek-official` from the `web-search-deepseek` row, and `deepseek-search-api` and `deepseek-fetch-api` from the `web-deepseek-api` row. Searches went to the DeepSeek Search API with the conversation's DeepSeek credential. Now the base mounts `@deepseek-ai/dsh-web-search-duckduckgo`, sets `searchProvider: duckduckgo`, and disables the `web-search-deepseek` and `web-deepseek-api` rows. Each search is one form POST from the machine to DuckDuckGo's HTML results page, with no API key or charge; no web request passes through a DeepSeek service. Fetch still defaults to `http`.

A profile patch or settings document that selects `deepseek-search-api`, `deepseek-official`, or `deepseek-fetch-api` now names an unregistered provider, so `web_search` or `web_fetch` fails with `WEB_PROVIDER_CONFIGURED_MISSING`. Compositions that mount their own web rows see no change.

## Migration

1. To use the new defaults, delete any `searchProvider` or `fetchProvider` naming a DeepSeek provider from the `web` row in `$DSH_HOME/profiles/<profile>/cordis.patch.yml`, or select DuckDuckGo and the local fetcher on the Web search and fetch settings page. Confirm: the Web search provider menu shows DuckDuckGo, and a search returns sources.
2. To keep a DeepSeek web provider, re-enable its row and select it in the profile patch:

   ```yaml
   - id: web-deepseek-api
     disabled: false
   - id: web-search-deepseek
     disabled: false
   - id: web
     config:
       searchProvider: deepseek-search-api
       fetchProvider: http
   ```

   Confirm: `dsh --profile <profile> --dump-config` shows both rows without `disabled: true`, and the Web search provider menu lists the DeepSeek providers.
