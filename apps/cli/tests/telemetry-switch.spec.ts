import { describe, expect, it } from 'vitest'
import { resolveTelemetryPatches } from '@deepseek-ai/dsh-app-boot'

const UPLOAD_ROWS = [
  'session-telemetry-otel', 'product-analytics', 'desktop-product-telemetry',
  'session-log-deepseek', 'plugin-package-inventory-deepseek', 'ui-settings-session-log',
]
const PROFILE_ROWS = new Set([...UPLOAD_ROWS, 'webserver', 'llm-deepseek'])
const ALL_DISABLED = UPLOAD_ROWS.map(id => ({ id, disabled: true }))

describe('resolveTelemetryPatches', () => {
  it('keeps every upload row disabled when neither switch is set', () => {
    expect(resolveTelemetryPatches({ disabled: undefined, enabled: undefined }, PROFILE_ROWS)).toEqual(ALL_DISABLED)
    expect(resolveTelemetryPatches({ disabled: '', enabled: '' }, PROFILE_ROWS)).toEqual(ALL_DISABLED)
  })

  it('leaves the upload rows to the profile only for an explicit opt-in', () => {
    expect(resolveTelemetryPatches({ disabled: undefined, enabled: '1' }, PROFILE_ROWS)).toEqual([])
    expect(resolveTelemetryPatches({ disabled: '', enabled: 'yes' }, PROFILE_ROWS)).toEqual([])
  })

  it('lets ANY non-empty DSH_TELEMETRY_DISABLED, including falsy-looking ones, override the opt-in', () => {
    for (const value of ['1', '0', 'false', 'no']) {
      expect(resolveTelemetryPatches({ disabled: value, enabled: '1' }, PROFILE_ROWS)).toEqual(ALL_DISABLED)
    }
  })

  it('patches only the upload rows the composition carries', () => {
    expect(resolveTelemetryPatches({ disabled: undefined, enabled: undefined }, new Set(['webserver']))).toEqual([])
    expect(resolveTelemetryPatches({ disabled: '1', enabled: undefined }, new Set(['session-telemetry-otel'])))
      .toEqual([{ id: 'session-telemetry-otel', disabled: true }])
  })
})
