/**
 * The investigation, as data (docs/DESIGN.md §10). One rule does not bend: nothing shown is
 * invented. Every node, figure, model name and time below is read from what the server sent —
 * the `stage`, `trace`, `claims`, `card` and `summary` events of the stream — and from
 * `meta.engines`. A step that took a millisecond may be HELD on screen long enough to be seen
 * (`shown` lags `stepsReached` by a fixed, small hold), but no step, model or number is made up,
 * and a model that was not called is shown as not used, never as running.
 */
import type { VerifyState } from '@/hooks/use-verify'

import type { Dictionary } from './dictionary'
import { formatSeconds } from './format'
import type { Engines, Meta, Trace } from './types'

export type NodeId = 'input' | 'read' | 'mushaf' | 'narrations' | 'model' | 'gradings' | 'pointer' | 'rules' | 'report'
export type NodeStatus = 'waiting' | 'active' | 'done' | 'skipped' | 'warning'

export interface Figure {
  label: string
  /** A number counts up to its value; a string is shown as it is. */
  value: number | string
}

export interface PipelineNode {
  id: NodeId
  status: NodeStatus
  title: string
  /** What the node is, in a few words; for a model, its real id. */
  detail: string
  /** The detail is a model's id: set left to right, in tabular figures. */
  modelId: boolean
  figures: Figure[]
}

/** One line of the log: one step the server reported, with the figures and the time it sent. */
export interface LogLine {
  id: 'read' | 'scan' | 'model' | 'verify' | 'rules' | 'report'
  title: string
  detail: string
  figures: Figure[]
  ms: number | null
  status: NodeStatus
}

/** The steps the display reveals, in order. `shown` counts how many have been revealed. */
export const STEPS = 7

const traceOf = <S extends Trace['step']>(traces: Trace[], step: S) =>
  traces.find((trace): trace is Extract<Trace, { step: S }> => trace.step === step)

/**
 * How many steps the server has really completed (0–7): the input was taken, it was read, the
 * sources were scanned, extraction settled, verification ended, the rules decided, the report is
 * ready. Each is tied to an event that arrived; the display never runs ahead of this number.
 */
export function stepsReached(state: VerifyState): number {
  if (state.phase === 'idle' && state.startedAt === null && state.traces.length === 0) return 0
  const done = state.phase === 'done'
  const stageDone = (id: keyof VerifyState['stages']) => state.stages[id]?.status === 'done'
  const has = (step: Trace['step']) => state.traces.some((trace) => trace.step === step)
  let reached = 1
  if (!(done || has('ingest') || stageDone('ingest') || state.highestStage >= 2)) return reached
  reached = 2
  if (!(done || has('scan') || stageDone('extract') || state.highestStage >= 3)) return reached
  reached = 3
  if (!(done || has('model') || stageDone('extract') || has('verify'))) return reached
  reached = 4
  if (!(done || has('verify') || stageDone('match') || stageDone('rules'))) return reached
  reached = 5
  if (!(done || stageDone('rules') || state.summary)) return reached
  reached = 6
  return done ? 7 : reached
}

const count = (n: number) => n.toLocaleString('en-US')

/**
 * The nodes and the log as they stand when `shown` steps have been revealed. A figure appears
 * only once its own step has: a number never shows before the node that produced it lights.
 */
