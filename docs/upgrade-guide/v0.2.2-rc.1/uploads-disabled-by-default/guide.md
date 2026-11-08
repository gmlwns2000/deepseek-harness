---
kind: upgrade-guide
description: "Launched profiles disable every Session and usage-data upload unless the launching environment sets DSH_TELEMETRY_ENABLED."
---

# Session and usage-data uploads are off unless the launch opts in

English | [中文](guide.zh.md)

## Change

Previously, launched profiles uploaded the complete Session log on explicit feedback (`session-telemetry-otel`, `FEEDBACK_ONLY`), attached Session-log suffixes and the plugin package list to official DeepSeek requests (`session-log-deepseek`, `plugin-package-inventory-deepseek`), and sent Desktop product analytics (`product-analytics`, `desktop-product-telemetry`); only `DSH_TELEMETRY_DISABLED` turned the feedback upload off. Now the launcher patches all of these rows, and the Settings row that toggles the Session-log upload (`ui-settings-session-log`), disabled after every profile, home, and overlay patch. They stay mounted only when the launching environment sets `DSH_TELEMETRY_ENABLED` to a non-empty value and leaves `DSH_TELEMETRY_DISABLED` empty. Feedback is still recorded in the Session log; it is no longer uploaded. Every product launched through `dsh` observes the change, including Web and Desktop.

## Migration

1. To keep the previous uploads, set `DSH_TELEMETRY_ENABLED=1` in the environment that launches `dsh` or Desktop; `.env` files cannot set it. Confirm: `dsh --profile <profile> --dump-config` shows `session-telemetry-otel` without `disabled: true`, and **Settings → General** shows the Session-log upload toggle again.
2. To keep uploads off, no action is needed; a profile patch that sets `disabled: false` on these rows no longer turns them on. Confirm: the `--dump-config` output ends with `disabled: true` patches for the upload rows present in the profile.
