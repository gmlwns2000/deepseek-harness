/** Launcher-owned profile locations and composition inputs. */
import { join } from 'node:path'
import { composeEntries, loadProfileDirectory, PROFILE_PATCH_FILENAME, type Profile } from './profile.ts'
import { loadOptionalPatches } from './index.ts'
import type { PatchOptions } from '@deepseek-ai/cordis-plugin-include'

/** Application-owned package manager executable; environment applies only to package operations. */
export interface ProfilePnpmInvocation {
  readonly command: string
  readonly args: readonly string[]
  readonly env: Readonly<Record<string, string>>
}

/** Current profile facts; scheduling and mutation belong to their callers. */
export interface ProfileContext {
  readonly name: string
  /** Packaged applications supply their bundled runtime instead of a PATH executable. */
  readonly packageManager?: ProfilePnpmInvocation
  readonly dir: string
  readonly patchPath: string
  readonly installAnchor: string
  readonly cwd: string
  readonly home: string
  /** Bundle packages used to start this process, before any persisted edits. */
  readonly startedBundles: readonly string[]
  /** Parsed command-line overlays, applied above profile and home patches. */
  readonly overlays: readonly PatchOptions[]
  /** Launch-time DSH_TELEMETRY_DISABLED value; any non-empty value opts out. */
  readonly telemetryDisabledEnv: string | undefined
  /**
   * Launch-time DSH_TELEMETRY_ENABLED value; a non-empty value opts in to the upload rows,
   * which otherwise stay disabled. `telemetryDisabledEnv` still wins.
   */
  readonly telemetryEnabledEnv?: string | undefined
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Present only in a profile launched by dsh. */
    profileContext: ProfileContext
  }
}

/**
 * Rows that upload Session or usage data: feedback-released Session logs,
 * Desktop product analytics and its exporter, the Session-log and plugin
 * inventory fields attached to official DeepSeek requests, and the Settings
 * row that toggles the Session-log upload.
 */
const UPLOAD_ROW_IDS = [
  'session-telemetry-otel', 'product-analytics', 'desktop-product-telemetry',
  'session-log-deepseek', 'plugin-package-inventory-deepseek', 'ui-settings-session-log',
] as const

/**
 * Resolve the launch-time upload switches into boot patches. Upload rows stay
 * disabled unless `DSH_TELEMETRY_ENABLED` opts in, and ANY non-empty
 * `DSH_TELEMETRY_DISABLED` (including `'0'`/`'false'`) keeps them disabled
 * even then: a privacy switch prefers off-by-mistake over on-by-mistake. The
 * patches apply after every profile, home, and overlay patch, so a
 * configuration file cannot re-enable an upload. Only rows the composition
 * carries are patched.
 * @param switches - the raw `DSH_TELEMETRY_DISABLED` and `DSH_TELEMETRY_ENABLED` values (`undefined` when unset).
 * @param rowIds - ids of every row in the composed profile.
 * @returns one disable patch per present upload row; empty only for an opted-in launch.
 */
export function resolveTelemetryPatches(
  switches: { readonly disabled: string | undefined; readonly enabled: string | undefined },
  rowIds: ReadonlySet<string>,
): PatchOptions[] {
  if ((switches.disabled ?? '') === '' && (switches.enabled ?? '') !== '') return []
  return UPLOAD_ROW_IDS.filter(id => rowIds.has(id)).map(id => ({ id, disabled: true }))
}

/** Read the selected bundles' patches, which apply before the profile patch file.
 * @param binName Diagnostic prefix for malformed or missing configuration.
 * @param context Data supplied by the profile launcher.
 * @param initialProfile Already loaded startup profile; omitted reads the current files.
 * @returns Bundle patches in application order.
 */
export function readBundlePatches(binName: string, context: ProfileContext, initialProfile?: Profile): PatchOptions[] {
  const profile = initialProfile ?? loadProfileDirectory(binName, context.dir, context.installAnchor, { userLayer: false })
  return profile.layers.flatMap(layer => layer.patches)
}

/** Read current bundle and user layers with the launch-time overlays.
 * @param binName Diagnostic prefix for malformed or missing configuration.
 * @param context Data supplied by the profile launcher.
 * @param initialProfile Already loaded startup profile; omitted reads the current files.
 * @returns Detached ordered patches; this function does not update the Loader.
 */
export function readProfilePatches(binName: string, context: ProfileContext, initialProfile?: Profile): PatchOptions[] {
  const patches = structuredClone([
    ...readBundlePatches(binName, context, initialProfile),
    ...(initialProfile?.patches ?? loadOptionalPatches(binName, context.patchPath) ?? []),
    ...(loadOptionalPatches(binName, join(context.home, PROFILE_PATCH_FILENAME)) ?? []),
    ...context.overlays,
  ])
  patches.push(...resolveTelemetryPatches({ disabled: context.telemetryDisabledEnv, enabled: context.telemetryEnabledEnv },
    new Set(composeEntries([patches]).map(row => row.id))))
  return patches
}
