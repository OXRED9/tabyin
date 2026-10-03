import { Check, ChevronDown } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import { SourceLink } from '@/components/report/source-link'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatSimilarity } from '@/lib/markdown'
import type { Card, Explain, ExplainCandidate, StageSeconds } from '@/lib/types'
import { cn } from '@/lib/utils'

function Label({ children }: { children: ReactNode }) {
  return <h5 className="text-sm text-quiet">{children}</h5>
}

/** "المعتمد": the candidate the note was built on. A tag: a word and an icon, not only a tint. */
function ChosenMark() {
  const { t } = useI18n()
  return (
    <span
      title={t.explain.chosenHint}
      className="inline-flex items-center gap-1 rounded-tag bg-accent px-2 text-sm whitespace-nowrap text-supported-ink"
    >
      <Check aria-hidden="true" className="size-3.5" />
      {t.explain.chosen}
    </span>
  )
}

const similarityText = (candidate: ExplainCandidate, byTopic: string) =>
  candidate.similarity == null ? byTopic : formatSimilarity(candidate.similarity)

/** Up to five retrieved candidates, best first. The order is the ranking, so no numerals are shown. */
function Candidates({ candidates }: { candidates: ExplainCandidate[] }) {
  const { t } = useI18n()
  if (candidates.length === 0) return <p className="text-sm">{t.explain.noCandidates}</p>

  return (
    <ol className="divide-y border-y">
      {candidates.map((candidate) => (
        <li key={candidate.rank} className="space-y-1 py-2 text-sm">
          <p className="flex flex-wrap items-center gap-x-2">
            <span className="sr-only">
              {t.explain.rank} {candidate.rank}:
            </span>
            <SourceLink href={candidate.url}>{candidate.ref}</SourceLink>
            {candidate.chosen ? <ChosenMark /> : <span className="sr-only">{t.explain.notChosen}</span>}
          </p>
          <p className="text-quiet">{candidate.source_name}</p>
          <p lang="ar" dir="rtl" className="line-clamp-2 font-naskh text-lg text-ink">
            {candidate.excerpt}
          </p>
          <p className="text-quiet">
            {t.explain.similarity}:{' '}
            <span className="tabular font-semibold text-ink">{similarityText(candidate, t.explain.byTopic)}</span>
            {t.report.summary.comma}
            {t.explain.grade}:{' '}
            <span className="font-semibold text-ink" lang="ar">
              {candidate.grade_text ?? t.explain.noGrade}
            </span>
          </p>
        </li>
      ))}
    </ol>
  )
}

/** Similarity against its threshold: both numbers are printed, and the outcome is a word. */
function SimilarityMeter({ similarity, threshold }: { similarity: number; threshold: number | null }) {
  const { t } = useI18n()
  const meets = threshold == null ? null : similarity >= threshold
  const percent = Math.round(Math.max(0, Math.min(1, similarity)) * 100)
  const valueText = [
    t.explain.similarityOf(formatSimilarity(similarity)),
    threshold == null ? null : t.explain.thresholdOf(formatSimilarity(threshold)),
    meets == null ? null : meets ? t.explain.meets : t.explain.below,
  ]
    .filter(Boolean)
    .join(t.report.summary.comma)

  return (
    <div className="space-y-2">
      <p className="text-sm">
        <span className="text-quiet">{t.explain.similarity} </span>
        <span className="tabular text-base font-semibold">{formatSimilarity(similarity)}</span>
        {threshold != null ? (
          <>
            {t.report.summary.comma}
            <span className="text-quiet">{t.explain.threshold} </span>
            <span className="tabular font-semibold">{formatSimilarity(threshold)}</span>
          </>
        ) : null}
        {meets != null ? (
          <>
            {' — '}
            <span className={cn('font-semibold', meets ? 'text-supported-ink' : 'text-review-ink')}>
              {meets ? t.explain.meets : t.explain.below}
            </span>
          </>
        ) : null}
      </p>
      <div
        role="meter"
        aria-label={t.explain.similarity}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={similarity}
        aria-valuetext={valueText}
        className="relative h-1 bg-rule"
      >
        <div className={cn('h-full', meets === false ? 'bg-review' : 'bg-supported')} style={{ width: `${percent}%` }} />
        {threshold != null ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 h-3 w-0.5 bg-ink"
            style={{ insetInlineStart: `${Math.round(threshold * 100)}%` }}
          />
        ) : null}
      </div>
    </div>
  )
}

