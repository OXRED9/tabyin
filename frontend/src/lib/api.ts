/**
 * The only module that talks to the network. Every URL is a relative `/api/...` path: the backend
 * serves the built app, and the dev server proxies `/api` to it. Nothing else is ever requested.
 */
import { readSseStream } from './sse'
import type {
  ApiError,
  Card,
  Meta,
  OcrResult,
  Report,
  StreamEvent,
  Summary,
  UiLang,
  VerifyInput,
} from './types'

/** Mock mode replays a fixture stream so every state can be shown without the backend. */
export const MOCK_MODE: boolean =
  import.meta.env.VITE_MOCK === '1' ||
  (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('mock'))

/** Resolves once a frame has been painted (or shortly after, in a tab that is not painting). */
const afterFirstPaint = () =>
  new Promise<void>((resolve) => {
    const timer = window.setTimeout(resolve, 200)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        window.clearTimeout(timer)
        resolve()
      }),
    )
  })

/**
 * Mock mode's code and fixtures. They are fetched once the first frame is on screen, the way a
 * real report's data arrives after the page is up, and never unless mock mode is on.
 */
export const loadMock = () => afterFirstPaint().then(() => import('@/mocks/mock-stream'))

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
    const { mockMeta } = await loadMock()
    return mockMeta()
  }
  const response = await fetch('/api/meta', { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new ApiFailure(await errorFromResponse(response))
  return (await response.json()) as Meta
}

/**
 * F1: read the text of a picture. Nothing is verified here: the text comes back for the user to
 * check and edit, and is then sent to `/api/verify` as an ordinary text.
 */
export async function requestOcr(file: File, signal?: AbortSignal): Promise<OcrResult> {
  if (MOCK_MODE) {
    const { mockOcr } = await loadMock()
    return mockOcr(signal)
  }
  let response: Response
  try {
    const form = new FormData()
    form.append('file', file)
    response = await fetch('/api/ocr', { method: 'POST', body: form, signal, headers: { Accept: 'application/json' } })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiFailure(clientError('network'))
  }
  if (!response.ok) throw new ApiFailure(await errorFromResponse(response))
  return (await response.json()) as OcrResult
}

/** The picture behind the image example chip, as a file to run through the same flow. */
export async function fetchExampleImage(url: string, signal?: AbortSignal): Promise<File> {
  if (MOCK_MODE) {
    const { mockExampleImage } = await loadMock()
    return mockExampleImage()
  }
  let response: Response
  try {
    response = await fetch(url, { signal })
  } catch (cause) {
    if (signal?.aborted) throw cause
    throw new ApiFailure(clientError('network'))
  }
  if (!response.ok) throw new ApiFailure(await errorFromResponse(response))
  const blob = await response.blob()
  return new File([blob], url.split('/').pop() || 'example.png', { type: blob.type || 'image/png' })
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
    const { mockVerify } = await loadMock()
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

/** The body of `POST /api/share-card`, as docs/API.md defines it. */
export type ShareCardRequest = {
  size: 'portrait' | 'square'
  theme: 'light' | 'dark'
  lang: UiLang
} & (
  | { kind: 'claim'; card: Card }
  // The summary card lists the citations: the cards go with it (at most 60), and what was checked.
  | { kind: 'summary'; summary: Summary; cards: Card[]; title: string | null }
)

/** F3 fallback: let the backend draw the verdict card when client-side rendering fails. */
export async function requestShareCard(payload: ShareCardRequest, signal?: AbortSignal): Promise<Blob> {
  if (MOCK_MODE) throw new ApiFailure(clientError('network'))
  let response: Response
  try {
    response = await fetch('/api/share-card', {
      method: 'POST',
      body: JSON.stringify(payload),
      signal,
      headers: { 'Content-Type': 'application/json', Accept: 'image/png' },
    })
  } catch {
    throw new ApiFailure(clientError('network'))
  }
  if (!response.ok) throw new ApiFailure(await errorFromResponse(response))
  const blob = await response.blob()
  if (!blob.type.startsWith('image/')) throw new ApiFailure(clientError('internal', response.status))
  return blob
}
