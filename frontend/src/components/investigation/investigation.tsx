import {
  AudioLines,
  BookOpenText,
  Check,
  FileText,
  Library,
  Minus,
  MousePointerClick,
  Scale,
  ScrollText,
  Sparkles,
  TextSearch,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { StateGlyph } from '@/components/state-glyph'
import { useCountUp } from '@/hooks/use-count-up'
import { useI18n } from '@/lib/i18n'
import type { Figure, LogLine, NodeId, NodeStatus, PipelineNode } from '@/lib/pipeline'
import type { EvidenceState } from '@/lib/types'
import { cn } from '@/lib/utils'

import './stage.css'

/*
 * The investigation, shown (docs/DESIGN.md §10, v3.1): an instrument rather than a diagram. A dial
 * with the engines on its orbit; the one that is working is lit, a beam flows from it to the core,
 * and the core says what it is doing in large. Beside it a line narrates the step, the steps tick
 * off with the figures and times the server reported, and each citation appears as it is found.
 *
 * Nothing here is invented: nodes, statuses, figures and times come from `lib/pipeline.ts`, which
 * reads only what the server sent. An engine that did not run is drawn dashed and never lights.
 * With reduced motion nothing turns or travels; the same steps light and fade in place.
 */

const ICONS: Record<NodeId, typeof FileText> = {
  input: FileText,
  read: AudioLines,
  mushaf: BookOpenText,
  narrations: Library,
  model: Sparkles,
  gradings: ScrollText,
  pointer: MousePointerClick,
  rules: Scale,
  report: TextSearch,
}

/** The engines on the orbit, in the order the work reaches them, clockwise from the top. */
const ORBIT: NodeId[] = ['read', 'mushaf', 'narrations', 'model', 'gradings', 'pointer', 'rules']
/** The step of the log whose measured time is printed on a row: one time per step the server timed. */
const TIMED: Partial<Record<NodeId, LogLine['id']>> = { read: 'read', mushaf: 'scan', model: 'model', gradings: 'verify' }
/** Radius of the orbit in the dial's drawing (its box is 200 wide, centred on 0,0). */
const R = 78

/** A citation as the stage shows it while the work runs: its kind, and its state once decided. */
export interface StageCitation {
  id: string
  kind: string
  state: EvidenceState | null
  /** The state in a word (or "a question"), once decided. */
  word: string | null
}

function Counter({ value }: { value: number }) {
  return <>{useCountUp(value).toLocaleString('en-US')}</>
}
function Value({ value }: { value: number | string }) {
  return typeof value === 'number' ? <Counter value={value} /> : <>{value}</>
}

function Dots() {
  return (
    <span className="dots" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

/** Among several engines working at once, the spotlight moves from one to the next. */
function useSpotlight(count: number): number {
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    if (count < 2) return
    const timer = window.setInterval(() => setTurn((n) => n + 1), 900)
    return () => window.clearInterval(timer)
  }, [count])
  return count < 2 ? 0 : turn % count
}

function StatusMark({ status }: { status: NodeStatus }) {
  const { t } = useI18n()
  return (
    <span className="step-mark" data-mark={status}>
      {status === 'done' ? (
        <Check aria-hidden="true" data-pop="" className="size-4 text-green" />
      ) : status === 'active' ? (
        <span aria-hidden="true" className="size-2.5 animate-live rounded-tag bg-gold" />
      ) : status === 'skipped' ? (
        <Minus aria-hidden="true" className="size-4 text-quiet" />
      ) : status === 'warning' ? (
        <TriangleAlert aria-hidden="true" data-pop="" className="size-4 text-review" />
      ) : (
        <span aria-hidden="true" className="size-2 rounded-tag border border-rule-strong" />
      )}
      <span className="sr-only">{t.pipeline.status[status]}</span>
    </span>
  )
}

function Figures({ figures }: { figures: Figure[] }) {
  return (
    <>
      {figures.map((figure) => (
        <span key={figure.label} className="whitespace-nowrap">
          <span className="font-semibold text-figure">
            <Value value={figure.value} />
          </span>{' '}
          <span className="text-quiet">{figure.label}</span>
        </span>
      ))}
    </>
  )
}

/** The dial: ticks, the orbit, a beam per engine, the sweep, and the core. Drawn for the eye only. */
function Dial({ orbit, focus, finished, elapsed }: { orbit: PipelineNode[]; focus: PipelineNode | null; finished: boolean; elapsed: Figure | null }) {
  const { t } = useI18n()
  const angle = (i: number) => (360 / orbit.length) * i
  const point = (i: number) => {
    const a = ((angle(i) - 90) * Math.PI) / 180
    return { x: Math.cos(a) * R, y: Math.sin(a) * R }
  }
  const FocusIcon = focus ? ICONS[focus.id] : null
  const figure = focus?.figures[focus.figures.length - 1] ?? null
  return (
    <div className="orb" data-finished={finished ? '' : undefined} aria-hidden="true">
      <span className="orb-halo" />
      <svg viewBox="-100 -100 200 200" fill="none">
        {/* The rim: fine ticks, a longer one every tenth, turning slowly like an instrument's scale. */}
        <circle r="96" className="orb-ticks" strokeWidth="2.5" pathLength="360" strokeDasharray="0.5 2.5" />
        <circle r="95" className="orb-ticks-major" strokeWidth="4.5" pathLength="360" strokeDasharray="0.7 29.3" />
        <circle r={R} className="orb-orbit" strokeWidth="0.6" />
        <circle r="50" className="orb-inner" strokeWidth="0.8" />
        {orbit.map((node, i) => {
          const { x, y } = point(i)
          // Drawn from the engine to the core, so the flow runs inwards.
          return <line key={node.id} x1={x * 0.86} y1={y * 0.86} x2={x * 0.6} y2={y * 0.6} className="beam" data-status={node.status} />
        })}
        <circle r="44.5" className="orb-arc-track" />
        <circle r="44.5" className="orb-arc" pathLength="100" />
      </svg>
      <span className="orb-sweep" />
      <ul className="orb-sats">
        {orbit.map((node, i) => {
          const Icon = ICONS[node.id]
          return (
            <li key={node.id} className="sat" data-status={node.status} style={{ '--angle': `${angle(i)}deg` } as CSSProperties}>
              <span className="sat-face">
                <Icon />
                {node.status === 'done' ? (
                  <span className="sat-tick">
                    <Check />
                  </span>
                ) : null}
              </span>
            </li>
          )
        })}
      </ul>
      {finished ? <span className="orb-burst" /> : null}
      <div className="orb-core">
        {finished ? (
          <div className="orb-core-inner" key="finished">
            <span className="core-seal">
              <Check />
            </span>
            {elapsed ? (
              <span className="core-label tabular">
                <Value value={elapsed.value} />
              </span>
            ) : null}
          </div>
        ) : focus && FocusIcon ? (
          <div className="orb-core-inner" key={focus.id}>
            <FocusIcon />
            <span className="core-figure">{figure ? <Value value={figure.value} /> : <Dots />}</span>
            <span className="core-label">{figure ? figure.label : focus.title}</span>
          </div>
        ) : (
          <div className="orb-core-inner" key="waiting">
            <span className="core-figure">
              <Dots />
            </span>
            <span className="core-label">{t.pipeline.running}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Investigation({
  nodes,
  log,
  head,
  citations = [],
}: {
  nodes: PipelineNode[]
  log: LogLine[]
  /** What stands above the stage: the progress line while it runs, a title when it is replayed. */
  head: ReactNode
  /** The citations found so far, in reading order. */
  citations?: StageCitation[]
}) {
  const { t } = useI18n()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const orbit = ORBIT.map((id) => byId.get(id)).filter((node): node is PipelineNode => !!node)
  const report = byId.get('report')
  const finished = report?.status === 'done'

  // What the core shows: an engine that is working now (the spotlight moves between several), or
  // the first one still to come.
  const working = orbit.filter((node) => node.status === 'active')
  const spotlight = useSpotlight(working.length)
  const focus = working[spotlight] ?? working[0] ?? orbit.find((node) => node.status === 'waiting') ?? null
  const settledCount = orbit.filter((node) => node.status !== 'waiting' && node.status !== 'active').length
  const progress = finished ? 1 : (settledCount + (working.length > 0 ? 0.5 : 0)) / (orbit.length + 1)
  const times = new Map(log.map((line) => [line.id, line.ms]))
  const elapsed = report?.figures[0] ?? null
  const narrated = finished ? report : (working[spotlight] ?? working[0] ?? null)

  return (
    <section aria-label={t.pipeline.title} data-testid="investigation" className="panel relative overflow-hidden">
      <div aria-hidden="true" className="field-points pointer-events-none absolute inset-0" />
      <div className="relative space-y-3 p-4 md:space-y-4 md:p-5">
        {head}
        <div className="stage-body">
          <Dial orbit={orbit} focus={focus} finished={finished} elapsed={elapsed} />
          <div className="stage-side">
            <div className="narrator" aria-hidden="true">
              <p className="narrator-line" key={narrated?.id ?? 'start'}>
                <span className="block text-lg font-semibold text-ink md:text-xl">{narrated ? narrated.title : t.pipeline.running}</span>
                <span className="block truncate text-sm text-quiet md:text-base">{narrated?.detail ?? ''}</span>
              </p>
              <div className="stage-progress" data-running={finished ? undefined : ''}>
                <span style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            </div>
            <ol aria-label={t.pipeline.log} data-testid="pipeline-log" className="steps">
              {orbit.map((node) => {
                const timed = TIMED[node.id]
                const ms = timed && node.status !== 'waiting' && node.status !== 'active' ? (times.get(timed) ?? null) : null
                return (
                  <li key={node.id} className="step" data-node={node.id} data-status={node.status}>
                    <StatusMark status={node.status} />
                    <span className={cn('shrink-0 font-semibold', node.status === 'waiting' || node.status === 'skipped' ? 'font-normal text-quiet' : 'text-ink')}>{node.title}</span>
                    <span className="tabular flex min-w-0 flex-1 gap-x-2.5 overflow-hidden whitespace-nowrap">
                      {node.figures.length > 0 ? <Figures figures={node.figures} /> : <span className="truncate text-quiet">{node.status === 'active' ? node.detail : ''}</span>}
                    </span>
                    {ms !== null ? <span className="tabular shrink-0 text-xs text-quiet">{t.pipeline.ms(ms)}</span> : null}
                  </li>
                )
              })}
            </ol>
            <ul className="found" aria-hidden="true">
              {citations.slice(0, 12).map((citation) => (
                <li key={citation.id} className="found-chip">
                  <StateGlyph state={citation.state ?? 'pending'} className="size-4" />
                  <span className="text-ink">{citation.kind}</span>
                  {citation.word ? <span className="text-quiet">{citation.word}</span> : null}
                </li>
              ))}
              {citations.length > 12 ? (
                <li className="found-chip tabular text-quiet">+{(citations.length - 12).toLocaleString('en-US')}</li>
              ) : null}
            </ul>
          </div>
        </div>
      </div>
    </section>
  )
}
