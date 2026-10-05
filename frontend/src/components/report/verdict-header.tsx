import { ChevronDown, Download, RotateCcw } from 'lucide-react'
import { Suspense, lazy, useState } from 'react'
import type { ReactNode } from 'react'

import { LegendLink } from '@/components/legend-link'
import { SummarySentence } from '@/components/report/summary-sentence'
import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import { useCountUp } from '@/hooks/use-count-up'
import { useMediaQuery } from '@/hooks/use-media-query'
import { useI18n } from '@/lib/i18n'
import type { PipelineNode } from '@/lib/pipeline'
import type { Tally } from '@/lib/report'
import { STATES_FOR_SUMMARY, STATE_STYLE } from '@/lib/states'
import { clauseState } from '@/lib/summary'
import type { ClauseKind } from '@/lib/summary'
import { cn } from '@/lib/utils'

const loadExportMenu = () => import('@/components/export-menu')
const ExportMenu = lazy(loadExportMenu)

export interface ExportActions {
  onExportJson: () => void
  onExportHtml: () => void
  onCopyReport?: () => void
}

/** A state and its count: a figure to read at a glance, and a switch that shows only its notes. */
function Tile({
  kind,
  word,
  count,
  pressed,
  onFilter,
  className,
}: {
  kind: ClauseKind
  word: string
  count: number
  pressed: boolean
  onFilter: (kind: ClauseKind | null) => void
  className?: string
}) {
  const { t } = useI18n()
  const state = clauseState(kind)
  const style = STATE_STYLE[state]
  // The figure runs up to its count when the verdict arrives.
  const shown = useCountUp(count)
  return (
    <button
      type="button"
      disabled={count === 0}
      aria-pressed={pressed}
      title={count === 0 ? undefined : pressed ? t.report.summary.showAll : t.verdict.filterBy(word)}
      onClick={() => onFilter(pressed ? null : kind)}
      data-tile={kind}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-control border bg-raised px-3 py-2 text-start transition-colors duration-150',
        pressed && cn('border-current', style.ink),
        count === 0 ? 'border-dashed bg-transparent' : 'hover:border-rule-strong',
        className,
      )}
    >
      <span className="flex items-center gap-2">
        <StateGlyph state={state} className={cn('size-5', count === 0 && 'opacity-60')} />
        <span className={cn('tabular text-xl leading-none font-semibold', count === 0 ? 'text-quiet' : 'text-ink')}>{shown}</span>
      </span>
      {/* The word in full, on two lines where the tile is narrow: a state is never a glyph alone. */}
      <span className={cn('text-sm leading-5', count === 0 ? 'text-quiet' : style.ink)}>{word}</span>
    </button>
  )
}

/**
 * The seal of a finished verdict: a gold ring with the tool's mark stamped into it. On a report
 * that was just made the ring is drawn and the mark lands — once; a reopened report carries it
 * already made.
 */
function Seal({ sealing }: { sealing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      data-testid="seal"
      data-sealing={sealing ? '' : undefined}
      className="mt-0.5 size-9 shrink-0 -rotate-6 text-gold sm:size-11"
    >
      <circle cx="24" cy="24" r="21.5" fill="none" stroke="currentColor" strokeWidth="1.6" pathLength={1} className="seal-ring" />
      <circle cx="24" cy="24" r="17.5" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 3" opacity="0.75" />
      <g className="seal-mark">
        <rect x="21" y="21" width="12.5" height="12.5" rx="3.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <rect x="14.5" y="14.5" width="12.5" height="12.5" rx="3.8" fill="currentColor" />
        <circle cx="20.75" cy="20.75" r="3.1" fill="var(--paper)" />
      </g>
    </svg>
  )
}

/**
 * The verdict, at the top of a finished report: the report in one sentence, the five states as
 * tiles with their counts (and the questions, when there are any), how long it took, what
 * really worked on it — each engine with the figures it reported — and the way to see the
 * investigation again.
 */
