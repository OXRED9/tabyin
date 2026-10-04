/**
 * Mock mode: replays a fixture stream with realistic delays so every state of the UI can be shown
 * and screenshotted without the backend. Enabled by `?mock=1` or `VITE_MOCK=1`.
 *
 * The scenario follows the input, so the demo behaves like the product:
 *   video link / uploaded file → the full report (all five states, levels C and D, two gradings,
 *                                a missing grading, timestamps)
 *   text                        → a short report; the "fabrication" example gives a request card
 *   article link                → the short report as an article
 *   a link containing "tiktok"  → a download error; one containing "fail" → a fetch error
 * `?scenario=video|text|fabrication|lexical|no_claims|error|tiktok` forces one, `?speed=4`
 * replays faster, and `?off=copy,explain,share_card` turns Phase 2 feature flags off (the cards
 * then come without that feature's data, as from the real API; `off=image` hides image input).
 *
 * Image input (F1) is on. `/api/ocr` is simulated: after a short delay it returns the text of the
 * text example with one word replaced by `[?]` and a short list of removed noise. The image
 * example's picture is drawn here on a canvas. Nothing is requested from the network.
 *
 * `?mock=1&share=1` stands for a link shared to the installed app (the page routes it and starts
 * by itself); `&install=1` (or `=ios`) forces the install line in a finished report's footer.
 *
 * `?mock=1&scenario=<name>&autorun=1` submits that scenario's input on load, with no click, so
 * the page reaches its report by itself (for audits of the report page; `&speed=` still applies).
 * It works in the production build too, and does nothing without `mock`.
 *
 * The religious texts come from `fixtures.json`, generated from the repository's source data by
 * `scripts/build-fixtures.mjs`. None is written here.
 */
import type {
  ApiError,
  Card,
  ClaimStub,
  EvidenceState,
  Meta,
  OcrResult,
  Segment,
  SourceInfo,
  StageEvent,
  StageId,
  StreamEvent,
  Summary,
  UiLang,
  VerifyInput,
} from '@/lib/types'

import fixtures from './fixtures.json'

interface Scenario {
  source: SourceInfo
  segments: Segment[]
  cards: Record<UiLang, Card[]>
}

const scenarios = fixtures.scenarios as unknown as Record<'video' | 'text' | 'fabrication' | 'question', Scenario>

const params = () => new URLSearchParams(window.location.search)

const STAGE_NAMES: Record<StageId, [string, string]> = {
  ingest: ['الحصول على النص', 'Getting the text'],
  extract: ['استخراج الادّعاءات', 'Extracting claims'],
  match: ['المطابقة مع المصادر', 'Matching against sources'],
  rules: ['تحديد حالة الدليل', 'Determining the evidence state'],
  report: ['تقرير التحقق', 'Verification report'],
}
const STAGE_INDEX: Record<StageId, number> = { ingest: 1, extract: 2, match: 3, rules: 4, report: 5 }

const ERRORS: Record<string, ApiError> = {
  tiktok: {
    code: 'video_download_failed',
    stage: 'ingest',
    fatal: true,
    message_ar: 'تعذر تحميل هذا المقطع من تيك توك',
    message_en: 'This TikTok clip could not be downloaded',
    hint_ar: 'ارفع الملف أو الصق التفريغ.',
    hint_en: 'Upload the file or paste the transcript.',
  },
  article: {
    code: 'article_fetch_failed',
    stage: 'ingest',
    fatal: true,
    message_ar: 'تعذّر فتح هذا المقال',
    message_en: 'This article could not be opened',
    hint_ar: 'قد يمنع الموقع القراءة الآلية. انسخ نص المقال والصقه في الحقل.',
    hint_en: 'The site may block automated reading. Copy the article text and paste it in the field.',
  },
  llm: {
    code: 'llm_unavailable',
    stage: 'extract',
    fatal: false,
    message_ar: 'نموذج اللغة غير متاح الآن؛ نعمل بالوضع اللفظي بتغطية أقل.',
    message_en: 'The language model is unavailable; running in lexical mode with reduced coverage.',
    hint_ar: 'تُفحص الآيات والأحاديث المنقولة بلفظها، وقد لا تُلتقط الأحكام والروايات بالمعنى.',
    hint_en: 'Verbatim verses and hadith are still checked; rulings and paraphrased narrations may be missed.',
  },
  noClaims: {
    code: 'no_claims',
    stage: 'extract',
    fatal: false,
    message_ar: 'لم نجد في هذا المحتوى استشهاداً شرعياً يمكن التحقق منه.',
    message_en: 'No religious citation to verify was found in this content.',
    hint_ar: 'جرّب نصاً فيه آية أو حديث أو قول منسوب.',
    hint_en: 'Try a text that contains a verse, a hadith or an attributed saying.',
  },
}

