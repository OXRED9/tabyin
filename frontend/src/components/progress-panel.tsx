import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { VerifyState } from '@/hooks/use-verify'
import { useI18n } from '@/lib/i18n'
import type { StageId } from '@/lib/types'
import { cn } from '@/lib/utils'

const STAGES: StageId[] = ['ingest', 'extract', 'match', 'rules', 'report']

type StepStatus = 'done' | 'active' | 'pending'

/** Seconds left, counted down locally between `stage` events so the number keeps moving. */
function useEta(eta: VerifyState['eta']): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!eta) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [eta])
  if (!eta) return null
  return Math.max(0, Math.round(eta.seconds - (now - eta.at) / 1000))
}

/**
 * The head of the sheet while a verification runs: one sentence naming the current stage, the
 * five stages as one line, and a way out. The five stages are a real sequence, so they are the
 * only numbered thing in the product. Stages can overlap (matching starts on verbatim verses
 * before extraction finishes), so each step has its own status.
 *
 * The block has the same height as the summary that replaces it, so nothing under it moves when
 * the report completes.
 */
export function ProgressPanel({ state, onCancel }: { state: VerifyState; onCancel?: () => void }) {
  const { t, pick } = useI18n()
  const remaining = useEta(state.eta)

  const status = (stage: StageId, index: number): StepStatus => {
    const seen = state.stages[stage]
    if (seen?.status === 'done') return 'done'
    if (seen) return 'active'
    // Before the first event arrives the first stage is already under way.
    if (state.highestStage === 0 && index === 1) return 'active'
    // A stage that was skipped over without an event of its own is behind us.
    return index < state.highestStage ? 'done' : 'pending'
  }

  const currentIndex = Math.max(1, state.highestStage)
  const currentId = STAGES[currentIndex - 1]
  const current = state.stages[currentId]
  const detail = pick(current?.detail_ar, current?.detail_en)
  const stageName = t.stages[currentId]

  return (
    <section aria-label={t.progress.label} className="flex min-h-(--sheet-head) flex-col justify-center gap-3 border-b pb-5">
      <div className="flex items-start gap-4">
        <p className="min-w-0 flex-1 text-base" aria-live="polite">
          <span className="font-semibold text-ink">{t.progress.sentence(stageName)}</span>
          {current?.total ? (
            <span className="tabular ms-2 text-quiet">{t.progress.matched(current.done ?? 0, current.total)}</span>
          ) : null}
          {detail && detail !== stageName ? <span className="ms-2 text-quiet">{detail}</span> : null}
          {remaining === null ? null : (
            <span className="tabular ms-2 whitespace-nowrap text-quiet">
              {remaining > 1 ? t.progress.eta(remaining) : t.progress.etaSoon}
            </span>
          )}
        </p>
        {onCancel ? (
          <Button type="button" variant="outline" onClick={onCancel} className="shrink-0">
            {t.input.cancel}
          </Button>
        ) : null}
      </div>

      <ol className="flex">
        {STAGES.map((stage, i) => {
          const step = status(stage, i + 1)
          const last = i === STAGES.length - 1
          const label =
            step === 'done' ? t.progress.stageDone : step === 'active' ? t.progress.stageActive : t.progress.stagePending
          return (
            <li
              key={stage}
              aria-current={step === 'active' ? 'step' : undefined}
              className={cn('min-w-0', last ? 'flex-none' : 'flex-1')}
            >
              <div className="flex items-center">
                <span
                  className={cn(
                    'tabular flex size-6 shrink-0 items-center justify-center rounded-tag border-[1.5px] text-sm leading-none font-medium transition-colors duration-150',
                    step === 'done' && 'border-green-fill bg-green-fill text-primary-foreground',
                    step === 'active' && 'border-green text-green',
                    step === 'pending' && 'border-rule-strong text-quiet',
                  )}
                >
                  {i + 1}
                </span>
                {last ? null : (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'mx-2 flex-1 border-t-[1.5px] transition-colors duration-150',
                      step === 'done' ? 'border-green' : 'border-dashed border-rule-strong',
                    )}
                  />
                )}
              </div>
              <span
                className={cn(
                  'mt-1 block text-sm',
                  step === 'pending' ? 'text-quiet' : 'text-ink',
                  step === 'active' && 'font-medium',
                )}
              >
                {t.stagesShort[stage]}
                <span className="sr-only"> ({label})</span>
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