/**
 * F5 «لماذا هذا الحكم؟». How the verdict was reached, in the order someone checking it would
 * ask: which rule fired, how close the match was, what else was retrieved, why this content
 * level, how long it took and on which data, and, always last, what the verdict does not cover.
 */
export function ExplainPanel({
  card,
  explain,
  stageSeconds,
}: {
  card: Card
  explain: Explain
  stageSeconds: StageSeconds | undefined
}) {
  const { t, pick } = useI18n()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const rule = pick(explain.rule_ar, explain.rule_en)
  const byModel = explain.level_reason_origin === 'model'

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t" data-testid="explain">
      <CollapsibleTrigger aria-controls={bodyId} className="flex w-full items-start gap-2 py-2 text-start text-sm">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-green">{t.explain.title}</span>
          {/* The rule in words is readable before the panel is opened. */}
          <span className={cn('block text-ink', !open && 'line-clamp-2')}>{rule}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('mt-1 size-4 shrink-0 text-quiet transition-transform duration-150', open && 'rotate-180')}
        />
      </CollapsibleTrigger>

      <CollapsibleContent id={bodyId} className="space-y-4 pb-3">
        <section className="space-y-1">
          <Label>{t.explain.similarity}</Label>
          {explain.similarity != null ? (
            <SimilarityMeter similarity={explain.similarity} threshold={explain.threshold} />
          ) : (
            <p className="text-sm">{t.explain.noSimilarity}</p>
          )}
        </section>

        <section className="space-y-1">
          <Label>{t.explain.candidates}</Label>
          <Candidates candidates={explain.candidates} />
        </section>

        <section className="space-y-1">
          <Label>{t.explain.level}</Label>
          <p className="text-sm">
            <span className="font-semibold">
              <span className="tabular">{card.content_level}</span>
              {t.report.summary.comma}
              {t.levels[card.content_level]}
            </span>
            {' — '}
            {pick(explain.level_reason_ar, explain.level_reason_en)}
          </p>
          <p className="text-sm text-quiet">{byModel ? t.explain.levelByModel : t.explain.levelByRule}</p>
        </section>

        <section className="space-y-1">
          <Label>{t.explain.timing}</Label>
          <p className="tabular text-sm">{t.explain.matchMs(formatDuration(explain.match_ms / 1000, t))}</p>
          {stageSeconds ? (
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
              {(
                [
                  [t.stages.ingest, stageSeconds.ingest],
                  [t.stages.extract, stageSeconds.extract],
                  [t.stages.match, stageSeconds.match],
                  [t.explain.total, stageSeconds.total],
                ] as const
              ).map(([label, seconds]) => (
                <div key={label}>
                  <dt className="text-quiet">{label}</dt>
                  <dd className="tabular font-semibold">{formatDuration(seconds, t)}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </section>

        <dl className="space-y-2 text-sm">
          <div className="min-w-0">
            <dt className="text-quiet">{t.explain.ruleId}</dt>
            <dd>
              <span dir="ltr" className="tabular break-words">
                {card.rule_id}
              </span>
              {t.report.summary.comma}
              {t.matchKinds[card.match_kind]}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-quiet">{t.explain.dataVersion}</dt>
            {/* The backend joins the parts with middle dots; here each part has its own line. */}
            <dd dir="ltr" className="tabular text-start break-words">
              {explain.data_version.split(' · ').map((part) => (
                <span key={part} className="block">
                  {part}
                </span>
              ))}
            </dd>
          </div>
        </dl>

        <p className="border-t pt-3 text-sm">
          <span className="font-semibold">{t.explain.limits}: </span>
          {pick(explain.limits_ar, explain.limits_en)}
        </p>
      </CollapsibleContent>
    </Collapsible>
  )
}
