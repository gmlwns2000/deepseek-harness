/** Desktop welcome presentation; account and credential operations stay in the preload. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Toast } from '@deepseek-ai/dsh-client-ui-primitives/src/Toast.tsx'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives/src/StateDot.tsx'
import type { AccountView } from '@deepseek-ai/dsh-deepseek-account/types'
import { formatDesktopMessage } from '../locale.ts'
import { isWelcomeModelId, isWelcomeServerUrl, type WelcomeApi } from '../welcome-api.ts'

type Page = 'entry' | 'key' | 'local' | 'account'
/** Local-model input that a failure message describes; `form` names a whole-form failure. */
type LocalField = 'url' | 'model' | 'key' | 'form'

/** Reject pasted text that is not the key itself: non-ASCII, an assignment, or a quoted value. */
function invalidKeyDraft(value: string): boolean {
  return !/^[\x21-\x7e]+$/.test(value) || /^[A-Z][A-Z0-9_]*=[^=]/.test(value)
    || ((value.startsWith('"') || value.startsWith("'") || value.charCodeAt(0) === 96) && value.at(-1) === value[0])
}

/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * Clearing the account attempt returns the sign-in status page to the initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export function Welcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [expiryNotice, setExpiryNotice] = useState(false)
  const [page, setPage] = useState<Page>('entry')
  const pageRef = useRef<Page>('entry')
  const visiblePage = useRef<Page>('entry')
  const [attempt, setAttempt] = useState<AccountView['attempt']>(null)
  const attemptRef = useRef<AccountView['attempt']>(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ status: 'idle' | 'busy' | 'copied' | 'failed' }>({ status: 'idle' })
  const copyState = copyFeedback.status
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const revision = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const keyButton = useRef<HTMLButtonElement>(null)
  const localButton = useRef<HTMLButtonElement>(null)
  const entryFocus = useRef<HTMLButtonElement | null>(null)
  const [localUrl, setLocalUrl] = useState('')
  const [localModel, setLocalModel] = useState('')
  const [localKey, setLocalKey] = useState('')
  const [localModels, setLocalModels] = useState<readonly string[]>([])
  const [localError, setLocalError] = useState<{ field: LocalField; message: string } | null>(null)
  const [localStatus, setLocalStatus] = useState('')
  const [finding, setFinding] = useState(false)
  const findRevision = useRef(0)
  const urlInput = useRef<HTMLInputElement>(null)
  const modelInput = useRef<HTMLInputElement>(null)
  const localKeyInput = useRef<HTMLInputElement>(null)

  function navigate(next: Page) {
    pageRef.current = next
    setPage(next)
  }
  function showAccount(state: AccountView) {
    if (pageRef.current === 'key' || pageRef.current === 'local' || (state.attempt === null && pageRef.current === 'entry')) return
    attemptRef.current = state.attempt
    setAttempt(state.attempt)
    setStarting(false)
    setCopyFeedback({ status: 'idle' })
    navigate(state.attempt === null || state.attempt.phase === 'cancelled' ? 'entry' : 'account')
  }

  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    const takeNotice = (): void => {
      void api.takeNotice().then((notice) => {
        if (mounted.current && notice === 'session-expired') setExpiryNotice(true)
      }).catch((_closedChannel: unknown) => {
        // A closed Welcome IPC channel must not interrupt the sign-in page.
      })
    }
    takeNotice()
    const stop = api.onAccountState((state) => {
      revision.current++
      takeNotice()
      showAccount(state)
    })
    return () => { mounted.current = false; stop() }
  }, [api, m.welcomeTitle])

  useEffect(() => {
    if (page === 'entry' && visiblePage.current !== 'entry') void api.analytics?.('auth_page_view', {})
    visiblePage.current = page
    if (page === 'key') input.current?.focus()
    else if (page === 'local') urlInput.current?.focus()
    else if (page === 'entry' && entryFocus.current !== null) {
      entryFocus.current.focus()
      entryFocus.current = null
    }
  }, [page, api])

  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'failed') return
    const timer = setTimeout(() => { setCopyFeedback({ status: 'idle' }) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copyFeedback])

  async function saveKey(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    void api.analytics?.('api_key_save_click', {})
    const value = draft.trim()
    if (invalidKeyDraft(value)) {
      setError(value === '' ? m.welcomeKeyBlank : m.welcomeKeyInvalid)
      input.current?.focus()
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api.saveApiKey(value)
      if (!mounted.current) return
      if (result.ok) setDraft('')
      else setError(m.welcomeKeyFailed)
    } catch {
      if (mounted.current) setError(m.welcomeKeyFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function skip() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    const fromLocal = pageRef.current === 'local'
    try {
      await api.skip()
      if (mounted.current) { setDraft(''); setLocalKey('') }
    } catch {
      if (mounted.current) {
        if (fromLocal) setLocalError({ field: 'form', message: m.welcomeContinueFailed })
        else setError(m.welcomeContinueFailed)
      }
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function failLocal(field: LocalField, message: string) {
    setLocalStatus('')
    setLocalError({ field, message })
    if (field === 'url') urlInput.current?.focus()
    else if (field === 'model') modelInput.current?.focus()
    else if (field === 'key') localKeyInput.current?.focus()
  }
  /** Validate the endpoint fields shared by listing and saving. @returns the request facts, or undefined after reporting the failure. */
  function localServer(): { baseURL: string; apiKey?: string } | undefined {
    const baseURL = localUrl.trim()
    if (!isWelcomeServerUrl(baseURL)) { failLocal('url', m.welcomeLocalUrlInvalid); return undefined }
    const apiKey = localKey.trim()
    if (apiKey !== '' && invalidKeyDraft(apiKey)) { failLocal('key', m.welcomeKeyInvalid); return undefined }
    return apiKey === '' ? { baseURL } : { baseURL, apiKey }
  }
  async function findLocalModels() {
    if (finding || busyRef.current) return
    const server = localServer()
    if (server === undefined) return
    const current = ++findRevision.current
    setFinding(true)
    setLocalError(null)
    setLocalStatus('')
    try {
      const result = await api.discoverLocalModels(server)
      if (!mounted.current || findRevision.current !== current) return
      if (!result.ok) { failLocal('url', m.welcomeLocalDiscoveryFailed); return }
      setLocalModels(result.models)
      const [first] = result.models
      if (first === undefined) { failLocal('model', m.welcomeLocalNoModels); return }
      setLocalStatus(formatDesktopMessage(m.welcomeLocalFound, { count: String(result.models.length) }))
      setLocalModel(value => value.trim() === '' ? first : value)
      modelInput.current?.focus()
    } catch {
      if (mounted.current && findRevision.current === current) failLocal('url', m.welcomeLocalDiscoveryFailed)
    } finally {
      if (mounted.current && findRevision.current === current) setFinding(false)
    }
  }
  async function saveLocal(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    const server = localServer()
    if (server === undefined) return
    const model = localModel.trim()
    if (!isWelcomeModelId(model)) { failLocal('model', m.welcomeLocalModelBlank); return }
    busyRef.current = true
    setBusy(true)
    setLocalError(null)
    try {
      const result = await api.saveLocalModel(server, model)
      if (!mounted.current) return
      if (result.ok) setLocalKey('')
      else failLocal('form', m.welcomeLocalFailed)
    } catch {
      if (mounted.current) failLocal('form', m.welcomeLocalFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  function resetLocal() {
    findRevision.current++
    setFinding(false)
    setLocalUrl(''); setLocalModel(''); setLocalKey(''); setLocalModels([])
    setLocalError(null); setLocalStatus('')
  }
  async function start() {
    navigate('account')
    setStarting(true)
    setAttempt(null)
    attemptRef.current = null
    const current = ++revision.current
    try {
      const state = await api.startSignIn()
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      if (mounted.current && revision.current === current) setStarting(false)
    }
  }
  async function cancel() {
    if (cancelling || attemptRef.current === null) return
    setCancelling(true)
    const current = ++revision.current
    try {
      const state = await api.cancelSignIn(attemptRef.current.id)
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      // The current attempt remains visible so cancellation can be retried.
    } finally {
      if (mounted.current) setCancelling(false)
    }
  }
  async function copyLink() {
    const current = attemptRef.current
    if (current?.phase !== 'waiting-browser' || (copyState === 'busy' || copyState === 'copied')) return
    setCopyFeedback({ status: 'busy' })
    try {
      await api.copySignInLink(current.id)
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'copied' })
    } catch {
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'failed' })
    }
  }

  const phase = starting ? 'initializing' : attempt?.phase ?? 'failed'
  const waiting = phase === 'waiting-browser'
  const failed = phase === 'expired' || phase === 'failed'
  const title = phase === 'initializing' ? m.welcomeAuthStarting
    : waiting ? m.welcomeAuthWaiting : phase === 'expired' ? m.welcomeAuthExpired
      : phase === 'failed' ? m.welcomeAuthFailed : m.welcomeAuthExchanging
  const heading = page === 'entry' ? 'welcome-heading' : page === 'key' ? 'key-title' : page === 'local' ? 'local-title' : 'auth-status'
  const localInvalid = (field: LocalField) => localError?.field === field

  return <>
    {expiryNotice && <Toast text={m.welcomeSessionExpired} onDone={() => { setExpiryNotice(false) }} />}
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome" aria-labelledby={heading}>
      <img className="brand" src="assets/welcome-brand.svg" alt={m.welcomeBrand} width="472" height="40" />
      <div id="tagline" className="tagline" hidden={page !== 'entry'}>
        <h1 id="welcome-heading"><span>{m.welcomeTaglineBefore}</span><em>{m.welcomeTaglineBrand}</em><span>{m.welcomeTaglineAfter}</span></h1>
        <p id="welcome-description">{m.welcomeDescription}</p>
      </div>
      <form id="key-form" className="key-form" hidden={page !== 'key'} noValidate onSubmit={(event) => { void saveKey(event) }} aria-busy={busy}>
        <header className="key-heading"><h1 id="key-title">{m.welcomeKeyTitle}</h1><p id="key-description">{m.welcomeKeyDescription}</p></header>
        <div className="key-field">
          <label className="visually-hidden" htmlFor="key-input">{m.welcomeKeyPlaceholder}</label>
          <input ref={input} id="key-input" type="password" autoComplete="new-password" autoCapitalize="off" spellCheck={false} required
            aria-describedby="key-description key-error" aria-invalid={error !== ''} placeholder={m.welcomeKeyPlaceholder}
            value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value); setError('') }} />
          <p id="key-error" className="key-error" role="alert" hidden={error === ''}>{error}</p>
        </div>
      </form>
      <form id="local-form" className="key-form local-form" hidden={page !== 'local'} noValidate onSubmit={(event) => { void saveLocal(event) }} aria-busy={busy}>
        <header className="key-heading"><h1 id="local-title">{m.welcomeLocalTitle}</h1><p id="local-description">{m.welcomeLocalDescription}</p></header>
        <div className="local-fields">
          <div className="key-field">
            <label className="visually-hidden" htmlFor="local-url">{m.welcomeLocalUrlPlaceholder}</label>
            <input ref={urlInput} id="local-url" type="url" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false} required
              aria-describedby="local-description local-error" aria-invalid={localInvalid('url')} placeholder={m.welcomeLocalUrlPlaceholder}
              value={localUrl} disabled={busy} onChange={(event) => {
                setLocalUrl(event.target.value); setLocalModels([]); setLocalError(null); setLocalStatus('')
              }} />
          </div>
          <div className="key-field local-model">
            <label className="visually-hidden" htmlFor="local-model">{m.welcomeLocalModelPlaceholder}</label>
            <input ref={modelInput} id="local-model" type="text" list="local-model-options" autoComplete="off" autoCapitalize="off" spellCheck={false} required
              aria-describedby="local-error local-status" aria-invalid={localInvalid('model')} placeholder={m.welcomeLocalModelPlaceholder}
              value={localModel} disabled={busy} onChange={(event) => { setLocalModel(event.target.value); setLocalError(null) }} />
            <datalist id="local-model-options">{localModels.map(id => <option key={id} value={id} />)}</datalist>
            <button id="local-find" className="local-find" type="button" disabled={busy || finding || localUrl.trim() === ''}
              onClick={() => { void findLocalModels() }}>{finding ? m.welcomeLocalFinding : m.welcomeLocalFindModels}</button>
          </div>
          <div className="key-field">
            <label className="visually-hidden" htmlFor="local-key">{m.welcomeLocalKeyPlaceholder}</label>
            <input ref={localKeyInput} id="local-key" type="password" autoComplete="new-password" autoCapitalize="off" spellCheck={false}
              aria-describedby="local-error" aria-invalid={localInvalid('key')} placeholder={m.welcomeLocalKeyPlaceholder}
              value={localKey} disabled={busy} onChange={(event) => { setLocalKey(event.target.value); setLocalError(null) }} />
          </div>
          <p id="local-error" className="key-error" role="alert" hidden={localError === null}>{localError?.message}</p>
          <p id="local-status" className="key-error local-status" role="status" hidden={localError !== null || localStatus === ''}>{localStatus}</p>
        </div>
      </form>
      <section id="auth-page" className={`key-heading ${waiting ? 'auth-waiting' : phase === 'expired' ? 'auth-expired' : ''}`}
        hidden={page !== 'account'} aria-live="polite">
        <h1 id="auth-status">{title}</h1>
        <p id="auth-description" hidden={!waiting && phase !== 'expired'}>{waiting ? m.welcomeAuthWaitingDescription : m.welcomeAuthExpiredDescription}</p>
        <button id="auth-copy" className="copy-link" type="button" hidden={!waiting} disabled={!waiting || (copyState === 'busy' || copyState === 'copied')} onClick={() => { void copyLink() }}>
          {copyState === 'copied' ? m.welcomeAuthCopied : copyState === 'failed' ? m.welcomeAuthCopyFailed : m.welcomeAuthCopyLink}
        </button>
      </section>
      <div id="auth-actions" className="actions" hidden={page !== 'account'}>
        <button id="auth-loading" className="primary" type="button" hidden={failed} disabled aria-label={m.welcomeAuthExchanging}>
          <StateDot state="ongoing" size={16} className="welcome-loading" />
        </button>
        <button id="auth-retry" className="primary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start() }}>{m.welcomeAuthRetry}</button>
        <button id="auth-api-key" className="secondary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
        <button id="auth-cancel" className="secondary" type="button" hidden={failed}
          disabled={cancelling || phase === 'committing' || phase === 'succeeded' || (phase === 'initializing' && !attempt?.id)}
          onClick={() => { void cancel() }}>{m.welcomeAuthCancel}</button>
      </div>
      <div id="entry-actions" className="actions" hidden={page !== 'entry'}>
        <button id="sign-in" className="primary" type="button" onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); void start() }}>{m.welcomeSignIn}</button>
        <button ref={keyButton} id="api-key" className="secondary" type="button" onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
        <button ref={localButton} id="use-local-model" className="back" type="button" onClick={() => { navigate('local') }}>{m.welcomeLocalModel}</button>
      </div>
      <div id="key-actions" className="actions" hidden={page !== 'key'}>
        <button id="save-key" className="primary" type="submit" form="key-form" disabled={busy || draft.trim() === ''}>{m.welcomeKeySave}</button>
        <button id="skip-key" className="secondary" type="button" disabled={busy} onClick={() => { void skip() }}>{m.welcomeKeyLater}</button>
        <button id="back-to-login" className="back" type="button" disabled={busy} onClick={() => {
          if (busyRef.current) return
          setDraft(''); setError(''); entryFocus.current = keyButton.current; navigate('entry')
        }}>{m.welcomeKeyBack}</button>
      </div>
      <div id="local-actions" className="actions" hidden={page !== 'local'}>
        <button id="save-local" className="primary" type="submit" form="local-form"
          disabled={busy || localUrl.trim() === '' || localModel.trim() === ''}>{m.welcomeKeySave}</button>
        <button id="skip-local" className="secondary" type="button" disabled={busy} onClick={() => { void skip() }}>{m.welcomeKeyLater}</button>
        <button id="local-back" className="back" type="button" disabled={busy} onClick={() => {
          if (busyRef.current) return
          resetLocal(); entryFocus.current = localButton.current; navigate('entry')
        }}>{m.welcomeKeyBack}</button>
      </div>
    </main>
  </>
}