type ScenarioName = 'video' | 'text' | 'fabrication' | 'question' | 'lexical' | 'no_claims' | 'error' | 'tiktok'

function chooseScenario(input: VerifyInput): ScenarioName {
  const forced = params().get('scenario') as ScenarioName | null
  if (forced) return forced
  if (input.input_type === 'video_url') return /tiktok/i.test(input.url) ? 'tiktok' : 'video'
  if (input.input_type === 'file') return 'video'
  if (input.input_type === 'article_url') return /fail|error/i.test(input.url) ? 'error' : 'text'
  const fabrication = scenarios.fabrication.segments[0]?.text ?? ''
  if (fabrication && input.text.trim().startsWith(fabrication.slice(0, 20))) return 'fabrication'
  // A question put to the tool, typed or pasted: it is referred, never answered.
  if (input.text.trim() === (scenarios.question.segments[0]?.text ?? '').trim()) return 'question'
  return 'text'
}

function summarise(cards: Card[], mode: Summary['mode'], elapsed: number, warnings: string[]): Summary {
  const by_state: Record<EvidenceState, number> = {
    supported: 0,
    supported_with_note: 0,
    needs_review: 0,
    not_found: 0,
    contradicted: 0,
  }
  for (const card of cards) by_state[card.state] += 1
  return { total: cards.length, by_state, mode, llm_provider: mode === 'full' ? 'mock' : null, warnings, elapsed_seconds: elapsed }
}

const stub = (card: Card): ClaimStub => ({
  id: card.id,
  index: card.index,
  claim_type: card.claim_type,
  text_as_quoted: card.text_as_quoted,
  span: card.span,
  timestamp: card.timestamp,
  position: card.position,
})

const flagsOff = () => new Set((params().get('off') ?? '').split(',').filter(Boolean))

export async function mockMeta(): Promise<Meta> {
  await new Promise((resolve) => setTimeout(resolve, 120))
  const off = flagsOff()
  const meta = fixtures.meta as Meta
  const image = !off.has('image')
  return {
    ...meta,
    limits: { ...meta.limits, max_image_mb: 10 },
    examples: image ? [...meta.examples, IMAGE_EXAMPLE] : meta.examples,
    features: {
      share_card: !off.has('share_card'),
      copy: !off.has('copy'),
      explain: !off.has('explain'),
      image,
      alternatives: !off.has('alternatives'),
    },
    // Where "report an error" is addressed. None by default, as on a server that has not set one;
    // `?feedback=1` gives placeholder addresses so both buttons can be seen.
    // What does the work, as the real server reports it (`meta.engines`). The `lexical` scenario
    // stands for a server with no model key: its model ids are null, as that server's are.
    engines: {
      quran_verses: 6236,
      graded_narrations: 3574,
      book_narrations: 58802,
      models:
        params().get('scenario') === 'lexical'
          ? { extract: null, vision: null, audio: null }
          : MODELS,
      live_gradings: true,
    },
    feedback: params().has('feedback')
      ? { email: 'feedback@tabayyun.example', whatsapp: '+966 50 000 0000' }
      : { email: null, whatsapp: null },
  }
}

