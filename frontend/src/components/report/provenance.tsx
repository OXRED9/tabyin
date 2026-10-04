import type { ReactNode } from 'react'

import { SourceLink } from '@/components/report/source-link'
import { formatPercent } from '@/lib/format'
import { distinctGradings } from '@/lib/grades'
import { useI18n } from '@/lib/i18n'
import type { Card } from '@/lib/types'

/**
 * The trail of an evidence card (docs/DESIGN.md §10): how the words were matched → the source
 * and its reference, linked → the grading and who gave it, in the source's own words → the rule
 * that decided → what to do. Each step is a field of the card as the server sent it; a step the
 * card has nothing for is left out. The open note below gives every one of them in full.
 */
export function Provenance({ card }: { card: Card }) {
  const { t } = useI18n()
  const source = card.personal_case ? null : card.source
  const gradings = distinctGradings(card.grades)
  const steps: { label: string; body: ReactNode }[] = [
    {
      label: t.provenance.matched,
      body: source ? (
        <>
          {card.match_kind === 'referenced' ? t.card.referencedShort : t.matchKinds[card.match_kind]}
          {card.similarity != null ? (
            <span className="tabular text-quiet"> · {t.provenance.similarity(formatPercent(card.similarity))}</span>
          ) : null}
        </>
      ) : (
        t.provenance.none
      ),
    },
    ...(source
      ? [
          {
            label: t.provenance.source,
            body: (
              <span className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-1">
                <span dir="auto">{source.ref}</span>
                {/* A chip that may wrap on a phone: the control's corner, not a pill's. */}
                <span className="inline-flex min-h-6 max-w-full items-center rounded-control border px-2 py-0.5 text-sm">
                  <SourceLink href={source.url}>{source.source_name}</SourceLink>
                </span>
              </span>
            ),
          },
        ]
      : []),
    ...(gradings.length > 0
      ? [
          {
            label: t.provenance.grading,
            body: (
              <>
                <span lang="ar" dir="rtl" className="font-naskh text-lg leading-none">
                  {gradings.map((wording) => `«${wording}»`).join('، ')}
                </span>
                <span className="text-quiet"> — {[...new Set(card.grades.map((grade) => grade.source_name))].join('، ')}</span>
              </>
            ),
          },
        ]
      : source && card.grade_unavailable
        ? [{ label: t.provenance.grading, body: t.card.gradeUnavailable }]
        : []),
    {
      label: t.provenance.rule,
      body: (
        <bdi dir="ltr" className="tabular break-all">
          {card.rule_id}
        </bdi>
      ),
    },
    { label: t.provenance.action, body: <span className="font-semibold">{t.actions[card.action]}</span> },
  ]

  return (
    <section aria-label={t.provenance.title} data-testid="provenance" className="rounded-control border bg-raised p-3">
      <h4 className="pb-2 text-sm font-semibold text-ink">{t.provenance.title}</h4>
      <ol className="relative space-y-2">
        {steps.map((step, i) => (
          <li key={step.label} className="relative flex gap-3 text-sm">
            {/* The rail: a point per step, tied to the next. */}
            <span aria-hidden="true" className="relative mt-1.5 flex w-2 shrink-0 justify-center">
              <span className="size-2 rounded-tag bg-green" />
              {i < steps.length - 1 ? <span className="absolute top-3 -bottom-3 w-px bg-rule-strong" /> : null}
            </span>
            <span className="w-16 shrink-0 text-quiet">{step.label}</span>
            <span className="min-w-0 flex-1 text-ink">{step.body}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
