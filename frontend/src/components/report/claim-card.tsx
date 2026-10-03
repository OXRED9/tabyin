import {
  ChevronDown,
  Clock,
  ExternalLink,
  GraduationCap,
  Info,
  LocateFixed,
  Scale,
  Sparkles,
  TriangleAlert,
  UserRound,
  UserRoundCheck,
  X,
} from 'lucide-react'
import { memo, useId, useState } from 'react'
import type { MouseEvent, ReactNode } from 'react'

import { DiffView, ExactMatch } from '@/components/report/diff-view'
import { ReviewerPanel } from '@/components/report/reviewer-panel'
import { StateBadge } from '@/components/state-badge'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Card as Surface } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { diffCoversSource, hasDifferences } from '@/lib/diff'
import { formatClock, formatDateTime, formatPercent, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import { CLAIM_ICON, STATE_STYLE, isRisky } from '@/lib/states'
import type {
  Card,
  ClaimStub,
  Grade,
  Meta,
  ReviewerOverride,
  SourceInfo,
  SourceRef,
} from '@/lib/types'
import { timestampLink } from '@/lib/video'
import { cn } from '@/lib/utils'

// ── Small building blocks ─────────────────────────────────────────────────────────────────────

/** Labels are secondary, values primary. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  )
}

function SectionTitle({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <h4 className="flex flex-wrap items-baseline gap-x-2 text-xs font-semibold text-muted-foreground">
      {children}
      {hint ? <span className="font-normal">· {hint}</span> : null}
    </h4>
  )
}

/** A link that looks like one: brand colour, underline, and an "opens elsewhere" arrow. */
function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  const { t } = useI18n()
  const safe = safeHref(href)
  if (!safe) return <span>{children}</span>
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium text-primary underline decoration-primary/40 underline-offset-4 hover:decoration-primary"
    >
      {children}
      <ExternalLink aria-hidden="true" className="size-3.5 shrink-0 rtl:-scale-x-100" />
      <span className="sr-only">({t.opensInNewTab})</span>
    </a>
  )
}

function TypeLabel({ type }: { type: Card['claim_type'] }) {
  const { t } = useI18n()
  const Icon = CLAIM_ICON[type]
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon aria-hidden="true" className="size-3.5" />
      {t.claimTypes[type]}
    </span>
  )
}

/** "الدقيقة 02:14": a link into the video for video sources, plain text otherwise. */
function TimestampChip({ seconds, source }: { seconds: number; source: SourceInfo | null }) {
  const { t } = useI18n()
  const clock = formatClock(seconds)
  const href = timestampLink(source, seconds)
  const body = (
    <>
      <Clock aria-hidden="true" className="size-3.5" />
      <span className="tabular" dir="ltr">
        {clock}
      </span>
    </>
  )
  if (!href) {
    return (
      <span
        className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground"
        title={t.card.occurredAt(clock)}
      >
        {body}
        <span className="sr-only">{t.card.occurredAt(clock)}</span>
      </span>
    )
  }
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t.card.openVideoAt(clock)}
          className="inline-flex h-7 items-center gap-1 rounded-md bg-secondary px-2 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          {body}
          <ExternalLink aria-hidden="true" className="size-3 rtl:-scale-x-100" />
        </a>
      </TooltipTrigger>
      <TooltipContent>{t.card.openVideoAt(clock)}</TooltipContent>
    </Tooltip>
  )
}

function LongText({
  text,
  quran = false,
  className,
}: {
  text: string
  quran?: boolean
  className?: string
}) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const long = text.length > 420
  return (
    <div>
      <p
        lang="ar"
        dir="rtl"
        className={cn(
          'whitespace-pre-line',
          quran ? 'quran-text text-xl' : 'text-base leading-loose',
          long && !open && 'line-clamp-4',
          className,
        )}
      >
        {text}
      </p>
      {long ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto p-0 underline"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t.card.showLess : t.card.showMore}
        </Button>
      ) : null}
    </div>
  )
}