const MODELS = { extract: 'qwen/qwen3.8-flash', vision: 'qwen/qwen3.7-flash', audio: 'google/gemini-3.5-flash-lite' }

// The real API serves a generated PNG at this address; mock mode never requests it.
const IMAGE_EXAMPLE: Meta['examples'][number] = {
  id: 'image',
  input_type: 'image',
  label_ar: 'صورة رسالة محوَّلة',
  label_en: 'A forwarded-message screenshot',
  text: null,
  url: '/api/examples/screenshot.png',
}

/** The text example from the fixtures: what the simulated picture "contains". */
const exampleText = () => (fixtures.meta as Meta).examples.find((example) => example.id === 'text')?.text ?? ''

/**
 * A simulated `POST /api/ocr`. The text is the fixtures' text example, untouched except that its
 * second word (part of the framing sentence, not of a verse or a narration) is replaced by the
 * unreadable-word marker; the removed items are the kind of noise a forwarded message carries.
 */
export async function mockOcr(signal?: AbortSignal): Promise<OcrResult> {
  const speed = Math.max(0.1, Number(params().get('speed')) || 1)
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, 1200 / speed)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    })
  })
  const words = exampleText().split(' ')
  if (words.length > 1) words[1] = '[?]'
  return {
    text: words.join(' '),
    confidence: 0.9,
    low_confidence: true,
    unreadable: 1,
    notes: null,
    removed: ['🌹', 'انشرها تؤجر'],
  }
}

/** The image example's picture: the text example drawn as a message bubble, entirely in the browser. */
export async function mockExampleImage(): Promise<File> {
  const canvas = document.createElement('canvas')
  canvas.width = 540
  canvas.height = 360
  const context = canvas.getContext('2d')
  if (context) {
    context.fillStyle = '#e4f0ec'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.fillStyle = '#ffffff'
    context.fillRect(24, 24, canvas.width - 48, canvas.height - 48)
    context.fillStyle = '#11221e'
    context.font = '22px Amiri, serif'
    context.direction = 'rtl'
    context.textAlign = 'right'
    let y = 70
    for (const paragraph of exampleText().split('\n')) {
      let line = ''
      for (const word of paragraph.split(' ')) {
        const next = line ? `${line} ${word}` : word
        if (context.measureText(next).width > canvas.width - 96 && line) {
          context.fillText(line, canvas.width - 48, y)
          y += 40
          line = word
        } else line = next
      }
      if (line) {
        context.fillText(line, canvas.width - 48, y)
        y += 40
      }
    }
  }
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  return new File([blob ?? new Blob()], 'screenshot.png', { type: 'image/png' })
}

/**
 * `?mock=1&share=1`: what another app "shared". There is no service worker in mock mode, so the
 * payload is made here: the clip example's link, in `text`, the way Android apps often send it.
 */
export function mockSharePayload(): { title: string; text: string; url: string; files: File[] } {
  return { title: '', text: scenarios.video.source.url ?? '', url: '', files: [] }
}

/** A greeting with no citation in it: what the `no_claims` scenario is run on. */
const NO_CLAIMS_TEXT = 'مرحباً، كيف حالك اليوم؟'

/**
 * `?mock=1&scenario=<name>&autorun=1`: the input that scenario stands for. The shell submits it
 * on load. Null without `autorun=1`.
 */