export function VerdictHeader({
  tally,
  filter,
  onFilter,
  elapsed,
  engines,
  sealing,
  jump,
  onReplay,
  replayOpen,
  exportActions,
  onVerifyAnother,
}: {
  tally: Tally
  filter: ClauseKind | null
  onFilter: (kind: ClauseKind | null) => void
  /** Seconds, already formatted; null for a report reopened from history. */
  elapsed: string | null
  /** The nodes that ran, with their final figures: what really worked on this report. */
  engines: PipelineNode[]
  /** The report was just made: the seal is drawn and stamped, once. */
  sealing: boolean
  /** The link to the notes, where they stand under the text. */
  jump: ReactNode
  onReplay: (() => void) | undefined
  replayOpen: boolean
  exportActions: ExportActions | undefined
  onVerifyAnother: () => void
}) {
  const { t } = useI18n()
  const [exportArmed, setExportArmed] = useState(false)
  // The five states as tiles, once there is more than one thing to count. On a phone the tiles
  // then carry the states by themselves — the sentence keeps only its head — so the verdict
  // stays short and the text and its notes start as high on the screen as they can.
  // The team wants the counts after every run (5 Oct 2026), even for a single citation.
  const tiles = tally.citations > 0
  const roomy = useMediaQuery('(min-width: 640px)')

  const exportButton = (
    <Button
      type="button"
      variant="outline"
      size="touch"
      aria-haspopup="menu"
      onPointerEnter={() => void loadExportMenu()}
      onFocus={() => void loadExportMenu()}
      onClick={exportArmed ? undefined : () => setExportArmed(true)}
    >
      <Download aria-hidden="true" />
      {/* On a phone the button is its icon; its name stays for a screen reader. */}
      <span className="max-sm:sr-only">{t.header.exportShort}</span>
    </Button>
  )

  return (
    <header data-testid="verdict" className="panel relative overflow-hidden">
      <div aria-hidden="true" className="field-points pointer-events-none absolute inset-0" />
      <div className="relative space-y-4 p-4 md:p-5">
        <div className="flex items-start gap-3 sm:gap-6">
          <Seal sealing={sealing} />
          <div className="min-w-0 flex-1">
            <SummarySentence tally={tally} filter={filter} onFilter={onFilter} clauses={roomy || !tiles} />
          </div>
          <div className="flex items-center gap-2 print:hidden">
            {exportActions ? (
              exportArmed ? (
                <Suspense fallback={exportButton}>
                  <ExportMenu defaultOpen {...exportActions}>
                    {exportButton}
                  </ExportMenu>
                </Suspense>
              ) : (
                exportButton
              )
            ) : null}
            {/* Below 1280px the bar above carries «تحقّق جديد» already. */}
            <Button type="button" size="touch" onClick={onVerifyAnother} className="max-sm:hidden">
              <RotateCcw aria-hidden="true" />
              {t.shell.newVerification}
            </Button>
          </div>
        </div>

        {/* The five states, always all five, so a count of none is seen too. A report of a single
            citation, or of questions only, has nothing to count: its sentence says everything.
            On a phone the tiles stand three and two (or three and three, with the questions),
            filling both rows. */}
        {tiles ? (
          <div
            role="group"
            aria-label={t.verdict.tiles}
            className={cn('grid grid-cols-6 gap-2', tally.questions > 0 ? 'sm:grid-cols-6' : 'sm:grid-cols-5')}
          >
            {STATES_FOR_SUMMARY.map((state, i) => (
              <Tile
                key={state}
                kind={state}
                word={t.stateWords[state]}
                count={tally.counts[state]}
                pressed={filter === state}
                onFilter={onFilter}
                className={cn(i < 3 || tally.questions > 0 ? 'col-span-2' : 'col-span-3', 'sm:col-span-1')}
              />
            ))}
            {tally.questions > 0 ? (
              <Tile
                kind="question"
                word={t.question.word}
                count={tally.questions}
                pressed={filter === 'question'}
                onFilter={onFilter}
                className="col-span-2 sm:col-span-1"
              />
            ) : null}
          </div>
        ) : null}

        {/* What really worked on this report, each with the figures it reported. */}
        <div className="flex flex-col gap-x-4 gap-y-2 border-t pt-3 text-sm lg:flex-row lg:items-center">
          {engines.length > 0 ? (
            // On a phone, one row that scrolls sideways, so the figures are there without pushing the notes down.
            <ul tabIndex={0} aria-label={t.verdict.enginesUsed} className="scroll-row flex min-w-0 flex-1 items-center gap-2 max-sm:-mx-4 max-sm:px-4 max-sm:pb-1 sm:flex-wrap">
              {elapsed ? (
                <li className="tabular shrink-0 font-semibold whitespace-nowrap text-figure">{t.verdict.elapsed(elapsed)}</li>
              ) : null}
              {engines.map((node) => (
                <li key={node.id} className="inline-flex min-h-7 max-w-full shrink-0 items-center gap-1.5 rounded-tag border px-2.5 whitespace-nowrap text-ink">
                  {/* A model is named by its role (its title), never by its id. */}
                  <span className="shrink-0">{node.title}</span>
                  {typeof node.figures[0]?.value === 'number' ? (
                    <span className="tabular font-semibold text-figure">{node.figures[0].value.toLocaleString('en-US')}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <span className="flex-1" />
          )}
          <div className="flex flex-wrap items-center gap-x-4 print:hidden">

            {jump}
            <LegendLink className="min-h-8 text-sm" />
            {onReplay ? (
              <Button type="button" variant="link" data-testid="replay" aria-expanded={replayOpen} onClick={onReplay} className="min-h-8 text-sm">
                {replayOpen ? t.pipeline.hide : t.pipeline.replay}
                <ChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-150', replayOpen && 'rotate-180')} />
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