function SourceBlock({
  source,
  diff,
  title,
}: {
  source: SourceRef
  diff: Card['diff']
  title: string
}) {
  const { t } = useI18n()
  const quran = source.kind === 'quran'
  // When the comparison already prints the source text word for word, do not print it twice.
  const shownByDiff = hasDifferences(diff) && diffCoversSource(diff, source.text)
  return (
    <section className="space-y-2">
      {shownByDiff ? null : (
        <>
          <SectionTitle>{title}</SectionTitle>
          <div className="rounded-lg bg-muted/60 p-3">
            <LongText text={source.text} quran={quran} />
          </div>
        </>
      )}
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        <Field label={t.card.reference}>{source.ref}</Field>
        <Field label={t.card.source}>
          <SourceLink href={source.url}>{source.source_name}</SourceLink>
        </Field>
        {source.attribution && source.attribution !== source.ref ? (
          <Field label={t.card.attribution}>
            <span lang="ar" dir="rtl" className="whitespace-pre-line">
              {source.attribution}
            </span>
          </Field>
        ) : null}
      </dl>
      {source.translation ? (
        <div className="space-y-1 rounded-lg border p-3">
          <SectionTitle>{t.card.translation}</SectionTitle>
          <p lang={source.translation.lang} dir="auto" className="text-sm leading-relaxed">
            {source.translation.text}
          </p>
          <p className="text-xs text-muted-foreground">
            <SourceLink href={source.translation.source_url}>{source.translation.source_name}</SourceLink>
          </p>
        </div>
      ) : null}
    </section>
  )
}

/**
 * Hadith gradings exactly as the sources word them. When there are several they are all listed,
 * in the order received, with no preference; when there is none the card says so.
 */
