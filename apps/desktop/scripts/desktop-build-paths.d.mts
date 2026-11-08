import type { DesktopAutoUpdateTarget } from './desktop-auto-update-environment.mjs'

/** Desktop build target: every release target plus Windows arm64, which builds development payloads and unsigned local packages but has no release. */
export type DesktopBuildTarget = DesktopAutoUpdateTarget | 'win-arm64'

/** Every supported Desktop build target name. */
export const DESKTOP_BUILD_TARGETS: readonly DesktopBuildTarget[]

/**
 * Report whether a build target has release packaging: installers, signing, update publication and update policy.
 * `win-arm64` has none; it packages only unsigned local application directories.
 * @param target - Supported Desktop target name.
 * @returns Whether the target is a release target.
 */
export function desktopTargetHasRelease(target: DesktopBuildTarget): target is DesktopAutoUpdateTarget

/**
 * Name the unpacked application directory electron-builder writes for a Windows target inside its artifact directory.
 * @param target - Windows Desktop target name.
 * @returns Directory name.
 */
export function desktopWindowsUnpackedDirectory(target: 'win-x64' | 'win-arm64'): 'win-unpacked' | 'win-arm64-unpacked'

/** Mutable target directories plus shared download and package caches. */
export interface DesktopTargetBuildPaths {
  readonly root: string
  readonly artifacts: string
  readonly unsignedArtifacts: string
  readonly unnotarizedArtifacts: string
  readonly runtime: string
  readonly packageSet: string
  readonly dsh: string
  readonly dshPnpm: string
  readonly electron: string
  readonly packedDsh: string
  readonly packedVendor: string
  readonly packedLandlock: string
  readonly downloads: string
  readonly pnpmStore: string
}

/**
 * Resolve the build target selected by a packaging environment.
 * Without an architecture override, a Windows target uses the architecture of a Windows host and x64 from any other host.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Supported Desktop target name.
 */
export function resolveDesktopBuildTarget(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopBuildTarget

/**
 * Return the mutable preparation and artifact directories owned by one build target.
 * @param target - Supported Desktop target name.
 * @param environment - Packaging environment with an optional absolute cache directory.
 * @returns Target paths plus shared download and package caches.
 */
export function desktopTargetBuildPaths(target: DesktopBuildTarget, environment?: NodeJS.ProcessEnv): DesktopTargetBuildPaths

/**
 * Return the platform and architecture of the payload one build target prepares.
 * @param target - Supported Desktop target name.
 * @returns Platform and architecture of the prepared payload.
 */
export function desktopTargetPlatform(target: DesktopBuildTarget): {
  readonly platform: 'darwin' | 'win32'
  readonly arch: 'arm64' | 'x64'
}

/**
 * Resolve the paths owned by the target selected in a packaging environment.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Selected target paths.
 */
export function resolveDesktopTargetBuildPaths(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): DesktopTargetBuildPaths

/**
 * Resolve the primary-runtime directory an unpackaged development launch uses.
 * @param env - Packaging environment.
 * @param hostPlatform - Build-host platform used when no target override exists.
 * @param hostArch - Build-host architecture used when no target override exists.
 * @returns Primary-runtime directory prepared for the selected target.
 */
export function developmentRuntimeDirectory(
  env?: NodeJS.ProcessEnv,
  hostPlatform?: NodeJS.Platform,
  hostArch?: string,
): string

/**
 * Select the output directory and filename suffix for one packaging mode.
 * @param paths Target artifact directories.
 * @param mode Validated packaging mode.
 * @returns Matching artifact destination and filename marker.
 */
export function desktopArtifactOutput(
  paths: Pick<DesktopTargetBuildPaths, 'artifacts' | 'unsignedArtifacts' | 'unnotarizedArtifacts'>,
  mode: { unsigned: boolean, skipNotarization: boolean },
): { directory: string, suffix: string }
