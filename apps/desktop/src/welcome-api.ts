/** Operations available to the isolated native welcome renderer. */

import type { AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { ProductEventMap } from '@deepseek-ai/dsh-client-product-analytics/types'
import type { DesktopLocale } from './locale.ts'

/** Private native welcome channels, installed only while its window exists. */
export const WELCOME_IPC = {
  saveApiKey: 'dsh-welcome:save-api-key',
  analytics: 'dsh-welcome:analytics',
  analyticsEnabled: 'dsh-welcome:analytics-enabled',
  skip: 'dsh-welcome:skip',
  start: 'dsh-welcome:start',
  cancel: 'dsh-welcome:cancel',
  copyLink: 'dsh-welcome:copy-link',
  state: 'dsh-welcome:state',
  takeNotice: 'dsh-welcome:take-notice',
  discoverLocalModels: 'dsh-welcome:discover-local-models',
  saveLocalModel: 'dsh-welcome:save-local-model',
} as const

/** Credential writes return a safe outcome without exposing Host diagnostics. */
export type WelcomeSaveResult = { readonly ok: true } | { readonly ok: false }

/** OpenAI-compatible server facts entered on the local-model page. */
export interface WelcomeLocalServer {
  /** Absolute `http:` or `https:` base URL without embedded user information. */
  readonly baseURL: string
  /** Key for a server that requires one; omitted for a keyless server. */
  readonly apiKey?: string
}

/** Model listing returns ids only; endpoint diagnostics stay in the Host. */
export type WelcomeDiscoveryResult =
  | { readonly ok: true; readonly models: readonly string[] }
  | { readonly ok: false }

/**
 * Accept a key the credential service can store: printable ASCII without spaces.
 * @param value - trimmed key text.
 * @returns whether the value is storable.
 */
export function isWelcomeApiKey(value: string): boolean {
  return /^[\x21-\x7e]+$/.test(value)
}

/**
 * Accept a local server base URL that the provider configuration can store in plain text.
 * @param value - trimmed URL text.
 * @returns whether the value is an absolute `http:` or `https:` URL without user information.
 */
export function isWelcomeServerUrl(value: string): boolean {
  if (!URL.canParse(value)) return false
  const url = new URL(value)
  return (url.protocol === 'http:' || url.protocol === 'https:') && url.username === '' && url.password === ''
}

/**
 * Accept a model id a request can name.
 * @param value - trimmed model id.
 * @returns whether the id is nonempty and has no whitespace or control characters.
 */
export function isWelcomeModelId(value: string): boolean {
  return /^[^\s\p{C}]+$/u.test(value)
}

/**
 * Validate a renderer-supplied local server payload at the IPC boundary.
 * @param value - untrusted IPC argument.
 * @returns the server facts, or undefined when any field is malformed.
 */
export function parseWelcomeLocalServer(value: unknown): WelcomeLocalServer | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const { baseURL, apiKey, ...rest } = value as Record<string, unknown>
  if (Object.keys(rest).length > 0 || typeof baseURL !== 'string' || !isWelcomeServerUrl(baseURL)) return undefined
  if (apiKey === undefined) return { baseURL }
  return typeof apiKey === 'string' && isWelcomeApiKey(apiKey) ? { baseURL, apiKey } : undefined
}

/** One-time notification retained by the main process until Welcome receives it. */
export type WelcomeNotice = 'session-expired'

type WelcomeEventName = 'auth_page_view' | 'auth_page_click' | 'api_key_save_click'

/** Host-owned operations used by the welcome window. */
export interface WelcomeOperations {
  /** @param eventName - allowed welcome event. @param attributes - approved fields without credentials. */
  analytics?<K extends WelcomeEventName>(eventName: K, attributes: ProductEventMap[K]): Promise<void>
  /** @returns the Host's current effective collection policy. */
  analyticsEnabled(): Promise<boolean>
  /** @returns the pending notification, clearing it before another renderer can receive it. */
  takeNotice(): Promise<WelcomeNotice | undefined>
  /** @returns account state after starting a login attempt. */
  startSignIn(): Promise<AccountView>
  /** @param id - attempt to cancel. @returns the settled state. */
  cancelSignIn(id: SignInAttemptId): Promise<AccountView>
  /** @param id - current waiting attempt whose authorization URL is copied to the system clipboard. */
  copySignInLink(id: SignInAttemptId): Promise<void>

  /**
   * Store the official provider's key before entering the workspace.
   * @param value - validated, trimmed API key.
   * @returns whether the write completed, without private error details.
   */
  saveApiKey(value: string): Promise<WelcomeSaveResult>
  /**
   * List the model ids a local OpenAI-compatible server advertises; nothing is stored.
   * @param server - validated endpoint and optional key used for this request only.
   * @returns advertised ids, or a refusal without endpoint diagnostics.
   */
  discoverLocalModels(server: WelcomeLocalServer): Promise<WelcomeDiscoveryResult>
  /**
   * Store the local server as the default model route, then enter the workspace.
   * @param server - validated endpoint and optional key.
   * @param model - validated model id for new sessions.
   * @returns whether every write completed, without private error details.
   */
  saveLocalModel(server: WelcomeLocalServer, model: string): Promise<WelcomeSaveResult>
  /**
   * Enter the workspace without writing an onboarding-completion setting.
   * @returns completion after the workspace opens.
   */
  skip(): Promise<void>
}

/** The renderer receives localized copy, login operations, and safe account snapshots. */
export type WelcomeApi = DesktopLocale & WelcomeOperations & {
  /** @param listener - safe account snapshot recipient. @returns subscription disposer. */
  onAccountState(listener: (state: AccountView) => void): () => void
}

/** Authentication facts supplied at cold start or after a completed sign-out. */
export interface WelcomeAuthentication {
  readonly loggedIn: boolean
  readonly hasApiKey: boolean
}

/**
 * Decide whether a startup or sign-out requires the welcome entry.
 * @param authentication - current account and independently stored API-key facts.
 * @returns true only when neither authentication route is configured.
 */
export function needsWelcome(authentication: WelcomeAuthentication): boolean {
  return !authentication.loggedIn && !authentication.hasApiKey
}
