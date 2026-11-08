---
kind: upgrade-guide
description: "The built-in Korean language registration conflicts with third-party language packs using the ko id."
---

# Built-in Korean replaces Korean language packs

English | [中文](guide.zh.md)

## Change

The locale plugin registers `ko` (한국어) with dictionaries for `common`, `settings.locale`, and the built-in UI plugins, and browsers or operating systems requesting `ko` or `ko-KR` now open in Korean. A third-party language pack that registers `ko` now fails with an already-registered language or dictionary error.

## Migration

1. In the language pack's client entry, remove `ctx.locale.addLanguage(...)` for `ko` and dictionary registrations for `ko` in namespaces supplied by built-in plugins. Keep `ko` translations for namespaces owned by your own plugins.
2. If the pack represents a distinct Korean variant, register a separate BCP 47-style id, such as `ko-KP`, for both the definition and its dictionaries instead of `ko`.
3. Reload the application with the pack enabled. Confirm it starts without duplicate-registration errors and that selecting the intended language displays its translations.
