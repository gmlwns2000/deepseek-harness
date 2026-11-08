import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DESKTOP_BUILD_TARGETS,
  desktopTargetBuildPaths,
  desktopTargetHasRelease,
  desktopTargetPlatform,
  desktopWindowsUnpackedDirectory,
  developmentRuntimeDirectory,
  resolveDesktopBuildTarget,
  resolveDesktopTargetBuildPaths,
} from '../scripts/desktop-build-paths.mjs'
import { desktopPackageHasPolicy } from '../scripts/desktop-policy-environment.mjs'

describe('desktop build paths', () => {
  it('marks only win-arm64 as a target without release packaging or update policy', () => {
    expect(DESKTOP_BUILD_TARGETS.filter(target => !desktopTargetHasRelease(target))).toEqual(['win-arm64'])
    expect(DESKTOP_BUILD_TARGETS.filter(target => desktopPackageHasPolicy(target, false))).toEqual(['mac-arm64', 'mac-x64', 'win-x64'])
    expect(DESKTOP_BUILD_TARGETS.filter(target => desktopPackageHasPolicy(target, true))).toEqual(['win-x64'])
    expect(() => desktopTargetHasRelease('linux-x64' as 'mac-x64')).toThrow(/unsupported target/u)
  })

  it('names the unpacked directory electron-builder writes for each Windows target', () => {
    expect(desktopWindowsUnpackedDirectory('win-x64')).toBe('win-unpacked')
    expect(desktopWindowsUnpackedDirectory('win-arm64')).toBe('win-arm64-unpacked')
    expect(() => desktopWindowsUnpackedDirectory('mac-arm64' as 'win-x64')).toThrow(/not a Windows target/u)
  })

  it('isolates every mutable build directory by complete target', () => {
    const arm64 = desktopTargetBuildPaths('mac-arm64')
    const x64 = desktopTargetBuildPaths('mac-x64')
    const windows = desktopTargetBuildPaths('win-x64')
    const windowsArm64 = desktopTargetBuildPaths('win-arm64')
    const mutableKeys = [
      'root',
      'artifacts',
      'unsignedArtifacts',
      'unnotarizedArtifacts',
      'runtime',
      'packageSet',
      'dsh',
      'dshPnpm',
      'electron',
      'packedDsh',
      'packedVendor',
      'packedLandlock',
    ] as const

    for (const key of mutableKeys) {
      expect(new Set([arm64[key], x64[key], windows[key], windowsArm64[key]]).size).toBe(4)
    }
    expect(arm64.artifacts).toContain(join('targets', 'mac-arm64', 'artifacts'))
    expect(x64.dsh).toContain(join('targets', 'mac-x64', 'dsh'))
    expect(windows.runtime).toContain(join('targets', 'win-x64', 'runtime'))
    expect(windowsArm64.runtime).toContain(join('targets', 'win-arm64', 'runtime'))
  })

  it('shares download and package caches outside target output directories', () => {
    const arm64 = desktopTargetBuildPaths('mac-arm64')
    const x64 = desktopTargetBuildPaths('mac-x64')
    expect(arm64.downloads).toBe(x64.downloads)
    expect(arm64.downloads).not.toContain(`${sep}targets${sep}`)
    expect(arm64.pnpmStore).toBe(x64.pnpmStore)
    expect(arm64.pnpmStore).not.toContain(`${sep}targets${sep}`)
  })

  it('retains target outputs while relocating caches through the supplied environment', () => {
    const cache = resolve('external-package-cache')
    const environment = { DSH_DESKTOP_PACKAGE_CACHE_DIR: cache }
    const defaults = desktopTargetBuildPaths('win-x64', {})
    const paths = resolveDesktopTargetBuildPaths(environment, 'win32', 'x64')
    expect(paths).toEqual({ ...defaults, downloads: join(cache, 'downloads'), pnpmStore: join(cache, 'pnpm-store') })
    expect(desktopTargetBuildPaths('mac-arm64', environment).pnpmStore).toBe(paths.pnpmStore)
    for (const target of ['mac-arm64', 'mac-x64', 'win-x64', 'win-arm64'] as const) {
      const configured = desktopTargetBuildPaths(target, environment)
      expect(configured.downloads).toBe(join(cache, 'downloads'))
      expect(configured.pnpmStore).toBe(join(cache, 'pnpm-store'))
      expect(configured.root).not.toContain(cache)
    }
    expect(defaults.pnpmStore).toBe(resolve(defaults.root, '../..', 'pnpm-store'))
  })

  it.each(['', ' ', 'relative/cache', './cache', 'cache\0invalid'])('rejects invalid cache directory %j', (directory) => {
    expect(() => desktopTargetBuildPaths('win-x64', { DSH_DESKTOP_PACKAGE_CACHE_DIR: directory }))
      .toThrow('DSH_DESKTOP_PACKAGE_CACHE_DIR')
  })

  it('resolves the development primary runtime from the build target', () => {
    expect(developmentRuntimeDirectory({}, 'darwin', 'arm64'))
      .toContain(join('targets', 'mac-arm64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({}, 'darwin', 'x64'))
      .toContain(join('targets', 'mac-x64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({}, 'win32', 'arm64'))
      .toContain(join('targets', 'win-arm64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({ DSH_DESKTOP_TARGET_ARCH: 'x64' }, 'win32', 'arm64'))
      .toContain(join('targets', 'win-x64', 'runtime', 'primary-runtime'))
  })

  it('maps every target to the platform and architecture of the payload it prepares', () => {
    expect(desktopTargetPlatform('mac-arm64')).toEqual({ platform: 'darwin', arch: 'arm64' })
    expect(desktopTargetPlatform('mac-x64')).toEqual({ platform: 'darwin', arch: 'x64' })
    expect(desktopTargetPlatform('win-x64')).toEqual({ platform: 'win32', arch: 'x64' })
    expect(desktopTargetPlatform('win-arm64')).toEqual({ platform: 'win32', arch: 'arm64' })
    expect(() => desktopTargetPlatform('linux-x64' as 'mac-x64')).toThrow(/unsupported target/u)
  })

  it('selects the Windows architecture from a Windows host and x64 from other hosts', () => {
    expect(resolveDesktopBuildTarget({}, 'win32', 'x64')).toBe('win-x64')
    expect(resolveDesktopBuildTarget({}, 'win32', 'arm64')).toBe('win-arm64')
    expect(resolveDesktopBuildTarget({ DSH_DESKTOP_TARGET_PLATFORM: 'win32' }, 'darwin', 'arm64')).toBe('win-x64')
    expect(resolveDesktopBuildTarget({ npm_config_platform: 'win32', npm_config_arch: 'arm64' }, 'linux', 'x64')).toBe('win-arm64')
  })

  it('resolves environment overrides and rejects unsupported targets', () => {
    expect(resolveDesktopBuildTarget({
      DSH_DESKTOP_TARGET_PLATFORM: 'darwin',
      DSH_DESKTOP_TARGET_ARCH: 'x64',
    }, 'darwin', 'arm64')).toBe('mac-x64')
    expect(() => resolveDesktopBuildTarget({}, 'linux', 'x64')).toThrow(/unsupported target/u)
    expect(() => desktopTargetBuildPaths('linux-x64' as 'mac-x64')).toThrow(/unsupported target/u)
  })
})
