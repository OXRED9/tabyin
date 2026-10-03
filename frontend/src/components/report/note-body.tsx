import { ChevronDown, GraduationCap, LocateFixed, Share2, Sparkles, UserRoundCheck } from 'lucide-react'
import { useState } from 'react'
import type { ReactNode } from 'react'

import { CopySourceButton } from '@/components/report/copy-source-button'
import { DiffView, MarkedSource } from '@/components/report/diff-view'
import { ExplainPanel } from '@/components/report/explain-panel'
import { ReviewerPanel } from '@/components/report/reviewer-panel'
import { SourceLink } from '@/components/report/source-link'
import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { diffCoversSource, hasDifferences } from '@/lib/diff'
import { formatClock, formatDateTime, formatPercent, safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type {
  Card,
  EvidenceState,
  Features,
  Grade,
  Meta,
  ReviewerOverride,
  SourceInfo,
  SourceRef,
  StageSeconds,
} from '@/lib/types'
import { timestampLink } from '@/lib/video'
import { cn } from '@/lib/utils'

// ── Small building blocks ─────────────────────────────────────────────────────────────────────

/** A long source text is cut to a few lines until asked for in full. */
function LongText({ text, className }: { text: string; className: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const long = text.length > 420
  return (
    <>
      <p lang="ar" dir="rtl" className={cn('whitespace-pre-line', className, long && !open && 'line-clamp-4')}>
        {text}
      </p>
      {long ? (
        <Button type="button" variant="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t.card.showLess : t.card.showMore}
        </Button>
      ) : null}
    </>
  )
}

/** Something that unfolds in place, under a hairline. */
function Disclosure({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="border-t">
      <CollapsibleTrigger className="flex min-h-10 w-full items-center gap-2 py-2 text-start text-sm">
        <span className="min-w-0 flex-1">
          <span className="font-medium text-green">{title}</span>
          {hint ? <span className="block text-quiet">{hint}</span> : null}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 text-quiet transition-transform duration-150', open && 'rotate-180')}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pb-3">{children}</CollapsibleContent>
    </Collapsible>
  )
}

/** The tool's own remark about a claim: its glyph, then a sentence. */
function Remark({ state, children }: { state: EvidenceState; children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm font-medium text-ink">
      <StateGlyph state={state} className="mt-0.5 size-[18px]" />
      <span>{children}</span>
    </p>
  )
}

/**
 * The source's own words, between two hairlines: Amiri Quran for a verse, Amiri for a narration.
 * When the collation prints the source word for word, the marks are put on these words instead
 * of printing the text a second time.
 */
function SourceWords({ source, marked }: { source: SourceRef; marked: Card['diff'] }) {
  const { t } = useI18n()
  const voice = source.kind === 'quran' ? 'quran-text' : 'naskh-quote'
  return (
    <figure aria-label={t.notes.sourceWords} className="border-y py-2">
      {marked ? (
        <blockquote lang="ar" dir="rtl" className={voice}>
          <MarkedSource diff={marked} />
        </blockquote>
      ) : (
        <blockquote>
          <LongText text={source.text} className={voice} />
        </blockquote>
      )}
    </figure>
  )
}

/** The takhrij line: the reference as a phrase, where it was read, and the takhrij verbatim. */
function Takhrij({ source }: { source: SourceRef }) {
  const { t } = useI18n()
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="font-medium text-ink">{source.ref}</span>
        {' — '}
        <SourceLink href={source.url}>{source.source_name}</SourceLink>
      </p>
      {source.attribution && source.attribution !== source.ref ? (
        <p lang="ar" dir="rtl" className="font-naskh text-lg whitespace-pre-line">
          {source.attribution}
        </p>
      ) : null}
      {source.translation ? (
        <div className="pt-1">
          <p className="text-sm text-quiet">{t.card.translation}</p>
          <p lang={source.translation.lang} dir="auto" className="text-base">
            {source.translation.text}
          </p>
          <p className="text-sm">
            <SourceLink href={source.translation.source_url}>{source.translation.source_name}</SourceLink>
          </p>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Hadith gradings exactly as the sources word them. When there are several they are all listed,
 * in the order received, with no preference; when there is none the note says so.
 */
function Grades({ grades, unavailable }: { grades: Grade[]; unavailable: boolean }) {
  const { t } = useI18n()
  if (grades.length === 0 && !unavailable) return null
  return (
    <div className="space-y-1">
      <p className="text-sm text-quiet">
        {t.card.grades}
        {grades.length > 0 ? ` (${t.card.gradeVerbatim})` : null}
      </p>
      {grades.length === 0 ? (
        <p className="text-sm font-medium text-ink">{t.card.gradeUnavailable}</p>
      ) : (
        <>
          {grades.length > 1 ? <p className="text-sm text-ink">{t.card.gradesMany}</p> : null}
          <ul className="space-y-2">
            {grades.map((grade, i) => (
              <li key={i}>
                <p lang="ar" dir="rtl" className="font-naskh text-lg font-bold whitespace-pre-line">
                  {grade.text}
                </p>
                <p className="text-sm text-quiet">
                  {grade.scholar || grade.book || grade.narrator
                    ? `${t.card.gradeBy(
                        [
                          grade.scholar ? `${t.card.scholar}: ${grade.scholar}` : '',
                          grade.book ? `${t.card.book}: ${grade.book}` : '',
                          grade.narrator ? `${t.card.narrator}: ${grade.narrator}` : '',
                        ].filter(Boolean),
                      )} — `
                    : null}
                  <SourceLink href={grade.source_url}>{grade.source_name}</SourceLink>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** Another source of the same text: its words, then its takhrij. */
function OtherSource({ source }: { source: SourceRef }) {
  return (
    <div className="space-y-2">
      <SourceWords source={source} marked={null} />
      <Takhrij source={source} />
    </div>
  )
}

// ── The body of a note ────────────────────────────────────────────────────────────────────────

export interface NoteBodyProps {
  card: Card
  override: ReviewerOverride | undefined
  source: SourceInfo | null
  meta: Meta | null
  features: Features
  /** Per-stage timing from the summary, once it has arrived (shown under "why this verdict"). */
  stageSeconds: StageSeconds | undefined
  reviewerMode: boolean
  /** Print the words as quoted first: on a phone, and for a claim with no place in the text. */
  showQuoted: boolean
  onReferral: () => void
  onShare: (cardId: string) => void
  /** "Show in the text", where the note is not already beside its words. */
  onLocate?: (cardId: string) => void
  onSaveOverride: (override: ReviewerOverride) => void
  onRemoveOverride: (cardId: string) => void
}

/**
 * What an open note says, in the order a muhaddith's footnote does: the source's words, the
 * takhrij and the grading, the collation, what to do about it; then the actions, the referral
 * and, in reviewer mode, the reviewer's line. The same body fills the margin note on a wide
 * screen and the bottom sheet on a phone.
 */
export function NoteBody({
  card,
  override,
  source,
  meta,
  features,
  stageSeconds,
  reviewerMode,
  showQuoted,
  onReferral,
  onShare,
  onLocate,
  onSaveOverride,
  onRemoveOverride,
}: NoteBodyProps) {
  const { t, lang, pick } = useI18n()
  const state = override?.state ?? card.state
  const stateChanged = !!override && override.state !== override.original_state
  const note = pick(card.note_ar, card.note_en)
  const showDiff = hasDifferences(card.diff)
  // When the comparison already prints the source text word for word, do not print it twice.
  const markedSource = showDiff && card.source && diffCoversSource(card.diff!, card.source.text) ? card.diff : null
  const verse = meta?.abstention_verse ?? null
  const showReferral = card.referral || card.personal_case || card.disagreement_noted || state === 'not_found'
  const copyable = features.copy && card.copy_text ? card.copy_text : null
  // F5 replaces the old "technical details" item; that item stays as the fallback.
  const explain = features.explain && card.explain ? card.explain : null
  const clock = card.timestamp ? formatClock(card.timestamp.start) : null
  const timeHref = card.timestamp ? timestampLink(source, card.timestamp.start) : null

  return (
    <div className="space-y-4">
      {override ? (
        <div className="text-sm">
          <p className="flex items-start gap-2 font-medium text-ink">
            <UserRoundCheck aria-hidden="true" className="mt-1 size-4 shrink-0 text-quiet" />
            {stateChanged ? t.reviewer.modified : t.reviewer.noted}
          </p>
          <p className="text-quiet">
            {t.card.gradeBy(
              [
                stateChanged ? `${t.reviewer.original}: ${t.states[override.original_state]}` : '',
                t.reviewer.by(override.reviewer || t.reviewer.anonymous),
              ].filter(Boolean),
            )}
          </p>
          {override.note ? <p className="text-ink">{override.note}</p> : null}
        </div>
      ) : null}

      {showQuoted ? (
        <div>
          <p className="text-sm text-quiet">{t.notes.quotedWords}</p>
          <p lang="ar" dir="rtl" className="page-text">
            {card.text_as_quoted}
          </p>
        </div>
      ) : null}

      {card.personal_case ? <Remark state="needs_review">{t.card.personalCase}</Remark> : null}
      {card.disagreement_noted ? <Remark state="needs_review">{t.card.disagreement}</Remark> : null}

      {card.source ? (
        <>
          <SourceWords source={card.source} marked={markedSource} />
          <Takhrij source={card.source} />
        </>
      ) : null}

      <Grades grades={card.grades} unavailable={card.grade_unavailable} />

      {state === 'not_found' ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">{t.card.abstention}</p>
          {verse ? (
            <p>
              <span lang="ar" dir="rtl" className="quran-text">
                ﴿{verse.text}﴾
              </span>{' '}
              <a
                href={safeHref(verse.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-medium whitespace-nowrap text-green underline decoration-green/40 underline-offset-4 hover:decoration-green"
              >
                {lang === 'ar' ? verse.ref : verse.ref_en || verse.ref}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {showDiff && card.diff ? (
        <section className="space-y-1">
          <h4 className="text-sm text-quiet">
            {t.diff.title}
            {card.match_kind !== 'none' ? ` (${t.matchKinds[card.match_kind]})` : null}
          </h4>
          <DiffView diff={card.diff} quranSource={card.source?.kind === 'quran'} sourceShownAbove={!!markedSource} />
        </section>
      ) : card.source && card.match_kind === 'exact' ? (
        <p className="text-sm font-medium text-supported-ink">{t.diff.exact}</p>
      ) : card.source && card.match_kind !== 'none' ? (
        <p className="text-sm text-quiet">{t.matchKinds[card.match_kind]}</p>
      ) : null}

      {/* The tool's own words: the rule's note, then what to do, said as a sentence. */}
      <div className="space-y-1 text-base">
        {note ? <p className="text-ink">{note}</p> : null}
        <p className="font-medium text-ink">{t.actionSentences[card.action]}</p>
        <p className="text-sm text-quiet">
          {t.card.levelSentence(card.content_level, t.levels[card.content_level], t.certainty[card.certainty])}
          {card.attributed_to ? ` ${t.card.attributedSentence(card.attributed_to)}` : null}
        </p>
        {clock ? (
          <p className="text-sm text-quiet">
            {timeHref ? (
              <SourceLink href={timeHref}>{t.card.occurredAt(clock)}</SourceLink>
            ) : (
              t.card.occurredAt(clock)
            )}
          </p>
        ) : null}
      </div>

      {card.ai_explanation ? (
        <section className="border-t border-dashed border-rule-strong pt-3 text-sm">
          <h4 className="flex items-center gap-2 font-medium text-ink">
            <Sparkles aria-hidden="true" className="size-4 shrink-0 text-quiet" />
            {t.card.aiExplanation}
          </h4>
          <p className="text-quiet">{t.card.aiExplanationHint}</p>
          <p dir="auto" className="mt-1 text-base text-ink">
            {card.ai_explanation}
          </p>
        </section>
      ) : null}

      {card.warnings.length > 0 ? (
        <div className="text-sm">
          <Remark state="needs_review">{t.card.warnings}</Remark>
          <ul className="list-inside list-disc ps-7 text-ink">
            {card.warnings.map((warning, i) => (
              <li key={i} dir="auto">
                {warning}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {showReferral ? (
          <Button type="button" size="touch" onClick={onReferral}>
            <GraduationCap aria-hidden="true" />
            {t.card.referral}
          </Button>
        ) : null}
        {copyable ? <CopySourceButton text={copyable} kind={card.source?.kind ?? null} /> : null}
        {features.share_card ? (
          <Button type="button" variant="outline" size="touch" data-testid="share-card" onClick={() => onShare(card.id)}>
            <Share2 aria-hidden="true" />
            {t.share.short}
          </Button>
        ) : null}
        {onLocate && card.span ? (
          <Button type="button" variant="ghost" size="touch" onClick={() => onLocate(card.id)}>
            <LocateFixed aria-hidden="true" />
            {t.card.locate}
          </Button>
        ) : null}
      </div>

      <div className="border-b">
        {explain ? (
          <ExplainPanel card={card} explain={explain} stageSeconds={stageSeconds} override={override} />
        ) : null}
        {card.source?.explanation ? (
          <Disclosure title={t.card.explanation} hint={t.card.explanationHint}>
            <LongText text={card.source.explanation} className="font-naskh text-lg" />
          </Disclosure>
        ) : null}
        {card.other_sources.length > 0 ? (
          <Disclosure title={t.card.otherSources(card.other_sources.length)}>
            {card.other_sources.map((other, i) => (
              <OtherSource key={i} source={other} />
            ))}
          </Disclosure>
        ) : null}
        {explain ? null : (
          <Disclosure title={t.card.technical}>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div>
                <dt className="text-quiet">{t.card.rule}</dt>
                <dd dir="ltr" className="tabular text-start break-words">
                  {card.rule_id}
                </dd>
              </div>
              <div>
                <dt className="text-quiet">{t.card.matchKind}</dt>
                <dd>{t.matchKinds[card.match_kind]}</dd>
              </div>
              {card.similarity != null ? (
                <div>
                  <dt className="text-quiet">{t.card.similarity}</dt>
                  <dd className="tabular">{formatPercent(card.similarity)}</dd>
                </div>
              ) : null}
              {override ? (
                <div>
                  <dt className="text-quiet">{t.reviewer.title}</dt>
                  <dd className="tabular">{formatDateTime(override.at, lang)}</dd>
                </div>
              ) : null}
            </dl>
          </Disclosure>
        )}
      </div>

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
  )
}
