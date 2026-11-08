import type { DesktopBuildTarget } from './desktop-build-paths.mjs'

/** Required deployment-selected metadata for mandatory-update policy requests. */
export interface DesktopPolicyEnvironment {
  origin: string
  allowedPageOrigins: string[]
  allowedAuthOrigins?: string[]
  authentication: 'anonymous' | 'feishu-test'
  [key: string]: unknown
}

/**
 * Report whether a package embeds mandatory-update policy metadata.
 * Unsigned macOS packages and targets without a release carry none, so their packaging reads no policy settings.
 * @param target - Desktop build target.
 * @param unsigned - Whether the package skips release signing.
 * @returns Whether packaging resolves and embeds the policy.
 */
export function desktopPackageHasPolicy(target: DesktopBuildTarget, unsigned: boolean): boolean

/**
 * Resolve policy settings before artifact preparation or signing.
 * @param environment File-owned release settings; only the selected origin is required.
 * @returns Policy metadata with deployment-selected origin and authentication.
 */
export function resolveDesktopPolicyEnvironment(environment: NodeJS.ProcessEnv): DesktopPolicyEnvironment
