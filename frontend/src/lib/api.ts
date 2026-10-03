/**
 * The only module that talks to the network. Every URL is a relative `/api/...` path: the backend
 * serves the built app, and the dev server proxies `/api` to it. Nothing else is ever requested.
 */
import { readSseStream } from './sse'
import type { ApiError, Meta, Report, StreamEvent, UiLang, VerifyInput } from './types'

/** Mock mode replays a fixture stream so every state can be shown without the backend. */
export const MOCK_MODE: boolean =
  import.meta.env.VITE_MOCK === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mock'))

/** A failure that already carries a human message for the user. */
export class ApiFailure extends Error {
  readonly error: ApiError
  constructor(error: ApiError) {
    super(error.message_en || error.code)
    this.name = 'ApiFailure'
    this.error = error
  }
}

const clientError = (code: ApiError['code'], status?: number): ApiError => ({
  code,
  stage: null,
  fatal: true,
  // Left empty on purpose: the UI fills in its own localised copy for client-side codes.
  message_ar: '',
  message_en: status ? `HTTP ${status}` : '',
  hint_ar: null,
  hint_en: null,
})

function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ApiError).code === 'string' &&
    typeof (value as ApiError).message_ar === 'string'
  )
}

/** Turn a non-stream HTTP response into the most specific error we can. */
async function errorFromResponse(response: Response): Promise<ApiError> {
  try {
    const body: unknown = await response.clone().json()
    if (isApiError(body)) return { ...body, fatal: true }
    const detail = (body as { detail?: unknown } | null)?.detail
    if (isApiError(detail)) return { ...detail, fatal: true }
  } catch {
    /* not JSON: fall through to the status code */
  }
  if (response.status === 413) return clientError('file_too_large', 413)
  if (response.status === 415) return clientError('unsupported_file', 415)
  return clientError('internal', response.status)
}

export async function fetchMeta(signal?: AbortSignal): Promise<Meta> {
  if (MOCK_MODE) {
    const { mockMeta } = await import('@/mocks/mock-stream')
    return mockMeta()
  }
  const response = await fetch('/api/meta', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiFailure(await errorFromResponse(response))
  return (await response.json()) as Meta
}

const KNOWN_EVENTS = new Set(['stage', 'source', 'segments', 'claims', 'card', 'summary', 'error', 'done'])

/**
 * POST the input and feed each SSE event to `onEvent` as it arrives. Resolves when the stream
 * closes. Rejects with `ApiFailure` when the request could not be made at all, and with the
 * browser's `AbortError` when the caller cancels.
 */
export async function verifyStream(
  input: VerifyInput,
  uiLang: UiLang,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (MOCK_MODE) {
    const { mockVerify } = await import('@/mocks/mock-stream')
    return mockVerify(input, uiLang, onEvent, signal)
  }

  let response: Response
  try {
    if (input.input_type === 'file') {
      const form = new FormData()
      form.append('file', input.file)
      form.append('ui_lang', uiLang)
      response = await fetch('/api/verify/file', {
        method: 'POST',
        body: form,
        signal,
        headers: { Accept: 'text/event-stream' },
      })
    } else {
      const body =
        input.input_type === 'text'
          ? { input_type: input.input_type, text: input.text, ui_lang: uiLang }
          : { input_type: input.input_type, url: input.url, ui_lang: uiLang }
      response = await fetch('/api/verify', {
        method: 'POST',
        body: JSON.stringify(body),
        signal,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      })
    }
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiFailure(clientError('network'))
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (!response.ok || !contentType.includes('text/event-stream') || !response.body) {
    throw new ApiFailure(await errorFromResponse(response))
  }

  try {
    await readSseStream(response.body, (frame) => {
      if (!KNOWN_EVENTS.has(frame.event)) return
      let data: unknown
      try {
        data = JSON.parse(frame.data)
      } catch {
        return
      }
      onEvent({ event: frame.event, data } as StreamEvent)
    })
  } catch (cause) {
    if (signal.aborted) throw cause
    throw new ApiFailure(clientError('stream_interrupted'))
  }
}

/** Ask the backend for the standalone printable HTML. Nothing is stored server-side. */
export async function requestExportHtml(report: Report, signal?: AbortSignal): Promise<string> {
  if (MOCK_MODE) throw new ApiFailure(clientError('network'))
  let response: Response
  try {
    response = await fetch('/api/export/html', {
      method: 'POST',
      body: JSON.stringify(report),
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'text/html' },
    })
  } catch {
    throw new ApiFailure(clientError('network'))
  }
  if (!response.ok) throw new ApiFailure(await errorFromResponse(response))
  return response.text()
}
