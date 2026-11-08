/** Resolve target-owned Desktop outputs and shared package caches. */

import { isAbsolute, join, resolve } from 'node:path'

const APP_ROOT = resolve(import.meta.dirname, '..')
const BUILD_ROOT = join(APP_ROOT, '.desktop-build')
/** Every supported Desktop build target name. */
export const DESKTOP_BUILD_TARGETS = Object.freeze(/** @type {const} */ (['mac-arm64', 'mac-x64', 'win-x64', 'win-arm64']))
const SUPPORTED_TARGETS = new Set(DESKTOP_BUILD_TARGETS)

/**
 * Resolve the build target selected by a packaging environment.
 * Without an architecture override, a Windows target uses the architecture of a Windows host and x64 from any other host.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64'} Supported Desktop target name.
 */
export function resolveDesktopBuildTarget(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  const platform = env.DSH_DESKTOP_TARGET_PLATFORM ?? env.npm_config_platform ?? hostPlatform
  const windows = platform === 'win32' || platform === 'win'
  const arch = env.DSH_DESKTOP_TARGET_ARCH ?? env.npm_config_arch
    ?? (windows && hostPlatform !== 'win32' ? 'x64' : hostArch)
  const os = platform === 'darwin' ? 'mac' : windows ? 'win' : platform
  const target = `${os}-${arch}`
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`desktop build paths: unsupported target ${target}`)
  }
  return /** @type {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64'} */ (target)
}

function assertSupportedTarget(target) {
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`desktop build paths: unsupported target ${String(target)}`)
  }
}

/**
 * Report whether a build target has release packaging: installers, signing, update publication and update policy.
 * `win-arm64` has none; it packages only unsigned local application directories.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64'} target - Supported Desktop target name.
 * @returns {boolean} Whether the target is a release target.
 */
export function desktopTargetHasRelease(target) {
  assertSupportedTarget(target)
  return target !== 'win-arm64'
}

/**
 * Name the unpacked application directory electron-builder writes for a Windows target inside its artifact directory.
 * @param {'win-x64' | 'win-arm64'} target - Windows Desktop target name.
 * @returns {'win-unpacked' | 'win-arm64-unpacked'} Directory name.
 */
export function desktopWindowsUnpackedDirectory(target) {
  if (target === 'win-x64') return 'win-unpacked'
  if (target === 'win-arm64') return 'win-arm64-unpacked'
  throw new Error(`desktop build paths: ${String(target)} is not a Windows target`)
}

/**
 * Return the mutable preparation and artifact directories owned by one build target.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64'} target - Supported Desktop target name.
 * @param {NodeJS.ProcessEnv} environment - Packaging environment with an optional absolute cache directory.
 * @returns {{ root: string, artifacts: string, unsignedArtifacts: string, unnotarizedArtifacts: string, runtime: string, packageSet: string, dsh: string, dshPnpm: string, electron: string, packedDsh: string, packedVendor: string, packedLandlock: string, downloads: string, pnpmStore: string }} Target paths plus shared download and package caches.
 */
export function desktopTargetBuildPaths(target, environment = process.env) {
  assertSupportedTarget(target)
  const cacheRoot = environment.DSH_DESKTOP_PACKAGE_CACHE_DIR ?? BUILD_ROOT
  if (!cacheRoot.trim() || !isAbsolute(cacheRoot) || cacheRoot.includes('\0')) {
    throw new Error('desktop package: DSH_DESKTOP_PACKAGE_CACHE_DIR must be a nonempty absolute directory')
  }
  const root = join(BUILD_ROOT, 'targets', target)
  const packed = join(root, 'packed')
  return {
    root,
    artifacts: join(root, 'artifacts'),
    unsignedArtifacts: join(root, 'unsigned-artifacts'),
    unnotarizedArtifacts: join(root, 'unnotarized-artifacts'),
    runtime: join(root, 'runtime'),
    packageSet: join(root, 'package-set'),
    dsh: join(root, 'dsh'),
    dshPnpm: join(root, 'dsh-pnpm'),
    electron: join(root, 'electron'),
    packedDsh: join(packed, 'dsh'),
    packedVendor: join(packed, 'vendor'),
    packedLandlock: join(packed, 'landlock'),
    downloads: join(cacheRoot, 'downloads'),
    pnpmStore: join(cacheRoot, 'pnpm-store'),
  }
}

/**
 * Return the platform and architecture of the payload one build target prepares.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64' | 'win-arm64'} target - Supported Desktop target name.
 * @returns {{ platform: 'darwin' | 'win32', arch: 'arm64' | 'x64' }} Platform and architecture of the prepared payload.
 */
export function desktopTargetPlatform(target) {
  assertSupportedTarget(target)
  const targets = /** @type {const} */ ({
    'mac-arm64': { platform: 'darwin', arch: 'arm64' },
    'mac-x64': { platform: 'darwin', arch: 'x64' },
    'win-x64': { platform: 'win32', arch: 'x64' },
    'win-arm64': { platform: 'win32', arch: 'arm64' },
  })
  return targets[target]
}

/**
 * Resolve the paths owned by the target selected in a packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {ReturnType<typeof desktopTargetBuildPaths>} Selected target paths.
 */
export function resolveDesktopTargetBuildPaths(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  return desktopTargetBuildPaths(resolveDesktopBuildTarget(env, hostPlatform, hostArch), env)
}

/**
 * Resolve the primary-runtime directory an unpackaged development launch uses.
 * Target overrides can select a payload architecture other than the launching process's,
 * so the launcher supplies this directory instead of the shell deriving it.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {string} Primary-runtime directory prepared for the selected target.
 */
export function developmentRuntimeDirectory(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  return join(resolveDesktopTargetBuildPaths(env, hostPlatform, hostArch).runtime, 'primary-runtime')
}

/**
 * Select the output directory and filename suffix for one packaging mode.
 * @param {{ artifacts: string, unsignedArtifacts: string, unnotarizedArtifacts: string }} paths Target artifact directories.
 * @param {{ unsigned: boolean, skipNotarization: boolean }} mode Validated packaging mode.
 * @returns {{ directory: string, suffix: string }} Matching artifact destination and filename marker.
 */
export function desktopArtifactOutput(paths, mode) {
  if (mode.unsigned) return { directory: paths.unsignedArtifacts, suffix: '-unsigned' }
  if (mode.skipNotarization) return { directory: paths.unnotarizedArtifacts, suffix: '-unnotarized' }
  return { directory: paths.artifacts, suffix: '' }
}
