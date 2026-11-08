/** Native onboarding reuses authenticated Web RPC and never reads credential values. */
import { describe, expect, it, vi } from 'vitest'
import { connectDesktopWelcome } from '../src/welcome-backend.ts'

function transport(preference?: string) {
  const keys = new Map<string, string>()
  const mutations: { ns: string; ops: unknown[] }[] = []
  const discoveries: unknown[] = []
  const listed: unknown[] = [{ id: 'llama3.2' }, { id: 'qwen2.5:7b', name: 'Qwen' }, { id: 'llama3.2' }, { id: 'two words' }, { name: 'no id' }]
  const namespaces = [
    { ns: 'llm-deepseek', value: { apiKeyEnv: 'CUSTOM_DEEPSEEK_KEY' } },
    { ns: 'llm-pi-ai', value: { profiles: { example: { apiKeyEnv: 'EXAMPLE_API_KEY' } } } },
    { ns: 'locale', value: preference === undefined ? {} : { preference } },
  ]
  const send = vi.fn<NonNullable<Parameters<typeof connectDesktopWelcome>[2]>>(async (_input, init) => {
    const { rpcId, method, payload } = JSON.parse(init!.body as string) as {
      rpcId: string
      method: string
      payload: { args: { ref: string; value: string; refs: string[]; ns: string; ops: unknown[]; settingsNs: string; request: unknown } }
    }
    let value: unknown
    if (method === 'settings/mutate') mutations.push({ ns: payload.args.ns, ops: payload.args.ops })
    else if (method === 'llm/discoverModels') {
      discoveries.push({ settingsNs: payload.args.settingsNs, request: payload.args.request })
      value = listed
    } else if (method === 'account/getState') value = { links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null }
    else if (method === 'settings/describe') value = { namespaces }
    else if (method === 'llm/listConfigurableProviders') value = [{ settingsNs: 'llm-pi-ai', settingsPath: ['profiles', 'example'] }]
    else if (method === 'productAnalytics/enabled') value = true
    else if (method === 'productAnalytics/report') value = undefined
    else if (method === 'credentials/set') keys.set(payload.args.ref, payload.args.value)
    else value = Object.fromEntries(payload.args.refs.map(ref => [ref, { configured: keys.has(ref), writable: true }]))
    return Response.json({ type: 'server-response', rpcId, result: { ok: true, value } })
  })
  return { send, keys, namespaces, mutations, discoveries, listed }
}

const url = 'http://127.0.0.1:19387/'
const cookie = 'dsh-auth-fixture=signed'

