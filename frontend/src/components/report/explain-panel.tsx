import { ArrowDown, Check, ChevronDown, CircleQuestionMark, ExternalLink, Ruler, Sparkles } from 'lucide-react'
import { useId, useState } from 'react'
import type { ReactNode } from 'react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { formatDateTime, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { formatDuration, formatSimilarity } from '@/lib/markdown'
import type { Card, Explain, ExplainCandidate, ReviewerOverride, StageSeconds } from '@/lib/types'
import { cn } from '@/lib/utils'

function Label({ children }: { children: ReactNode }) {
  return <h5 className="text-xs font-semibold text-muted-foreground">{children}</h5>
}

/** "المعتمد": the candidate the card was built on. A word and an icon, not only a tint. */
function ChosenMark() {
  const { t } = useI18n()
  return (
    <span
      title={t.explain.chosenHint}
      className="inline-flex items-center gap-1 rounded-full bg-primary px-2 text-xs font-semibold leading-5 whitespace-nowrap text-primary-foreground"
    >
      <Check aria-hidden="true" className="size-3" />
      {t.explain.chosen}
    </span>
  )
}

function CandidateRef({ candidate }: { candidate: ExplainCandidate }) {
  const { t } = useI18n()
  const href = safeHref(candidate.url)
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
          >
            {candidate.ref}
            <ExternalLink aria-hidden="true" className="size-3 shrink-0 rtl:-scale-x-100" />
            <span className="sr-only">({t.opensInNewTab})</span>
          </a>
        ) : (
          candidate.ref
        )}
      </p>
      <p className="text-xs text-muted-foreground">{candidate.source_name}</p>
      <p lang="ar" dir="rtl" className="line-clamp-2 text-xs leading-relaxed text-foreground/80">
        {candidate.excerpt}
      </p>
    </div>
  )
}

const similarityText = (candidate: ExplainCandidate, byTopic: string) =>
  candidate.similarity == null ? byTopic : formatSimilarity(candidate.similarity)

