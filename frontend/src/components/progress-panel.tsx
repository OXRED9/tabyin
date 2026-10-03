import { Check, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { progressPercent } from '@/hooks/use-verify'
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
 * Five-stage progress with the current stage's name and an estimated time. Stages can overlap
 * (matching starts on verbatim verses before extraction finishes), so each step has its own
 * status and the bar follows the highest stage seen.
 */
export function ProgressPanel({ state, onCancel }: { state: VerifyState; onCancel: () => void }) {
  const { t, pick } = useI18n()
  const remaining = useEta(state.eta)
  const percent = progressPercent(state)

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
    <Card role="region" aria-label={t.progress.label} className="animate-rise p-4 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1" aria-live="polite">
          <p className="text-sm text-muted-foreground">{t.progress.stageOf(currentIndex)}</p>
          <p className="text-base font-semibold">
            {stageName}
            {current?.total ? (
              <span className="tabular ms-2 text-sm font-normal text-muted-foreground">
                {t.progress.matched(current.done ?? 0, current.total)}
              </span>
            ) : null}
          </p>
          {detail && detail !== stageName ? (
            <p className="truncate text-sm text-muted-foreground">{detail}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <p className="tabular text-sm text-muted-foreground">
            {remaining === null ? null : remaining > 1 ? t.progress.eta(remaining) : t.progress.etaSoon}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onCancel} className="hidden sm:inline-flex">
            {t.input.cancel}
          </Button>
        </div>
      </div>

      <Progress value={percent} aria-label={t.progress.label} className="mt-4" />

      <ol className="mt-4 grid grid-cols-5 gap-2">
        {STAGES.map((stage, i) => {
          const step = status(stage, i + 1)
          const label =
            step === 'done' ? t.progress.stageDone : step === 'active' ? t.progress.stageActive : t.progress.stagePending
          return (
            <li
              key={stage}
              aria-current={step === 'active' ? 'step' : undefined}
              className="flex flex-col items-center gap-2 text-center sm:flex-row sm:text-start"
            >
              <span
                className={cn(
                  'tabular flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                  step === 'done' && 'bg-primary text-primary-foreground',
                  step === 'active' && 'bg-gold text-gold-foreground',
                  step === 'pending' && 'bg-muted text-muted-foreground',
                )}
              >
                {step === 'done' ? (
                  <Check aria-hidden="true" className="size-4" />
                ) : step === 'active' ? (
                  <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  'text-xs leading-snug',
                  step === 'pending' ? 'text-muted-foreground' : 'font-medium text-foreground',
                  'max-sm:sr-only',
                )}
              >
                {t.stages[stage]}
                <span className="sr-only"> ({label})</span>
              </span>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