function Grades({ grades, unavailable }: { grades: Grade[]; unavailable: boolean }) {
  const { t } = useI18n()
  if (grades.length === 0 && !unavailable) return null
  return (
    <section className="space-y-2">
      <SectionTitle hint={grades.length > 0 ? t.card.gradeVerbatim : undefined}>{t.card.grades}</SectionTitle>
      {grades.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm font-medium">
          <Info aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          {t.card.gradeUnavailable}
        </p>
      ) : (
        <>
          {grades.length > 1 ? <p className="text-sm text-muted-foreground">{t.card.gradesMany}</p> : null}
          <ul className="divide-y rounded-lg border">
            {grades.map((grade, i) => (
              <li key={i} className="space-y-1 p-3">
                <p lang="ar" dir="rtl" className="whitespace-pre-line text-base font-semibold">
                  {grade.text}
                </p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {grade.scholar ? (
                    <span>
                      {t.card.scholar}: <span className="font-medium text-foreground">{grade.scholar}</span>
                    </span>
                  ) : null}
                  {grade.book ? (
                    <span>
                      {t.card.book}: <span className="font-medium text-foreground">{grade.book}</span>
                    </span>
                  ) : null}
                  {grade.narrator ? (
                    <span>
                      {t.card.narrator}: <span className="font-medium text-foreground">{grade.narrator}</span>
                    </span>
                  ) : null}
                  <SourceLink href={grade.source_url}>{grade.source_name}</SourceLink>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  )
}

function Callout({
  icon: Icon,
  tone,
  children,
}: {
  icon: typeof Info
  tone: string
  children: ReactNode
}) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg p-3 text-sm', tone)}>
      <Icon aria-hidden="true" className="mt-1 size-4 shrink-0" />
      <div className="min-w-0 flex-1 space-y-2">{children}</div>
    </div>
  )
}

// ── The card ──────────────────────────────────────────────────────────────────────────────────

export interface ClaimCardProps {
  card: Card
  override: ReviewerOverride | undefined
  source: SourceInfo | null
  meta: Meta | null
  reviewerMode: boolean
  highlighted: boolean
  linked: boolean
  open: boolean
  onOpenChange: (cardId: string, open: boolean) => void
  onLocate: (cardId: string) => void
  onHover: (cardId: string | null) => void
  onReferral: () => void
  onSaveOverride: (override: ReviewerOverride) => void
  onRemoveOverride: (cardId: string) => void
}

export const ClaimCard = memo(function ClaimCard({
  card,
  override,
  source,
  meta,
  reviewerMode,
  highlighted,
  linked,
  open,
  onOpenChange,
  onLocate,
  onHover,
  onReferral,
  onSaveOverride,
  onRemoveOverride,
}: ClaimCardProps) {
  const { t, lang, pick } = useI18n()
  const detailsId = useId()
  const setOpen = (next: boolean) => onOpenChange(card.id, next)

  const state = override?.state ?? card.state
  const stateChanged = !!override && override.state !== override.original_state
  const style = STATE_STYLE[state]
  const risky = isRisky(state)
  const RiskIcon = state === 'not_found' ? X : STATE_STYLE.contradicted.icon
  const note = pick(card.note_ar, card.note_en)
  const showDiff = hasDifferences(card.diff)
  const verse = meta?.abstention_verse ?? null
  const showReferral = card.referral || card.personal_case || card.disagreement_noted || state === 'not_found'

  // One line under the quoted text: reference first, then how it matched and how it is graded.
  const referenceBits: string[] = []
  if (card.source) {
    referenceBits.push(card.source.ref)
    if (card.match_kind !== 'none') referenceBits.push(t.matchKinds[card.match_kind])
  }
  const gradeBit =
    card.grades.length === 1
      ? card.grades[0].text.split('\n')[0]
      : card.grades.length > 1
        ? t.card.gradesCount(card.grades.length)
        : null

  // The whole header toggles the details for mouse users, without swallowing a text selection
  // or a click on one of the controls inside it. Keyboard users have the real button below.
  const toggleFromHeader = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    if (target.closest('a, button, input, [role="menuitem"]')) return
    if (window.getSelection()?.toString()) return
    setOpen(!open)
  }

  return (
    <Surface
      role="article"
      id={`card-${card.id}`}
      data-state={state}
      data-card-id={card.id}
      aria-label={`${t.card.claimN(card.index)}: ${t.states[state]}`}
      onMouseEnter={() => onHover(card.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        'scroll-mt-24 animate-rise rounded-xl border-s-[6px] transition-shadow duration-200 hover:shadow-raised',
        style.edge,
        style.cardTone,
        linked && 'ring-2 ring-primary/50',
        highlighted && 'ring-2 ring-gold',
      )}
    >
      <Collapsible open={open} onOpenChange={setOpen}>
        <div onClick={toggleFromHeader} className="flex cursor-pointer gap-3 p-4 sm:gap-4">
          {risky ? (
            <span
              aria-hidden="true"
              className={cn(
                'mt-1 flex size-10 shrink-0 items-center justify-center rounded-full text-white sm:size-12',
                style.solid,
              )}
            >
              <RiskIcon className="size-5 sm:size-6" strokeWidth={2.5} />
            </span>
          ) : null}

          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <StateBadge state={state} />
              <TypeLabel type={card.claim_type} />
              <span className="ms-auto flex items-center gap-1">
                {card.timestamp ? <TimestampChip seconds={card.timestamp.start} source={source} /> : null}
                {card.span ? (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t.card.locate}
                        onClick={() => onLocate(card.id)}
                        className="text-muted-foreground hover:text-primary"
                      >
                        <LocateFixed aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t.card.locate}</TooltipContent>
                  </Tooltip>
                ) : null}
              </span>
            </div>

            {override ? (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-gold-soft px-2 py-1 text-xs">
                <UserRoundCheck aria-hidden="true" className="size-3.5 shrink-0 text-gold-ink" />
                <span className="font-semibold">{stateChanged ? t.reviewer.modified : t.reviewer.noted}</span>
                {stateChanged ? (
                  <span>
                    {t.reviewer.original}: {t.states[override.original_state]}
                  </span>
                ) : null}
                <span>· {t.reviewer.by(override.reviewer || t.reviewer.anonymous)}</span>
                {override.note ? <span className="basis-full">{override.note}</span> : null}
              </p>
            ) : null}

            <h3
              lang="ar"
              dir="rtl"
              className={cn(
                'text-base font-semibold leading-loose',
                risky && style.ink,
                !open && 'line-clamp-3',
              )}
            >
              {card.text_as_quoted}
            </h3>

            {referenceBits.length > 0 || gradeBit || card.grade_unavailable ? (
              <p className="text-sm">
                {referenceBits.length > 0 ? (
                  <>
                    <span className="text-muted-foreground">{t.card.reference}: </span>
                    <span>{referenceBits.join(' · ')}</span>
                  </>
                ) : null}
                {gradeBit ? (
                  <>
                    {referenceBits.length > 0 ? ' · ' : null}
                    <span className="text-muted-foreground">{t.card.grade}: </span>
                    <span>{gradeBit}</span>
                  </>
                ) : card.grade_unavailable ? (
                  <>
                    {referenceBits.length > 0 ? ' · ' : null}
                    <span>{t.card.gradeUnavailable}</span>
                  </>
                ) : null}
              </p>
            ) : null}

            {card.personal_case ? (
              <Callout icon={UserRound} tone="bg-review-soft text-review-ink">
                <p className="font-semibold">{t.card.personalCase}</p>
              </Callout>
            ) : null}

            {card.disagreement_noted ? (
              <Callout icon={Scale} tone="bg-review-soft text-review-ink">
                <p className="font-medium">{t.card.disagreement}</p>
              </Callout>
            ) : null}

            {state === 'not_found' ? (
              <div className="space-y-2">
                <p className="text-sm font-medium">{t.card.abstention}</p>
                {verse ? (
                  <p className="text-sm">
                    <span lang="ar" dir="rtl" className="quran-text text-lg">
                      ﴿{verse.text}﴾
                    </span>{' '}
                    <a
                      href={safeHref(verse.url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="whitespace-nowrap text-xs font-medium text-primary underline underline-offset-4"
                    >
                      {lang === 'ar' ? verse.ref : verse.ref_en || verse.ref}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {showReferral ? (
                <Button type="button" size="touch" onClick={onReferral}>
                  <GraduationCap aria-hidden="true" />
                  {t.card.referral}
                </Button>
              ) : null}
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="touch"
                  aria-controls={detailsId}
                  className="-ms-2 px-2 font-semibold text-primary hover:bg-primary/10 hover:text-primary"
                >
                  {open ? t.card.hideDetails : t.card.showDetails}
                  <ChevronDown
                    aria-hidden="true"
                    className={cn('transition-transform duration-200', open && 'rotate-180')}
                  />
                </Button>
              </CollapsibleTrigger>
            </div>
          </div>
        </div>

        <CollapsibleContent
          id={detailsId}
          className="overflow-hidden data-closed:animate-collapsible-up data-open:animate-collapsible-down"
        >
          <div className="space-y-4 border-t border-foreground/10 p-4">
            {note ? (
              <Callout icon={Info} tone={cn(style.soft, style.ink, risky && 'bg-background/70')}>
                <p className="font-medium">{note}</p>
              </Callout>
            ) : null}

            {showDiff && card.diff ? (
              <section className="space-y-2">
                <SectionTitle>{t.diff.title}</SectionTitle>
                <DiffView diff={card.diff} quranSource={card.source?.kind === 'quran'} />
              </section>
            ) : card.source && card.match_kind === 'exact' ? (
              <ExactMatch />
            ) : null}

            {card.source ? <SourceBlock source={card.source} diff={card.diff} title={t.card.sourceText} /> : null}

            <Grades grades={card.grades} unavailable={card.grade_unavailable} />

            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-muted/60 p-3 sm:grid-cols-3">
              <Field label={t.card.level}>
                <span className="tabular">{card.content_level}</span> · {t.levels[card.content_level]}
              </Field>
              <Field label={t.card.certainty}>{t.certainty[card.certainty]}</Field>
              <Field label={t.card.action}>{t.actions[card.action]}</Field>
              {card.timestamp ? (
                <Field label={t.card.position}>
                  {(() => {
                    const clock = formatClock(card.timestamp.start)
                    const href = timestampLink(source, card.timestamp.start)
                    return href ? (
                      <SourceLink href={href}>{t.card.occurredAt(clock)}</SourceLink>
                    ) : (
                      t.card.occurredAt(clock)
                    )
                  })()}
                </Field>
              ) : null}
              {card.attributed_to ? <Field label={t.card.attributedTo}>{card.attributed_to}</Field> : null}
            </dl>

            {card.ai_explanation ? (
              <section className="space-y-1 rounded-lg border border-dashed border-foreground/30 p-3">
                <h4 className="flex flex-wrap items-center gap-x-2 text-xs font-semibold">
                  <Sparkles aria-hidden="true" className="size-3.5" />
                  {t.card.aiExplanation}
                  <span className="font-normal text-muted-foreground">· {t.card.aiExplanationHint}</span>
                </h4>
                <p dir="auto" className="text-sm leading-relaxed">
                  {card.ai_explanation}
                </p>
              </section>
            ) : null}

            {card.warnings.length > 0 ? (
              <Callout icon={TriangleAlert} tone="bg-review-soft text-review-ink">
                <p className="font-semibold">{t.card.warnings}</p>
                <ul className="list-inside list-disc">
                  {card.warnings.map((warning, i) => (
                    <li key={i} dir="auto">
                      {warning}
                    </li>
                  ))}
                </ul>
              </Callout>
            ) : null}

            <Accordion type="multiple" className="rounded-lg border px-3">
              {card.source?.explanation ? (
                <AccordionItem value="explanation">
                  <AccordionTrigger>
                    <span>
                      {t.card.explanation}
                      <span className="ms-2 text-xs font-normal text-muted-foreground">
                        {t.card.explanationHint}
                      </span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent>
                    <LongText text={card.source.explanation} className="text-sm leading-loose" />
                  </AccordionContent>
                </AccordionItem>
              ) : null}
              {card.other_sources.length > 0 ? (
                <AccordionItem value="other">
                  <AccordionTrigger>{t.card.otherSources(card.other_sources.length)}</AccordionTrigger>
                  <AccordionContent className="space-y-4">
                    {card.other_sources.map((other, i) => (
                      <SourceBlock key={i} source={other} diff={null} title={other.ref} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              ) : null}
              <AccordionItem value="technical">
                <AccordionTrigger>{t.card.technical}</AccordionTrigger>
                <AccordionContent>
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
                    <Field label={t.card.rule}>
                      <code dir="ltr" className="font-mono text-xs">
                        {card.rule_id}
                      </code>
                    </Field>
                    <Field label={t.card.matchKind}>{t.matchKinds[card.match_kind]}</Field>
                    {card.similarity != null ? (
                      <Field label={t.card.similarity}>
                        <span className="tabular">{formatPercent(card.similarity)}</span>
                      </Field>
                    ) : null}
                    {override ? (
                      <Field label={t.reviewer.title}>
                        <span className="tabular">{formatDateTime(override.at, lang)}</span>
                      </Field>
                    ) : null}
                  </dl>
                </AccordionContent>
              </AccordionItem>
            </Accordion>

            {reviewerMode ? (
              <ReviewerPanel
                key={override?.at ?? 'none'}
                card={card}
                override={override}
                onSave={onSaveOverride}
                onRemove={() => onRemoveOverride(card.id)}
              />
            ) : null}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Surface>
  )
})

/** A claim that was announced but not yet checked: its text is known, its verdict is not. */
export function PendingCard({ claim }: { claim: ClaimStub }) {
  const { t } = useI18n()
  return (
    <Surface
      role="article"
      id={`card-${claim.id}`}
      aria-busy="true"
      aria-label={`${t.card.claimN(claim.index)}: ${t.card.pending}`}
      className="scroll-mt-24 gap-3 rounded-xl border-s-[6px] border-s-border p-4"
    >
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-36 rounded-full" />
        <TypeLabel type={claim.claim_type} />
        {claim.timestamp ? (
          <span className="tabular ms-auto text-xs text-muted-foreground" dir="ltr">
            {formatClock(claim.timestamp.start)}
          </span>
        ) : null}
      </div>
      <p lang="ar" dir="rtl" className="line-clamp-2 text-base font-semibold leading-loose text-foreground/80">
        {claim.text_as_quoted}
      </p>
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/5" />
        <Skeleton className="h-4 w-2/5" />
      </div>
      <p className="sr-only">{t.card.pending}</p>
    </Surface>
  )
}

/** Before any claim is announced: three empty shapes, so the page does not sit blank. */
export function BlankCard() {
  return (
    <Surface aria-hidden="true" className="gap-3 rounded-xl border-s-[6px] border-s-border p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-36 rounded-full" />
        <Skeleton className="h-4 w-12" />
      </div>
      <Skeleton className="h-5 w-4/5" />
      <Skeleton className="h-4 w-3/5" />
    </Surface>
  )
}