describe('desktop welcome Web operations', () => {
  it('authenticates with the explicit Host cookie and stores only through the configured credential reference', async () => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    expect(await backend.analyticsEnabled()).toBe(true)
    expect(await backend.save('sk-example')).toEqual({ ok: true })
    expect(host.keys.get('CUSTOM_DEEPSEEK_KEY')).toBe('sk-example')
    expect(await backend.read()).toEqual({ loggedIn: false, hasApiKey: true, writable: true, localePreference: null })
    for (const [input, init] of host.send.mock.calls) {
      expect(input).toMatch(/^http:\/\/127\.0\.0\.1:19387\/api\//u)
      expect(init).toMatchObject({ redirect: 'error', headers: { cookie } })
      expect(init).not.toHaveProperty('credentials')
    }
  })

  it('reads the explicit language preference and recognizes another provider key', async () => {
    const host = transport('zh')
    host.keys.set('EXAMPLE_API_KEY', 'sk-other')
    const backend = connectDesktopWelcome(url, cookie, host.send)
    expect(await backend.read()).toMatchObject({ localePreference: 'zh', hasApiKey: true })
    host.keys.clear()
    expect(await backend.read()).toMatchObject({ hasApiKey: false })
    expect(host.send.mock.calls.every(([, init]) => !(init?.body as string | undefined)?.includes('credentials/set'))).toBe(true)
  })

  it('reads language without querying account or model providers', async () => {
    const host = transport('zh')
    const backend = connectDesktopWelcome(url, cookie, host.send)
    host.send.mockClear()
    expect(await backend.readLocalePreference()).toBe('zh')
    expect(host.send).toHaveBeenCalledOnce()
    expect(host.send.mock.calls[0]![0]).toContain('/api/settings/describe')
  })

  it('allows profiles without the official provider and retains custom key detection', async () => {
    const host = transport()
    host.namespaces.splice(0, 1)
    const backend = connectDesktopWelcome(url, cookie, host.send)
    expect(await backend.read()).toMatchObject({ hasApiKey: false, writable: false })
    host.keys.set('EXAMPLE_API_KEY', 'custom-key')
    expect(await backend.read()).toMatchObject({ hasApiKey: true, writable: false })
    expect(await backend.save('official-key')).toEqual({ ok: false })
    expect(host.keys.has('undefined')).toBe(false)
  })

  it.each(['', 'bad key', 'key\n'])('rejects malformed keys without contacting a provider: %s', async (value) => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    host.send.mockClear()
    expect(await backend.save(value)).toEqual({ ok: false })
    expect(host.send).not.toHaveBeenCalled()
  })

  it('keeps provider diagnostics out of failures and rejects unmatched RPC envelopes', async () => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    host.send.mockRejectedValueOnce(new Error('private credential sk-must-not-leak'))
    expect(await backend.save('sk-example')).toEqual({ ok: false })
    host.send.mockResolvedValueOnce(Response.json({ type: 'server-response', rpcId: 'other', result: { ok: true } }))
    await expect(backend.read()).rejects.toThrow('Web RPC failed')
  })

  it('declares a keyless local route with a placeholder credential and selects its model', async () => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    expect(await backend.saveLocal({ baseURL: 'http://127.0.0.1:11434/v1' }, 'llama3.2')).toEqual({ ok: true })
    expect(host.mutations).toEqual([
      { ns: 'llm-pi-ai', ops: [{ op: 'set', path: ['providers', 'local'], value: {
        apiKeyEnv: 'LOCAL_API_KEY', api: 'openai-completions', baseURL: 'http://127.0.0.1:11434/v1',
        compat: { supportsDeveloperRole: false, maxTokensField: 'max_tokens' }, models: [{ id: 'llama3.2' }],
      } }] },
      { ns: 'agent-default-model', ops: [
        { op: 'set', path: ['provider'], value: 'local' },
        { op: 'set', path: ['model'], value: 'llama3.2' },
        { op: 'unset', path: ['reasoningEffort'] },
      ] },
    ])
    expect(host.keys.get('LOCAL_API_KEY')).toBe('dsh-local-no-key')
    expect(await backend.saveLocal({ baseURL: 'https://gpu.internal/v1', apiKey: 'sk-local' }, 'qwen2.5:7b')).toEqual({ ok: true })
    expect(host.keys.get('LOCAL_API_KEY')).toBe('sk-local')
  })

  it('lists unique usable model ids and sends the typed key only to the listing', async () => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    expect(await backend.discoverLocal({ baseURL: 'http://127.0.0.1:11434/v1' })).toEqual(['llama3.2', 'qwen2.5:7b'])
    expect(await backend.discoverLocal({ baseURL: 'https://gpu.internal/v1', apiKey: 'sk-local' })).toEqual(['llama3.2', 'qwen2.5:7b'])
    expect(host.discoveries).toEqual([
      { settingsNs: 'llm-pi-ai', request: { baseURL: 'http://127.0.0.1:11434/v1', api: 'openai-completions' } },
      { settingsNs: 'llm-pi-ai', request: { baseURL: 'https://gpu.internal/v1', api: 'openai-completions', apiKey: 'sk-local' } },
    ])
    expect(host.keys.size).toBe(0)
    expect(host.mutations).toEqual([])
  })

  it('refuses malformed local requests without contacting the Host and hides Host diagnostics', async () => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    host.send.mockClear()
    expect(await backend.discoverLocal({ baseURL: 'ftp://127.0.0.1/v1' })).toBeUndefined()
    expect(await backend.saveLocal({ baseURL: 'http://127.0.0.1/v1', apiKey: 'bad key' }, 'llama3.2')).toEqual({ ok: false })
    expect(await backend.saveLocal({ baseURL: 'http://127.0.0.1/v1' }, '')).toEqual({ ok: false })
    expect(host.send).not.toHaveBeenCalled()
    host.send.mockRejectedValueOnce(new Error('upstream echoed sk-must-not-leak'))
    expect(await backend.discoverLocal({ baseURL: 'http://127.0.0.1/v1', apiKey: 'sk-must-not-leak' })).toBeUndefined()
    host.send.mockRejectedValueOnce(new Error('settings refused sk-must-not-leak'))
    expect(await backend.saveLocal({ baseURL: 'http://127.0.0.1/v1', apiKey: 'sk-must-not-leak' }, 'llama3.2')).toEqual({ ok: false })
    host.listed.splice(0, host.listed.length)
    expect(await backend.discoverLocal({ baseURL: 'http://127.0.0.1/v1' })).toEqual([])
  })

  it('submits native analytics through authenticated RPC with a bounded request', async () => {
    const host = transport()
    const backend = connectDesktopWelcome(url, cookie, host.send)
    const event = { eventName: 'desktop_app_launch' as const, timestamp: 100, attributes: {} }
    await backend.report(event)
    const [input, init] = host.send.mock.calls.at(-1)!
    expect(input).toBe('http://127.0.0.1:19387/api/productAnalytics/report')
    expect(init?.headers).toMatchObject({ cookie })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(init!.body as string)).toMatchObject({ payload: { args: { event } } })
  })
})
