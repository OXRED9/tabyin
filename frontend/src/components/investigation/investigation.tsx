import { Check } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import { useI18n } from '@/lib/i18n'
import { figuresText } from '@/lib/pipeline'
import type { LogLine, NodeId, PipelineNode } from '@/lib/pipeline'
import type { EvidenceState } from '@/lib/types'

import './stage.css'

/*
 * The investigation (docs/DESIGN.md §10, v3.2 — the glass prototype the team chose, 5 Oct 2026):
 * one glass status bar that says, in a sentence, what is working now with its real figure, a clock,
 * and a thin progress line; under it the sources, each lighting as it answers. The text pane below
 * is read under a band of light and its citations ink in as they are found, so the page that is
 * searching is already the report. When the work is done the verdict header with the counts takes
 * the bar's place.
 *
 * Nothing here is invented: steps, statuses and figures come from `lib/pipeline.ts`, which reads only
 * what the server sent; a source that did not run is struck through and never lights.
 */

/** The sources, in the order the work reaches them. */
const SOURCES: NodeId[] = ['read', 'mushaf', 'narrations', 'model', 'gradings', 'pointer', 'rules']

/** A citation as the stage shows it while the work runs (kept for the call site). */
export interface StageCitation {
  id: string
  kind: string
  state: EvidenceState | null
  word: string | null
}

/** Among several sources working at once, the sentence moves from one to the next. */
function useSpotlight(count: number): number {
  const [turn, setTurn] = useState(0)
  useEffect(() => {
    if (count < 2) return
    const timer = window.setInterval(() => setTurn((n) => n + 1), 700)
    return () => window.clearInterval(timer)
  }, [count])
  return count < 2 ? 0 : turn % count
}

/** Seconds since the stage appeared, to a tenth, until the work is done. */
function useClock(running: boolean): number {
  const start = useRef<number | null>(null)
  const [now, setNow] = useState(0)
  useEffect(() => {
    if (!running) return
    start.current ??= performance.now()
    const timer = window.setInterval(() => setNow((performance.now() - (start.current ?? 0)) / 1000), 100)
    return () => window.clearInterval(timer)
  }, [running])
  return now
}

export default function Investigation({
  nodes,
  log,
  head,
}: {
  nodes: PipelineNode[]
  log: LogLine[]
  /** Beside the clock: the cancel button while it runs, nothing when it is replayed. */
  head: ReactNode
  citations?: StageCitation[]
}) {
  const { t } = useI18n()
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const sources = SOURCES.map((id) => byId.get(id)).filter((node): node is PipelineNode => !!node)
  const report = byId.get('report')
  const finished = report?.status === 'done'
  const working = sources.filter((node) => node.status === 'active')
  const turn = useSpotlight(working.length)
  const current = working[turn] ?? working[0] ?? null
  const settled = sources.filter((node) => node.status !== 'waiting' && node.status !== 'active').length
  const progress = finished ? 1 : (settled + (working.length ? 0.5 : 0)) / (sources.length + 1)
  const clock = useClock(!finished)
  const lastLine = log.length > 0 ? log[log.length - 1] : null

  const sentence = finished ? t.pipeline.finished : current ? `${t.pipeline.say[current.id] ?? current.title}…` : `${t.pipeline.running}…`
  const detail = finished
    ? report?.figures.length
      ? figuresText(report.figures)
      : ''
    : current
      ? current.figures.length > 0
        ? figuresText(current.figures)
        : current.detail
      : (lastLine?.detail ?? '')

  return (
    <section aria-label={t.pipeline.title} data-testid="investigation" className="run">
      <div className="run-glass run-pill" aria-live="polite">
        <span className="run-orb" data-done={finished ? '' : undefined} aria-hidden="true">
          {finished ? <Check /> : null}
        </span>
        <span className="run-now">
          <b key={sentence}>{sentence}</b>
          <small dir="auto">{detail}</small>
        </span>
        {finished ? null : <span className="run-clock">{t.pipeline.seconds(clock)}</span>}
        {head}
        <span className="run-bar" aria-hidden="true">
          <i style={{ width: `${Math.round(progress * 100)}%` } as CSSProperties} />
        </span>
      </div>
      <ul className="run-chips" aria-label={t.pipeline.log} data-testid="pipeline-log">
        {sources.map((node) => (
          <li key={node.id} className="run-glass run-chip" data-node={node.id} data-status={node.status}>
            <i aria-hidden="true" />
            {node.title}
            <span className="sr-only">{t.pipeline.status[node.status]}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
