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
 * then come without that feature's data, as from the real API). `?image=1` turns the image-input
 * flag on, as a backend that offers it would.
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

const scenarios = fixtures.scenarios as unknown as Record<'video' | 'text' | 'fabrication', Scenario>

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

type ScenarioName = 'video' | 'text' | 'fabrication' | 'lexical' | 'no_claims' | 'error' | 'tiktok'

function chooseScenario(input: VerifyInput): ScenarioName {
  const forced = params().get('scenario') as ScenarioName | null
  if (forced) return forced
  if (input.input_type === 'video_url') return /tiktok/i.test(input.url) ? 'tiktok' : 'video'
  if (input.input_type === 'file') return 'video'
  if (input.input_type === 'article_url') return /fail|error/i.test(input.url) ? 'error' : 'text'
  const fabrication = scenarios.fabrication.segments[0]?.text ?? ''
  if (fabrication && input.text.trim().startsWith(fabrication.slice(0, 20))) return 'fabrication'
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
  return {
    ...(fixtures.meta as Meta),
    features: {
      share_card: !off.has('share_card'),
      copy: !off.has('copy'),
      explain: !off.has('explain'),
      image: params().has('image'),
    },
  }
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
    name === 'video' ? scenarios.video : name === 'fabrication' ? scenarios.fabrication : scenarios.text
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
  const ingestDone = performance.now()
  let matching = 0
  stage('extract', 'start', { eta_seconds: isMedia ? 11 : 5 })

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