/** Up to five retrieved candidates, best first: a table on wide screens, a list on phones. */
function Candidates({ candidates }: { candidates: ExplainCandidate[] }) {
  const { t } = useI18n()
  if (candidates.length === 0) return <p className="text-sm">{t.explain.noCandidates}</p>

  return (
    <>
      <div className="hidden overflow-hidden rounded-lg border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="p-2 text-start font-semibold">
                {t.explain.rank}
              </th>
              <th scope="col" className="p-2 text-start font-semibold">
                {t.explain.reference} · {t.explain.source}
              </th>
              <th scope="col" className="p-2 text-start font-semibold">
                {t.explain.similarity}
              </th>
              <th scope="col" className="p-2 text-start font-semibold">
                {t.explain.grade}
              </th>
              <th scope="col" className="p-2 text-start font-semibold">
                {t.explain.chosen}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {candidates.map((candidate) => (
              <tr key={candidate.rank} className={cn('align-top', candidate.chosen && 'bg-secondary/60')}>
                <td className="tabular p-2 font-semibold">{candidate.rank}</td>
                <td className="p-2">
                  <CandidateRef candidate={candidate} />
                </td>
                <td className="tabular p-2 font-semibold whitespace-nowrap">
                  {similarityText(candidate, t.explain.byTopic)}
                </td>
                <td className="p-2" lang="ar">
                  {candidate.grade_text ?? (
                    <>
                      <span aria-hidden="true">—</span>
                      <span className="sr-only">{t.explain.noGrade}</span>
                    </>
                  )}
                </td>
                <td className="p-2">
                  {candidate.chosen ? <ChosenMark /> : <span className="sr-only">{t.explain.notChosen}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ol className="space-y-2 sm:hidden">
        {candidates.map((candidate) => (
          <li
            key={candidate.rank}
            className={cn('space-y-2 rounded-lg border p-3 text-sm', candidate.chosen && 'bg-secondary/60')}
          >
            <div className="flex items-center gap-2">
              <span className="tabular flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                {candidate.rank}
              </span>
              {candidate.chosen ? <ChosenMark /> : null}
            </div>
            <CandidateRef candidate={candidate} />
            <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              <span>
                <span className="text-muted-foreground">{t.explain.similarity}: </span>
                <span className="tabular font-semibold">{similarityText(candidate, t.explain.byTopic)}</span>
              </span>
              <span>
                <span className="text-muted-foreground">{t.explain.grade}: </span>
                <span className="font-semibold" lang="ar">
                  {candidate.grade_text ?? t.explain.noGrade}
                </span>
              </span>
            </p>
          </li>
        ))}
      </ol>
    </>
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
    .join(' · ')

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p className="text-sm">
          <span className="text-muted-foreground">{t.explain.similarity} </span>
          <span className="tabular text-lg font-semibold">{formatSimilarity(similarity)}</span>
        </p>
        {threshold != null ? (
          <p className="text-sm">
            <span className="text-muted-foreground">{t.explain.threshold} </span>
            <span className="tabular font-semibold">{formatSimilarity(threshold)}</span>
          </p>
        ) : null}
        {meets != null ? (
          <p
            className={cn(
              'inline-flex items-center gap-1 text-sm font-semibold',
              meets ? 'text-supported-ink' : 'text-review-ink',
            )}
          >
            {meets ? <Check aria-hidden="true" className="size-4" /> : <ArrowDown aria-hidden="true" className="size-4" />}
            {meets ? t.explain.meets : t.explain.below}
          </p>
        ) : null}
      </div>
      <div
        role="meter"
        aria-label={t.explain.similarity}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={similarity}
        aria-valuetext={valueText}
        className="relative h-2 rounded-full bg-muted"
      >
        <div
          className={cn('h-full rounded-full', meets === false ? 'bg-review' : 'bg-supported')}
          style={{ width: `${percent}%` }}
        />
        {threshold != null ? (
          <span
            aria-hidden="true"
            className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
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
  override,
}: {
  card: Card
  explain: Explain
  stageSeconds: StageSeconds | undefined
  override: ReviewerOverride | undefined
}) {
  const { t, lang, pick } = useI18n()
  const [open, setOpen] = useState(false)
  const bodyId = useId()
  const rule = pick(explain.rule_ar, explain.rule_en)
  const byModel = explain.level_reason_origin === 'model'

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border" data-testid="explain">
      <CollapsibleTrigger
        aria-controls={bodyId}
        className="flex w-full items-start gap-3 rounded-lg p-3 text-start transition-colors hover:bg-muted/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <CircleQuestionMark aria-hidden="true" className="mt-1 size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 space-y-1">
          <span className="block text-sm font-semibold text-primary">{t.explain.title}</span>
          {/* The rule in words is readable before the panel is opened. */}
          <span className={cn('block text-sm', !open && 'line-clamp-2')}>{rule}</span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-180')}
        />
      </CollapsibleTrigger>

      <CollapsibleContent
        id={bodyId}
        className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down"
      >
        <div className="space-y-4 border-t p-3">
          <section className="space-y-2">
            <Label>{t.explain.similarity}</Label>
            {explain.similarity != null ? (
              <SimilarityMeter similarity={explain.similarity} threshold={explain.threshold} />
            ) : (
              <p className="text-sm">{t.explain.noSimilarity}</p>
            )}
          </section>

          <section className="space-y-2">
            <Label>{t.explain.candidates}</Label>
            <Candidates candidates={explain.candidates} />
          </section>

          <section className="space-y-2">
            <Label>{t.explain.level}</Label>
            <p className="text-sm">
              <span className="font-semibold">
                <span className="tabular">{card.content_level}</span> · {t.levels[card.content_level]}
              </span>
              {' — '}
              {pick(explain.level_reason_ar, explain.level_reason_en)}
            </p>
            <p
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium',
                byModel ? 'border border-dashed border-foreground/30' : 'bg-muted',
              )}
            >
              {byModel ? <Sparkles aria-hidden="true" className="size-3.5" /> : <Ruler aria-hidden="true" className="size-3.5" />}
              {byModel ? t.explain.levelByModel : t.explain.levelByRule}
            </p>
          </section>

          <section className="space-y-2">
            <Label>{t.explain.timing}</Label>
            <p className="tabular text-sm">{t.explain.matchMs(formatDuration(explain.match_ms / 1000, t))}</p>
            {stageSeconds ? (
              <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {(
                  [
                    [t.stages.ingest, stageSeconds.ingest],
                    [t.stages.extract, stageSeconds.extract],
                    [t.stages.match, stageSeconds.match],
                    [t.explain.total, stageSeconds.total],
                  ] as const
                ).map(([label, seconds]) => (
                  <div key={label} className="rounded-lg bg-muted/60 p-2">
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                    <dd className="tabular text-sm font-semibold">{formatDuration(seconds, t)}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </section>

          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t.explain.ruleId}</dt>
              <dd>
                <code dir="ltr" className="font-mono text-xs">
                  {card.rule_id}
                </code>
                <span className="text-muted-foreground"> · </span>
                {t.matchKinds[card.match_kind]}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">{t.explain.dataVersion}</dt>
              <dd dir="ltr" className="text-start font-mono text-xs leading-relaxed break-words">
                {explain.data_version}
              </dd>
            </div>
            {override ? (
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{t.reviewer.title}</dt>
                <dd className="tabular">{formatDateTime(override.at, lang)}</dd>
              </div>
            ) : null}
          </dl>

          <p className="border-t pt-3 text-sm">
            <span className="font-semibold">{t.explain.limits}: </span>
            {pick(explain.limits_ar, explain.limits_en)}
          </p>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
