/** Install the latest unsigned win-arm64 application directory for the current user and add a Start menu shortcut. */

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { desktopArtifactOutput, desktopTargetBuildPaths, desktopWindowsUnpackedDirectory } from './desktop-build-paths.mjs'

/** Installation and shortcut name, distinct from release installations so neither replaces the other. */
export const LOCAL_WINDOWS_PRODUCT_NAME = 'DeepSeek Harness Local'
const EXECUTABLE = 'DeepSeek Harness.exe'

/** Locations one local installation reads and writes. */
export interface LocalWindowsInstallation {
  /** Unpacked application directory written by `package:win:arm64:dir`. */
  readonly source: string
  /** Per-user installation directory that each install replaces. */
  readonly directory: string
  /** Installed executable the shortcut launches. */
  readonly executable: string
  /** Start menu shortcut for the current user. */
  readonly shortcut: string
}

/**
 * Resolve the build output and per-user destinations of a local win-arm64 installation.
 * @param environment - Supplies `LOCALAPPDATA`, `APPDATA` and the optional Desktop package cache directory.
 * @returns Source directory, installation directory, installed executable and Start menu shortcut path.
 */
export function localWindowsInstallation(environment: NodeJS.ProcessEnv = process.env): LocalWindowsInstallation {
  const { LOCALAPPDATA: local, APPDATA: roaming } = environment
  if (!local || !roaming) throw new Error('desktop local install: LOCALAPPDATA and APPDATA are required')
  const artifacts = desktopArtifactOutput(desktopTargetBuildPaths('win-arm64', environment), { unsigned: true, skipNotarization: false }).directory
  const directory = join(local, 'Programs', LOCAL_WINDOWS_PRODUCT_NAME)
  return {
    source: join(artifacts, desktopWindowsUnpackedDirectory('win-arm64')),
    directory,
    executable: join(directory, EXECUTABLE),
    shortcut: join(roaming, 'Microsoft', 'Windows', 'Start Menu', 'Programs', `${LOCAL_WINDOWS_PRODUCT_NAME}.lnk`),
  }
}

/**
 * Replace the installation directory with a complete copy of the application directory.
 * The previous installation stays in place until the copy finishes. A running installed application keeps its
 * directory locked, so replacement then fails, removes the staged copy, and leaves the previous installation intact.
 * @param source - Unpacked application directory containing `DeepSeek Harness.exe`.
 * @param directory - Installation directory.
 * @throws When the source has no executable, or the previous installation cannot be moved aside.
 */
export function replaceLocalInstallation(source: string, directory: string): void {
  if (!existsSync(join(source, EXECUTABLE))) {
    throw new Error(`desktop local install: ${source} has no ${EXECUTABLE}; run pnpm run package:desktop:win:arm64:dir first`)
  }
  const suffix = randomUUID()
  const staged = `${directory}.new-${suffix}`
  const previous = `${directory}.old-${suffix}`
  mkdirSync(dirname(directory), { recursive: true })
  try {
    cpSync(source, staged, { recursive: true })
    if (existsSync(directory)) {
      try { renameSync(directory, previous) } catch (error) {
        throw new Error(`desktop local install: cannot replace ${directory}; quit ${LOCAL_WINDOWS_PRODUCT_NAME} and retry`, { cause: error })
      }
    }
    try { renameSync(staged, directory) } catch (error) {
      if (existsSync(previous)) renameSync(previous, directory)
      throw error
    }
  } finally {
    rmSync(staged, { recursive: true, force: true })
  }
  rmSync(previous, { recursive: true, force: true })
}

/**
 * Create or replace a Start menu shortcut through the Windows Script Host shell object.
 * @param shortcut - `.lnk` path in the current user's Start menu.
 * @param executable - Application executable; its directory becomes the working directory and its first icon the shortcut icon.
 */
export function writeStartMenuShortcut(shortcut: string, executable: string): void {
  mkdirSync(dirname(shortcut), { recursive: true })
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', [
    '$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($env:DSH_DESKTOP_SHORTCUT_PATH)',
    '$shortcut.TargetPath = $env:DSH_DESKTOP_SHORTCUT_TARGET',
    '$shortcut.WorkingDirectory = Split-Path -Parent $env:DSH_DESKTOP_SHORTCUT_TARGET',
    '$shortcut.IconLocation = "$($env:DSH_DESKTOP_SHORTCUT_TARGET),0"',
    '$shortcut.Save()',
  ].join('; ')], {
    env: { ...process.env, DSH_DESKTOP_SHORTCUT_PATH: shortcut, DSH_DESKTOP_SHORTCUT_TARGET: executable },
    stdio: 'inherit', windowsHide: true,
  })
}

if (import.meta.main) {
  if (process.platform !== 'win32' || process.arch !== 'arm64') throw new Error('desktop local install: requires a Windows arm64 host')
  const installation = localWindowsInstallation()
  replaceLocalInstallation(installation.source, installation.directory)
  writeStartMenuShortcut(installation.shortcut, installation.executable)
  console.log(`desktop local install: installed ${installation.directory}; Start menu entry "${LOCAL_WINDOWS_PRODUCT_NAME}"`)
}
