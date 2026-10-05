import { ChevronDown, GraduationCap, LocateFixed, Share2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

import { CopySourceButton } from '@/components/report/copy-source-button'
import { DiffView, MarkedSource } from '@/components/report/diff-view'
import { ExplainPanel } from '@/components/report/explain-panel'
import { ReferralLinks } from '@/components/report/referral-links'
import { SourceLink } from '@/components/report/source-link'
import { StateGlyph } from '@/components/state-glyph'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { diffCoversSource, hasDifferences, hasUnquoted, sourceWindow } from '@/lib/diff'
import { formatClock, formatPercent, safeHref } from '@/lib/format'
import { distinctGradings } from '@/lib/grades'
import { useI18n } from '@/lib/i18n'
import { isNearbyOnly } from '@/lib/reference-line'
import type {
  Alternative,
  Card,
  EvidenceState,
  Features,
  Grade,
  Meta,
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
          <span className="font-semibold text-green">{title}</span>
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
    <p className="flex items-start gap-2 text-sm font-semibold text-ink">
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
function SourceWords({
  source,
  marked,
  state,
  title,
}: {
  source: SourceRef
  marked: Card['diff']
  state: EvidenceState
  /** Said above the words when they are not a quotation's source but the evidence pointed at. */
  title?: string
}) {
  const { t } = useI18n()
  const [whole, setWhole] = useState(false)
  const voice = source.kind === 'quran' ? 'quran-text' : 'naskh-quote'
  // The whole source, with only the compared words marked (the team: not a window that starts in
  // the middle of a sentence). A long chain before them is folded until asked for.
  const around = marked ? sourceWindow(marked, source.text) : null
  const fold = !!around && !whole && around.before.length > 260
  return (
    <figure aria-label={title ?? t.notes.sourceWords}>
      {title ? <figcaption className="pb-1 text-sm text-quiet">{title}</figcaption> : null}
      <div className="border-y py-2">
      {marked && around ? (
        <>
          <blockquote lang="ar" dir="rtl" className={voice}>
            {fold ? <span className="text-quiet">… {around.before.slice(-140)} </span> : around.before ? <span className="text-quiet">{around.before} </span> : null}
            <MarkedSource diff={marked} state={state} />
            {around.after ? <span className="text-quiet">{around.after}</span> : null}
          </blockquote>
          {fold ? (
            <Button type="button" variant="link" onClick={() => setWhole(true)}>
              {t.card.showWhole}
            </Button>
          ) : null}
        </>
      ) : marked ? (
        <blockquote lang="ar" dir="rtl" className={voice}>
          <MarkedSource diff={marked} state={state} />
        </blockquote>
      ) : (
        <blockquote>
          <LongText text={source.text} className={voice} />
        </blockquote>
      )}
      </div>
    </figure>
  )
}

/** The takhrij line: the reference as a phrase, where it was read, and the takhrij verbatim. */
function Takhrij({ source }: { source: SourceRef }) {
  const { t } = useI18n()
  return (
    <div className="space-y-1">
      <p className="text-sm">
        <span className="font-semibold text-ink">{source.ref}</span>
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
      {source.tafsir ? (
        // The commentator's words, set apart from the verse: their own heading, the tool's face (not
        // the Mushaf's), a rule beside them, and their source — as the challenge's package asks.
        <section data-testid="tafsir" className="mt-3 space-y-1 border-s-2 border-gold/60 ps-3">
          <h5 className="text-sm font-semibold text-ink">{t.card.tafsir}</h5>
          <p className="text-xs text-quiet">{t.card.tafsirHint}</p>
          <LongText text={source.tafsir.text} className="text-base text-ink" />
          <p className="text-sm">
            <SourceLink href={source.tafsir.source_url}>{source.tafsir.source_name}</SourceLink>
          </p>
        </section>
      ) : null}
    </div>
  )
}

/** One grading as its source words it, then who gave it, where, and the link to it. */
function GradeItem({ grade }: { grade: Grade }) {
  const { t } = useI18n()
  return (
    <li>
      <p lang="ar" dir="rtl" className="font-naskh text-lg whitespace-pre-line">
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
  )
}

/**
 * Hadith gradings exactly as the sources word them. One grading is shown as it is. Several are
 * led by one line — every distinct wording, in the order the sources give them, then their count
 * — which opens the full list: each grading with its scholar, book and link. No grading is
 * singled out and none is hidden; when there is none the note says so.
 */
function Grades({ grades, unavailable }: { grades: Grade[]; unavailable: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (grades.length === 0 && !unavailable) return null
  const wordings = distinctGradings(grades)
  return (
    <div className="space-y-1">
      <p className="text-sm text-quiet">
        {t.card.grades}
        {grades.length > 0 ? ` (${t.card.gradeVerbatim})` : null}
      </p>
      {grades.length === 0 ? (
        <p className="text-sm font-semibold text-ink">{t.card.gradeUnavailable}</p>
      ) : grades.length === 1 ? (
        <ul>
          <GradeItem grade={grades[0]} />
        </ul>
      ) : (
        <Collapsible open={open} onOpenChange={setOpen} data-testid="grades">
          <CollapsibleTrigger className="flex min-h-10 w-full items-start gap-2 rounded-sheet text-start">
            <span className="min-w-0 flex-1">
              <span lang="ar" dir="rtl" className="font-naskh text-lg">
                {wordings.join('، ')}
              </span>
              <span className="text-sm text-quiet"> — {t.card.gradesCount(grades.length)}</span>
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('mt-2 size-4 shrink-0 text-quiet transition-transform duration-150', open && 'rotate-180')}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-2 pt-1">
            <p className="text-sm text-ink">{t.card.gradesMany}</p>
            <ul className="space-y-2">
              {grades.map((grade, i) => (
                <GradeItem key={i} grade={grade} />
              ))}
            </ul>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

/** A narration cut to three lines until asked for in full. Whether it is cut is measured. */
function ClampedText({ text }: { text: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const [cut, setCut] = useState(false)
  const words = useRef<HTMLParagraphElement | null>(null)
  useLayoutEffect(() => {
    const element = words.current
    if (element && !open && element.scrollHeight > element.clientHeight + 1) {
      setCut(true)
    }
  }, [text, open])
  return (
    <>
      <p ref={words} lang="ar" dir="rtl" className={cn('naskh-quote whitespace-pre-line', !open && 'line-clamp-3')}>
        {text}
      </p>
      {cut ? (
        <Button type="button" variant="link" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? t.card.showLess : t.card.showMore}
        </Button>
      ) : null}
    </>
  )
}

/**
 * F2 «الثابت في الباب»: accepted narrations on the same subject, retrieved from the source, beside
 * a hadith that has no reference or a weak or rejected one. They are not a corrected version of
 * the text in circulation, and the section says so. Each comes as its source words it, with its
 * reference, its grading and a way to copy it.
 */
function Alternatives({ items }: { items: Alternative[] }) {
  const { t } = useI18n()
  return (
    <section data-testid="alternatives" className="space-y-3 border-t pt-3">
      <div>
        <h4 className="text-base font-semibold text-ink">{t.alternatives.title}</h4>
        <p className="text-sm text-quiet">{t.alternatives.hint}</p>
      </div>
      <ul className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="space-y-1">
            <ClampedText text={item.text} />
            <p className="text-sm">
              <SourceLink href={item.source_url}>{item.ref}</SourceLink>
            </p>
            <p className="text-sm text-quiet">
              <span lang="ar" dir="rtl" className="font-naskh text-lg text-ink">
                {item.grade_text}
              </span>
              {' — '}
              <SourceLink href={item.grade_source_url}>{item.grade_source_name}</SourceLink>
            </p>
            <CopySourceButton
              quiet
              kind="hadith"
              text={`${item.text}\n${item.ref} — ${item.grade_text} (${item.grade_source_name})\n${item.source_url}`}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Another source of the same text: its words, then its takhrij. */
function OtherSource({ source, state }: { source: SourceRef; state: EvidenceState }) {
  return (
    <div className="space-y-2">
      <SourceWords source={source} marked={null} state={state} />
      <Takhrij source={source} />
    </div>
  )
}

/** Whether a text already says a sentence (closing marks and spacing aside). */
const says = (text: string, sentence: string) => {
  const plain = (value: string) => value.replace(/\s+/g, ' ').replace(/[.،؛:!؟?]+/gu, '').trim()
  return plain(text).includes(plain(sentence))
}

// ── The body of a note ────────────────────────────────────────────────────────────────────────

export interface NoteBodyProps {
  card: Card
  source: SourceInfo | null
  meta: Meta | null
  features: Features
  /** Per-stage timing from the summary, once it has arrived (shown under "why this verdict"). */
  stageSeconds: StageSeconds | undefined
  /** Print the words as quoted first. */
  showQuoted: boolean
  /** The verification trail, shown after the texts and what the tool says about them. */
  trail?: ReactNode
  /** «إحالة إلى أهل العلم»: the approved sites, searched for this note's topic words. */
  onReferral: (cardId: string) => void
  onShare: (cardId: string) => void
  /** "Show in the text", where the note is not already beside its words. */
  onLocate?: (cardId: string) => void
  /** «أبلغ عن خطأ»: the reader's own message about this verdict. */
  onReportError: (cardId: string) => void
}

/**
 * What an open note says, in the order a muhaddith's footnote does: the source's words, the
 * takhrij and the grading, the collation, what to do about it; then the actions and the referral.
 * The same body fills the margin note on a wide screen and the bottom sheet on a phone.
 */
export default function NoteBody({
  card,
  source,
  meta,
  features,
  stageSeconds,
  showQuoted,
  trail,
  onReferral,
  onShare,
  onLocate,
  onReportError,
}: NoteBodyProps) {
  const { t, lang, pick } = useI18n()
  const state = card.state
  const note = pick(card.note_ar, card.note_en)
  // The evidence a ruling points at is shown as a source, but nothing was quoted from it: no collation.
  const referenced = card.match_kind === 'referenced'
  const showDiff = !referenced && hasDifferences(card.diff)
  // When the comparison already prints the source text word for word, do not print it twice.
  const markedSource =
    showDiff && card.source && (diffCoversSource(card.diff!, card.source.text) || sourceWindow(card.diff!, card.source.text)) ? card.diff : null
  // A nearby text is not the quotation's source: it has a section of its own, after the verdict.
  const nearby = isNearbyOnly(card)
  const verse = meta?.abstention_verse ?? null
  const showReferral = card.referral || card.personal_case || card.disagreement_noted || state === 'not_found'
  const copyable = features.copy && card.copy_text ? card.copy_text : null
  // F5 replaces the old "technical details" item; that item stays as the fallback.
  const explain = features.explain && card.explain ? card.explain : null
  const clock = card.timestamp ? formatClock(card.timestamp.start) : null
  const timeHref = card.timestamp ? timestampLink(source, card.timestamp.start) : null
  const reportError = (
    <Button
      type="button"
      variant="link"
      data-testid="report-error"
      aria-haspopup="dialog"
      className="text-sm text-quiet decoration-rule-strong"
      onClick={() => onReportError(card.id)}
    >
      {t.feedback.action}
    </Button>
  )

  // A question put to the tool is referred, never answered: the note's own sentence, then the
  // search links, right there. Nothing is collated, graded, offered beside it or shared.
  if (card.is_question) {
    return (
      <div data-testid="question-note" className="space-y-4">
        {showQuoted ? (
          <div>
            <p className="text-sm text-quiet">{t.notes.quotedWords}</p>
            <p lang="ar" dir="rtl" className="page-text">
              {card.text_as_quoted}
            </p>
          </div>
        ) : null}
        {note ? <p className="text-base text-ink">{note}</p> : null}
        <ReferralLinks meta={meta} query={card.referral_query} matches={card.referral_matches} />
        {clock ? (
          <p className="text-sm text-quiet">
            {timeHref ? <SourceLink href={timeHref}>{t.card.occurredAt(clock)}</SourceLink> : t.card.occurredAt(clock)}
          </p>
        ) : null}
        {explain ? (
          <div className="border-b">
            <ExplainPanel card={card} explain={explain} stageSeconds={stageSeconds} />
          </div>
        ) : null}
        {reportError}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {showQuoted ? (
        <div>
          <p className="text-sm text-quiet">{t.notes.quotedWords}</p>
          <p lang="ar" dir="rtl" className="page-text">
            {card.text_as_quoted}
          </p>
        </div>
      ) : null}

      {/* Said once. The backend's note is the sentence of a personal case and of a disputed matter;
          the notice stands in only when a note does not already say it. */}
      {card.personal_case && !says(note, t.card.personalCase) ? (
        <Remark state="needs_review">{t.card.personalCase}</Remark>
      ) : null}
      {card.disagreement_noted && !note ? <Remark state="needs_review">{t.card.disagreement}</Remark> : null}

      {card.source && !nearby ? (
        <>
          <SourceWords source={card.source} marked={markedSource} state={state} />
          {markedSource && hasUnquoted(markedSource) ? (
            <p className="text-sm text-quiet">{t.diff.partial}</p>
          ) : null}
          <Takhrij source={card.source} />
        </>
      ) : null}

      {nearby ? null : <Grades grades={card.grades} unavailable={card.grade_unavailable} />}

      {state === 'not_found' ? (
        <div className="space-y-1">
          <p className="text-sm font-semibold text-ink">{t.card.abstention}</p>
          {verse ? (
            <p>
              <span lang="ar" dir="rtl" className="quran-text">
                ﴿{verse.text}﴾
              </span>{' '}
              <a
                href={safeHref(verse.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm whitespace-nowrap text-green underline decoration-green/40 underline-offset-4 hover:decoration-green"
              >
                {lang === 'ar' ? verse.ref : verse.ref_en || verse.ref}
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      {showDiff && card.diff && !nearby ? (
        <section className="space-y-1">
          <h4 className="text-sm text-quiet">
            {t.diff.title}
            {card.match_kind !== 'none' ? ` (${t.matchKinds[card.match_kind]})` : null}
          </h4>
          <DiffView
            diff={card.diff}
            state={state}
            quranSource={card.source?.kind === 'quran'}
            sourceShownAbove={!!markedSource}
          />
        </section>
      ) : nearby ? null : card.source && card.match_kind === 'exact' ? (
        <p className="text-sm text-supported-ink">{t.diff.exact}</p>
      ) : card.source && card.match_kind !== 'none' && !referenced ? (
        <p className="text-sm text-quiet">{t.matchKinds[card.match_kind]}</p>
      ) : null}

      {/* The tool's own words: the rule's note, then what to do, said as a sentence. */}
      <div className="space-y-1 text-base">
        {note ? <p className="text-ink">{note}</p> : null}
        <p className="font-semibold text-ink">{t.actionSentences[card.action]}</p>
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

      {nearby && card.source ? (
        <section data-testid="nearby-text" className="space-y-3 rounded-control border border-dashed border-rule-strong p-3">
          <div>
            <h4 className="text-sm font-semibold text-ink">{referenced ? t.card.referencedSource : t.card.nearbyTitle}</h4>
            <p className="text-sm text-quiet">{t.card.nearbyHint}</p>
          </div>
          <SourceWords source={card.source} marked={markedSource} state={state} />
          <Takhrij source={card.source} />
          <Grades grades={card.grades} unavailable={card.grade_unavailable} />
          {showDiff && card.diff ? (
            <section className="space-y-1">
              <h4 className="text-sm text-quiet">
                {t.diff.title} ({t.matchKinds[card.match_kind]})
              </h4>
              <DiffView diff={card.diff} state={state} quranSource={card.source.kind === 'quran'} sourceShownAbove={!!markedSource} />
            </section>
          ) : null}
        </section>
      ) : null}

      {features.alternatives && card.alternatives && card.alternatives.length > 0 ? (
        <Alternatives items={card.alternatives} />
      ) : null}

      {card.ai_explanation ? (
        <section className="border-t border-dashed border-rule-strong pt-3 text-sm">
          {/* Words only: the label says what this is, and no stock "AI" mark stands in for it. */}
          <h4 className="font-semibold text-ink">{t.card.aiExplanation}</h4>
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

      {trail}

      <div className="flex flex-wrap items-center gap-2">
        {showReferral ? (
          <Button type="button" size="touch" onClick={() => onReferral(card.id)}>
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
          <ExplainPanel card={card} explain={explain} stageSeconds={stageSeconds} />
        ) : null}
        {card.source?.explanation ? (
          <Disclosure title={t.card.explanation} hint={t.card.explanationHint}>
            <LongText text={card.source.explanation} className="font-naskh text-lg" />
          </Disclosure>
        ) : null}
        {card.other_sources.length > 0 ? (
          <Disclosure title={t.card.otherSources(card.other_sources.length)}>
            {card.other_sources.map((other, i) => (
              <OtherSource key={i} source={other} state={state} />
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
            </dl>
          </Disclosure>
        )}
      </div>

      {reportError}
    </div>
  )
}
