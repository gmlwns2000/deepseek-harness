import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { desktopTargetBuildPaths } from '../scripts/desktop-build-paths.mjs'
import { LOCAL_WINDOWS_PRODUCT_NAME, localWindowsInstallation, replaceLocalInstallation } from '../scripts/install-local-windows.ts'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

function root(): string {
  const directory = mkdtempSync(join(tmpdir(), 'desktop-local-install-'))
  roots.push(directory)
  return directory
}

function application(directory: string, marker: string): string {
  mkdirSync(join(directory, 'resources'), { recursive: true })
  writeFileSync(join(directory, 'DeepSeek Harness.exe'), marker)
  writeFileSync(join(directory, 'resources', 'app.asar'), marker)
  return directory
}

it('installs the unsigned win-arm64 directory per user under a name distinct from release installations', () => {
  const installation = localWindowsInstallation({ LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', APPDATA: 'C:\\Users\\u\\AppData\\Roaming' })
  expect(installation.source).toBe(join(desktopTargetBuildPaths('win-arm64', {}).unsignedArtifacts, 'win-arm64-unpacked'))
  expect(installation.directory).toBe(join('C:\\Users\\u\\AppData\\Local', 'Programs', LOCAL_WINDOWS_PRODUCT_NAME))
  expect(installation.executable).toBe(join(installation.directory, 'DeepSeek Harness.exe'))
  expect(installation.shortcut).toBe(join('C:\\Users\\u\\AppData\\Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'DeepSeek Harness Local.lnk'))
  expect(() => localWindowsInstallation({ APPDATA: 'C:\\Users\\u\\AppData\\Roaming' })).toThrow('LOCALAPPDATA and APPDATA are required')
})

it('replaces a previous installation completely and leaves no staging directories', () => {
  const base = root()
  const directory = join(base, 'Programs', LOCAL_WINDOWS_PRODUCT_NAME)
  replaceLocalInstallation(application(join(base, 'first'), 'first'), directory)
  writeFileSync(join(directory, 'stale.dll'), 'stale')
  replaceLocalInstallation(application(join(base, 'second'), 'second'), directory)
  expect(readFileSync(join(directory, 'DeepSeek Harness.exe'), 'utf8')).toBe('second')
  expect(readFileSync(join(directory, 'resources', 'app.asar'), 'utf8')).toBe('second')
  expect(readdirSync(directory).sort()).toEqual(['DeepSeek Harness.exe', 'resources'])
  expect(readdirSync(join(base, 'Programs'))).toEqual([LOCAL_WINDOWS_PRODUCT_NAME])
})

it('rejects a missing application build without touching the installation', () => {
  const base = root()
  const directory = application(join(base, 'Programs', LOCAL_WINDOWS_PRODUCT_NAME), 'installed')
  expect(() => { replaceLocalInstallation(join(base, 'missing'), directory) }).toThrow('package:desktop:win:arm64:dir')
  expect(readFileSync(join(directory, 'DeepSeek Harness.exe'), 'utf8')).toBe('installed')
})