export function pipelineOf(
  state: VerifyState,
  meta: Meta | null,
  shown: number,
  t: Dictionary,
): { nodes: PipelineNode[]; log: LogLine[] } {
  const p = t.pipeline
  const engines: Engines | undefined = meta?.engines
  const ingest = traceOf(state.traces, 'ingest')
  const scan = traceOf(state.traces, 'scan')
  const model = traceOf(state.traces, 'model')
  const verify = traceOf(state.traces, 'verify')
  const traced = state.traces.length > 0
  const cards = Object.values(state.cards)
  const input = state.input

  // Known not to run: no key on the server, or the server said it fell back to lexical checking.
  const lexical = state.summary?.mode === 'lexical_only' || state.notices.some((notice) => notice.code === 'llm_unavailable')
  const modelAvailable = !lexical && (engines ? engines.models.extract !== null : true)

  const phase = (from: number, to = from): NodeStatus => (shown < from ? 'waiting' : shown <= to ? 'active' : 'done')

  // ── the input and how it was read ──
  const viaImage = input?.via === 'image'
  const kind = viaImage ? 'image' : (input?.input_type ?? ingest?.input_type ?? 'text')
  const origin = ingest?.transcript_origin ?? state.source?.transcript_origin ?? null
  const readDetail = viaImage
    ? p.read.image
    : kind === 'article_url'
      ? p.read.article
      : kind === 'text'
        ? p.read.pasted
        : origin === 'captions'
          ? p.read.captions
          : origin
            ? p.read.stt
            : p.read.title
  // A model read it: the vision model for a picture, the audio model for a transcription.
  const readModel = viaImage ? engines?.models.vision : origin && origin !== 'captions' ? engines?.models.audio : null

  // ── extraction ──
  const modelStatus: NodeStatus = !modelAvailable
    ? 'skipped'
    : shown < 2
      ? 'waiting'
      : shown < 4
        ? 'active'
        : model || (!traced && state.summary?.mode === 'full')
          ? 'done'
          : 'skipped'

  // ── verification ──
  const gradingsStatus: NodeStatus =
    engines && !engines.live_gradings
      ? 'skipped'
      : shown < 4
        ? 'waiting'
        : shown < 5
          ? 'active'
          : verify
            ? verify.dorar === 'ok'
              ? 'done'
              : verify.dorar === 'unreachable'
                ? 'warning'
                : 'skipped'
            : state.summary?.warnings.includes('dorar_unreachable')
              ? 'warning'
              : cards.some((card) => card.grades.length > 0)
                ? 'done'
                : 'skipped'
  const pointerStatus: NodeStatus = !modelAvailable
    ? 'skipped'
    : shown < 4
      ? 'waiting'
      : shown < 5
        ? 'active'
        : verify && verify.pointer_calls + verify.selection_calls > 0
          ? 'done'
          : 'skipped'

  const verses = scan?.quran_verses ?? engines?.quran_verses
  const narrations = scan?.narrations ?? (engines ? engines.graded_narrations + engines.book_narrations : undefined)
  const notes = verify?.notes ?? cards.length
  const elapsed = state.summary && state.summary.elapsed_seconds >= 0.05 ? formatSeconds(state.summary.elapsed_seconds) : null

  const nodes: PipelineNode[] = [
    {
      id: 'input',
      status: shown >= 1 ? 'done' : 'waiting',
      title: p.input.title,
      detail: p.input.kinds[kind],
      modelId: false,
      figures: ingest && shown >= 2 ? [{ label: p.input.characters, value: ingest.characters }] : [],
    },
    {
      id: 'read',
      status: phase(1),
      title: p.read.title,
      detail: readModel ?? readDetail,
      modelId: !!readModel,
      figures: ingest && shown >= 2 ? [{ label: p.read.segments, value: ingest.segments }] : [],
    },
    {
      id: 'mushaf',
      status: phase(2),
      title: p.mushaf.title,
      detail: p.mushaf.detail,
      modelId: false,
      figures: [
        ...(verses !== undefined ? [{ label: p.mushaf.verses, value: verses }] : []),
        ...(scan && shown >= 3 ? [{ label: p.mushaf.hits, value: scan.quran_hits }] : []),
      ],
    },
    {
      id: 'narrations',
      status: phase(2),
      title: p.narrations.title,
      detail: p.narrations.detail,
      modelId: false,
      figures: [
        ...(narrations !== undefined ? [{ label: p.narrations.count, value: narrations }] : []),
        ...(scan && shown >= 3 ? [{ label: p.narrations.hits, value: scan.narration_hits }] : []),
      ],
    },
    {
      id: 'model',
      status: modelStatus,
      title: p.model.title,
      detail: modelStatus === 'skipped' ? p.model.unused : (model?.model ?? engines?.models.extract ?? p.model.title),
      modelId: modelStatus !== 'skipped' && !!(model?.model ?? engines?.models.extract),
      figures: model && shown >= 4 ? [{ label: p.model.proposed, value: model.proposed }] : [],
    },
    {
      id: 'gradings',
      status: gradingsStatus,
      title: p.gradings.title,
      detail:
        gradingsStatus === 'warning' ? p.gradings.unreachable : gradingsStatus === 'skipped' ? p.gradings.notCalled : p.gradings.detail,
      modelId: false,
      figures: verify && shown >= 5 && gradingsStatus === 'done' ? [{ label: p.gradings.count, value: verify.gradings }] : [],
    },
    {
      id: 'pointer',
      status: pointerStatus,
      title: p.pointer.title,
      detail: pointerStatus === 'skipped' ? p.status.skipped : p.pointer.detail,
      modelId: false,
      figures:
        verify && shown >= 5 && pointerStatus === 'done'
          ? [
              { label: p.pointer.calls, value: verify.pointer_calls },
              ...(verify.selection_calls > 0 ? [{ label: p.pointer.selections, value: verify.selection_calls }] : []),
            ]
          : [],
    },
    {
      id: 'rules',
      status: phase(5),
      title: p.rules.title,
      detail: p.rules.detail,
      modelId: false,
      figures: shown >= 6 ? [{ label: p.rules.notes, value: notes }] : [],
    },
    {
      id: 'report',
      status: phase(6),
      title: p.report.title,
      detail: p.report.detail,
      modelId: false,
      figures: shown >= 7 && elapsed ? [{ label: p.report.elapsed, value: t.verdict.elapsed(elapsed) }] : [],
    },
  ]

  // The log: one line per step the server reported, once it has been revealed — its figures and
  // the time measured for that step as a whole (a scan covers the Mushaf and the index together;
  // a verification covers the gradings, the pointing and the selection).
  const by = (id: NodeId) => nodes.find((node) => node.id === id)!
  const log: LogLine[] = []
  if (shown >= 2) {
    const read = by('read')
    log.push({
      id: 'read',
      title: read.title,
      detail: readDetail,
      figures: [...read.figures, ...by('input').figures],
      ms: ingest?.ms ?? null,
      status: read.status,
    })
  }
  if (shown >= 3) {
    log.push({
      id: 'scan',
      title: p.steps.scan,
      detail: p.mushaf.detail,
      figures: scan
        ? [
            { label: p.steps.quranHits, value: scan.quran_hits },
            { label: p.steps.narrationHits, value: scan.narration_hits },
            { label: p.narrations.markers, value: scan.markers },
          ]
        : [],
      ms: scan?.ms ?? null,
      status: 'done',
    })
  }
  if (shown >= 4) {
    const node = by('model')
    log.push({ id: 'model', title: node.title, detail: node.detail, figures: node.figures, ms: model?.ms ?? null, status: node.status })
  }
  if (shown >= 5) {
    log.push({
      id: 'verify',
      title: p.steps.verify,
      detail: by('gradings').detail,
      figures: verify ? [...by('gradings').figures, ...by('pointer').figures] : [],
      ms: verify?.ms ?? null,
      status: gradingsStatus === 'warning' ? 'warning' : 'done',
    })
  }
  if (shown >= 6) {
    const node = by('rules')
    log.push({ id: 'rules', title: node.title, detail: node.detail, figures: node.figures, ms: null, status: node.status })
  }
  if (shown >= 7) {
    const node = by('report')
    log.push({ id: 'report', title: node.title, detail: node.detail, figures: node.figures, ms: null, status: node.status })
  }

  return { nodes, log }
}

/** The figures as plain text, for a label or a log line: «الآيات 6,236 · المطابقات 1». */
export const figuresText = (figures: Figure[]): string =>
  figures.map((figure) => `${figure.label} ${typeof figure.value === 'number' ? count(figure.value) : figure.value}`).join(' · ')