export function mockAutorunInput(): VerifyInput | null {
  const query = params()
  if (query.get('autorun') !== '1') return null
  const name = (query.get('scenario') ?? 'video') as ScenarioName
  const textOf = (scenario: Scenario) => scenario.segments.map((segment) => segment.text).join('\n')
  switch (name) {
    case 'video':
      return { input_type: 'video_url', url: scenarios.video.source.url ?? '' }
    case 'tiktok':
      return { input_type: 'video_url', url: 'https://www.tiktok.com/@tabayyun/video/1' }
    case 'error':
      return { input_type: 'article_url', url: 'https://example.com/fail' }
    case 'fabrication':
      return { input_type: 'text', text: textOf(scenarios.fabrication) }
    case 'question':
      return { input_type: 'text', text: textOf(scenarios.question) }
    case 'no_claims':
      return { input_type: 'text', text: NO_CLAIMS_TEXT }
    default:
      return { input_type: 'text', text: textOf(scenarios.text) }
  }
}

export async function mockVerify(
  input: VerifyInput,
  uiLang: UiLang,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const speed = Math.max(0.1, Number(params().get('speed')) || 1)
  const started = performance.now()

  const wait = (ms: number) =>
    new Promise<void>((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'))
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms / speed)
      const onAbort = () => {
        clearTimeout(timer)
        reject(new DOMException('Aborted', 'AbortError'))
      }
      signal.addEventListener('abort', onAbort, { once: true })
    })

  const stage = (id: StageId, status: StageEvent['status'], extra: Partial<StageEvent> = {}) =>
    onEvent({
      event: 'stage',
      data: {
        stage: id,
        index: STAGE_INDEX[id],
        status,
        detail_ar: STAGE_NAMES[id][0],
        detail_en: STAGE_NAMES[id][1],
        ...extra,
      },
    })

  const name = chooseScenario(input)
  const isMedia = input.input_type === 'video_url' || input.input_type === 'file'

  await wait(250)
  stage('ingest', 'start', { eta_seconds: isMedia ? 14 : 6 })

  if (name === 'tiktok' || name === 'error') {
    await wait(1400)
    onEvent({ event: 'error', data: name === 'tiktok' ? ERRORS.tiktok : ERRORS.article })
    onEvent({ event: 'done', data: {} })
    return
  }

  const base =
    name === 'video'
      ? scenarios.video
      : name === 'fabrication'
        ? scenarios.fabrication
        : name === 'question'
          ? scenarios.question
          : scenarios.text
  const lexical = name === 'lexical'
  const empty = name === 'no_claims'
  // In lexical-only mode only verbatim verses and hadith are caught.
  const off = flagsOff()
  const cards = empty
    ? []
    : base.cards[uiLang]
        .filter((c) => !lexical || c.claim_type === 'ayah' || c.claim_type === 'hadith')
        .map((c) => ({
          ...c,
          copy_text: off.has('copy') ? null : c.copy_text,
          explain: off.has('explain') ? null : c.explain,
        }))

  const source: SourceInfo = { ...base.source, input_type: input.input_type }
  if (input.input_type === 'video_url' || input.input_type === 'article_url') {
    source.url = input.url
    if (input.input_type === 'article_url') source.title = 'مقال تجريبي'
  } else if (input.input_type === 'file') {
    source.url = null
    source.title = input.file.name
    source.transcript_origin = 'local-stt'
  }
  const segments: Segment[] = empty
    ? [{ id: 0, text: input.input_type === 'text' ? input.text : '', start: null, end: null }]
    : base.segments

  await wait(isMedia ? 1500 : 500)
  onEvent({ event: 'source', data: source })
  onEvent({ event: 'segments', data: { segments } })
  stage('ingest', 'done')
  // `trace` events, in the order and shape the real server sends them. The counts are those of
  // this scenario's own data; the timings are the ones a real run of each kind reported.
  onEvent({
    event: 'trace',
    data: {
      step: 'ingest',
      input_type: input.input_type,
      characters: segments.reduce((sum, segment) => sum + Array.from(segment.text).length, 0),
      segments: segments.length,
      transcript_origin: source.transcript_origin ?? null,
      ms: isMedia ? 12117 : input.input_type === 'article_url' ? 840 : 0,
    },
  })
  const ingestDone = performance.now()
  let matching = 0
  stage('extract', 'start', { eta_seconds: isMedia ? 11 : 5 })
  await wait(120)
  const hadithCards = cards.filter((c) => c.claim_type === 'hadith' || c.source?.kind === 'hadith')
  onEvent({
    event: 'trace',
    data: {
      step: 'scan',
      quran_verses: 6236,
      quran_hits: cards.filter((c) => c.claim_type === 'ayah' && c.match_kind === 'exact').length,
      narrations: 62376,
      narration_hits: hadithCards.filter((c) => c.source).length,
      markers: cards.filter((c) => c.explicit_attribution).length,
      ms: 1,
    },
  })

  // Verbatim Quran verses are announced, and may be matched, before extraction finishes.
  const early = cards.filter((c) => c.claim_type === 'ayah' && c.match_kind === 'exact')
  const late = cards.filter((c) => !early.includes(c))
  let done = 0

  if (early.length > 0) {
    await wait(500)
    stage('match', 'start', { done: 0, total: early.length })
    onEvent({ event: 'claims', data: { claims: early.map(stub) } })
    for (const card of early) {
      const before = performance.now()
      await wait(600)
      matching += performance.now() - before
      onEvent({ event: 'card', data: card })
      done += 1
      stage('match', 'progress', { done, total: early.length })
    }
  }

  await wait(900)
  if (lexical) onEvent({ event: 'error', data: ERRORS.llm })
  if (empty) onEvent({ event: 'error', data: ERRORS.noClaims })
  // No model in lexical-only mode: no `model` trace, and the interface must show it as not used.
  if (!lexical) {
    onEvent({
      event: 'trace',
      data: { step: 'model', model: MODELS.extract, proposed: late.length, ms: isMedia ? 14187 : 2140 },
    })
  }
  stage('extract', 'done')
  const extractDone = performance.now()

  if (late.length > 0) {
    onEvent({ event: 'claims', data: { claims: late.map(stub) } })
    stage('match', early.length > 0 ? 'progress' : 'start', {
      done,
      total: cards.length,
      eta_seconds: Math.ceil(late.length * 0.9) + 1,
    })
    for (const card of late) {
      const before = performance.now()
      await wait(700 + Math.min(600, card.text_as_quoted.length * 6))
      matching += performance.now() - before
      onEvent({ event: 'card', data: card })
      done += 1
      stage('match', 'progress', {
        done,
        total: cards.length,
        eta_seconds: Math.max(1, Math.ceil((cards.length - done) * 0.9)),
      })
    }
  }
  onEvent({
    event: 'trace',
    data: {
      step: 'verify',
      notes: cards.length,
      pointer_calls: lexical ? 0 : cards.filter((c) => c.match_kind === 'referenced' || c.match_kind === 'topic').length,
      selection_calls: lexical ? 0 : cards.filter((c) => (c.alternatives?.length ?? 0) > 0).length,
      gradings: cards.reduce((sum, c) => sum + c.grades.length, 0),
      dorar: params().has('dorar') ? 'unreachable' : hadithCards.length > 0 ? 'ok' : 'unknown',
      ms: lexical ? 69 : isMedia ? 4210 : 1830,
    },
  })
  if (cards.length > 0) stage('match', 'done', { done: cards.length, total: cards.length })

  await wait(250)
  stage('rules', 'done')
  const warnings = params().has('dorar') ? ['dorar_unreachable'] : []
  const seconds = (ms: number) => Number((ms / 1000).toFixed(2))
  const elapsed = Number(((performance.now() - started) / 1000).toFixed(1))
  onEvent({
    event: 'summary',
    data: {
      ...summarise(cards, lexical ? 'lexical_only' : 'full', elapsed, warnings),
      stage_seconds: {
        ingest: seconds(ingestDone - started),
        extract: seconds(extractDone - ingestDone),
        match: seconds(matching),
        total: seconds(performance.now() - started),
      },
    },
  })
  await wait(150)
  stage('report', 'done')
  onEvent({ event: 'done', data: {} })
}
