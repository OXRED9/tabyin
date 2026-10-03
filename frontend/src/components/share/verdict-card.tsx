import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'

import { StateGlyph } from '@/components/state-glyph'
import type { Dictionary } from '@/lib/dictionary'
import { diffCoversSource, hasDifferences } from '@/lib/diff'
import {
  CARD_HEIGHT,
  CARD_PALETTE,
  CARD_WIDTH,
  displayUrl,
  firstSentence,
  keepWords,
  qrPath,
  truncateClaim,
} from '@/lib/share-card'
import type { CardPalette as Palette, CardSize, CardTheme } from '@/lib/share-card'
import { ACTION_OF_STATE } from '@/lib/states'
import { summaryParts } from '@/lib/summary'
import type { Card, EvidenceState, UiLang, VerseRef } from '@/lib/types'

/*
 * The verdict card («بطاقة تثبّت»), v2 — docs/DESIGN.md §8. It is the one piece of Tabayyun that
 * travels without the app, so it answers, in this order, what someone who sees only the image
 * asks: what is this about (the words as they circulate), is it right (the state and one plain
 * sentence), what does the source say (its wording, its reference, the grading in the source's
 * word), what should I do with it (the suggested action), can I check (the address, its QR code,
 * the transparency line).
 *
 * It speaks the page's language: paper, hairlines, ink. No band, no pill, no shadow. The claim is
 * set as the passage is on the page (Naskh, the state's ink, an underline in the state's
 * colour); gold appears only in the verified ring.
 *
 * The template is a fixed 1080px-wide block styled with inline pixel values and its own copy of
 * the tokens, so the PNG looks the same whatever the page's theme, zoom or viewport is. The same
 * content, in the same order, is drawn on the server (`POST /api/share-card`) as the fallback.
 *
 * Never drawn: a date or time, a reviewer's name, a link to the clip, anything about the user.
 */

const UI_FONT: Record<UiLang, string> = {
  ar: '"IBM Plex Sans Arabic", "IBM Plex Sans", "Noto Sans Arabic", system-ui, sans-serif',
  en: '"IBM Plex Sans", "IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui, sans-serif',
}
const NASKH_FONT = '"Amiri", "Amiri Quran", "Scheherazade New", "Noto Naskh Arabic", "Traditional Arabic", serif'
const QURAN_FONT = '"Amiri Quran", "Amiri", "Scheherazade New", "Noto Naskh Arabic", "Traditional Arabic", serif'

/**
 * Font sizes are whole pixels. html-to-image redraws text at floor(size) − 0.1px, so a fractional
 * size would shrink by up to a pixel in the PNG and re-wrap differently from the preview.
 */
const whole = (size: number) => Math.round(size)

const clamp = (lines: number): CSSProperties => ({
  display: '-webkit-box',
  WebkitBoxOrient: 'vertical',
  WebkitLineClamp: lines,
  overflow: 'hidden',
})

/** The ring glyphs read the page's CSS variables: the card sets its own, for its own theme. */
const glyphColours = (palette: Palette) =>
  ({
    '--gold': palette.gold,
    '--supported': palette.states.supported.solid,
    '--noted': palette.states.supported_with_note.solid,
    '--review': palette.states.needs_review.solid,
    '--missing': palette.states.not_found.solid,
    '--contra': palette.states.contradicted.solid,
  }) as CSSProperties

function Glyph({ state, size }: { state: EvidenceState; size: number }) {
  return <StateGlyph state={state} style={{ width: size, height: size, flex: 'none' }} />
}

function Rule({ palette }: { palette: Palette }) {
  return <div style={{ flex: 'none', height: 2, background: palette.rule }} />
}

function Qr({ value, size, palette, tile }: { value: string; size: number; palette: Palette; tile: boolean }) {
  const code = useMemo(() => qrPath(value), [value])
  // Dark theme: the code sits on a white tile with a quiet zone, so any scanner reads it.
  const margin = tile ? 3 : 0
  const box = code.size + margin * 2
  return (
    <svg
      viewBox={`${-margin} ${-margin} ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={value}
      style={{ flex: 'none', background: '#ffffff' }}
    >
      <path d={code.path} fill={tile ? '#11221e' : palette.ink} />
    </svg>
  )
}

interface Shell {
  size: CardSize
  theme: CardTheme
  lang: UiLang
  t: Dictionary
  appUrl: string
  nodeRef?: Ref<HTMLDivElement>
}

/** The square card has less height for the same content: everything on it is set a step smaller. */
const scaleOf = (size: CardSize) => (size === 'square' ? 0.86 : 1)

/** The frame every card shares: paper, one hairline frame, the logotype, the body, the footer. */
function Frame({
  size,
  theme,
  lang,
  t,
  appUrl,
  nodeRef,
  label,
  children,
  bodyRef,
  alt,
  fit,
}: Shell & { label: string; children: ReactNode; bodyRef?: Ref<HTMLDivElement>; alt: string; fit?: string }) {
  const palette = CARD_PALETTE[theme]
  const k = scaleOf(size)
  const dir = lang === 'ar' ? 'rtl' : 'ltr'
  return (
    <div
      ref={nodeRef}
      role="img"
      aria-label={alt}
      lang={lang}
      dir={dir}
      data-card-size={size}
      data-card-theme={theme}
      data-fit={fit}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT[size],
        boxSizing: 'border-box',
        padding: 36,
        background: palette.paper,
        color: palette.ink,
        fontFamily: UI_FONT[lang],
        fontFeatureSettings: 'normal',
        fontWeight: 400,
        letterSpacing: 0,
        textAlign: 'start',
        ...glyphColours(palette),
      }}
    >
      <div
        style={{
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          border: `2px solid ${palette.rule}`,
          padding: `${whole(34 * k)}px ${whole(52 * k)}px ${whole(30 * k)}px`,
        }}
      >
        <div style={{ flex: 'none', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 24, paddingBottom: whole(16 * k) }}>
          <span style={{ fontFamily: NASKH_FONT, fontSize: whole(58 * k), lineHeight: 1.25 }}>{t.appName}</span>
          <span style={{ fontSize: whole(28 * k), lineHeight: 1.4, color: palette.quiet }}>{label}</span>
        </div>
        <Rule palette={palette} />

        <div
          ref={bodyRef}
          data-card-body=""
          style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', paddingTop: whole(24 * k) }}
        >
          {children}
        </div>

        <Rule palette={palette} />
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32, paddingTop: whole(22 * k) }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: whole(30 * k), fontWeight: 600, lineHeight: 1.5 }}>{t.share.footer}</div>
            <div
              dir="ltr"
              style={{
                fontSize: whole(30 * k),
                lineHeight: 1.5,
                color: palette.green,
                textAlign: lang === 'ar' ? 'right' : 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {displayUrl(appUrl)}
            </div>
          </div>
          <Qr value={appUrl} size={whole(150 * k)} palette={palette} tile={theme === 'dark'} />
        </div>
        <div style={{ flex: 'none', paddingTop: whole(14 * k), fontSize: whole(22 * k), lineHeight: 1.5, color: palette.quiet }}>
          {t.transparency}
        </div>
      </div>
    </div>
  )
}

// ── Fitting ───────────────────────────────────────────────────────────────────────────────────

/**
 * How far the card has had to give way. Type is reduced before anything is cut: the claim from 44
 * down to 34 and the source from 46 (a verse) or 40 down to 30, in steps of 2. Only then is text
 * cut, always at a word boundary and with «…»: the verdict to two lines, then the words of the
 * source around the quotation, then (a narration only) the end of the quoted part, then the claim.
 * A verse is never cut inside the quoted span: once the claim has given up its lines, the verse's
 * type goes below its range (30 down to 22) rather than its words, and if the span cannot be set
 * even so, the card gives the verse's reference alone and says where the verse is read whole
 * (docs/DECISIONS.md, 65).
 */
interface Fit {
  claim: number
  source: number
  verdictLines: 2 | 3
  /** The share of the source's words around the quotation that is kept. */
  around: number
  /** The share of the quoted span that is kept (a narration only). */
  span: number
  /** The share of the claim's words that is kept. */
  claimKept: number
  /** False only for a verse whose quoted span does not fit the card at all. */
  sourceShown: boolean
}

const FIRST_FIT = (verse: boolean): Fit => ({
  claim: 44,
  source: verse ? 46 : 40,
  verdictLines: 3,
  around: 1,
  span: 1,
  claimKept: 1,
  sourceShown: true,
})

/** What this card's source allows to be cut. */
interface Give {
  /** There are words of the source around the quotation. */
  around: boolean
  /** The quoted part itself may be cut at its end (a narration). */
  span: boolean
  /** The source is a verse: it is shown whole or by its reference alone. */
  verse: boolean
}

function tighten(fit: Fit, give: Give): Fit | null {
  if (fit.claim > 34 || fit.source > 30) {
    return { ...fit, claim: Math.max(34, fit.claim - 2), source: Math.max(30, fit.source - 2) }
  }
  if (fit.verdictLines === 3) return { ...fit, verdictLines: 2 }
  if (give.around && fit.around > 0) return { ...fit, around: fit.around > 0.1 ? fit.around * 0.75 : 0 }
  if (give.span && fit.span > 0.2) return { ...fit, span: fit.span * 0.85 }
  if (fit.claimKept > 0.35) return { ...fit, claimKept: fit.claimKept * 0.85 }
  if (give.verse && fit.sourceShown) {
    if (fit.source > 22) return { ...fit, source: fit.source - 2 }
    // The verse's place is free again: the claim is set anew before it gives way.
    return { ...fit, sourceShown: false, claimKept: 1 }
  }
  return null
}

/** The source's words as the card shows them: each with whether it differs from the claim. */
interface SourceWord {
  text: string
  differs: boolean
  /** Part of what the claim quoted (false for the words of the source around the quotation). */
  quoted: boolean
}

/** The source's words, and whether the source goes on before or after them. */
interface SourceText {
  words: SourceWord[]
  before: boolean
  after: boolean
}

const squash = (text: string) => text.replace(/\s+/g, ' ').trim()
/** A sentence without its closing mark, to tell whether two say the same thing. */
const plain = (text: string) => squash(text).replace(/[.؟?!،,؛;:]+$/u, '')

/**
 * What the card sets under «في المصدر». With no differences it is the source's text as it is.
 * With differences it is the source's side of the collation, differing words marked: the whole
 * text when the collation covers it, otherwise the part that was compared (a narration without
 * its chain, say), with «…» where the source goes on.
 */
function sourceText(source: Card['source'], diff: Card['diff']): SourceText {
  if (!source) return { words: [], before: false, after: false }
  const whole = squash(source.text)
  if (!hasDifferences(diff)) {
    return { words: whole.split(' ').map((text) => ({ text, differs: false, quoted: true })), before: false, after: false }
  }
  const words = diff.flatMap((op) =>
    op.source
      ? squash(op.source)
          .split(' ')
          .map((text) => ({ text, differs: op.op === 'replace', quoted: op.op !== 'insert' }))
      : [],
  )
  if (diffCoversSource(diff, source.text)) return { words, before: false, after: false }
  const part = words.map((word) => word.text).join(' ')
  const at = whole.indexOf(part)
  return { words, before: at > 0, after: at !== -1 && at + part.length < whole.length }
}

/** The first and last words of the quoted span (the whole text when nothing marks one). */
function quotedSpan(words: SourceWord[]): [number, number] {
  const first = words.findIndex((word) => word.quoted)
  if (first === -1) return [0, words.length - 1]
  let last = words.length - 1
  while (!words[last].quoted) last -= 1
  return [first, last]
}

/**
 * Cut the source to what the fit allows. The words around the quoted span go first, those
 * furthest from it before those next to it; a narration's quoted part is then cut at its end.
 * «…» stands on each side that was cut.
 */
function fitSource(text: SourceText, fit: Fit): SourceText {
  const { words } = text
  if (words.length === 0 || (fit.around >= 1 && fit.span >= 1)) return text
  const [first, last] = quotedSpan(words)
  const length = last - first + 1
  const kept = fit.span >= 1 ? length : Math.max(Math.min(6, length), Math.floor(length * fit.span))
  const start = first - Math.floor(first * fit.around)
  const end = kept < length ? first + kept : last + 1 + Math.floor((words.length - 1 - last) * fit.around)
  return { words: words.slice(start, end), before: text.before || start > 0, after: text.after || end < words.length }
}

// ── One claim's card ──────────────────────────────────────────────────────────────────────────

export interface ClaimCardImageProps extends Shell {
  card: Card
  /** A reviewer's state, drawn with the "human review" mark and no name. */
  overrideState: EvidenceState | null
  verse: VerseRef | null
}

export function ClaimCardImage({ card, overrideState, verse, ...shell }: ClaimCardImageProps) {
  const { size, theme, lang, t } = shell
  const palette = CARD_PALETTE[theme]
  const k = scaleOf(size)
  const state = overrideState ?? card.state
  const colours = palette.states[state]
  const align = lang === 'ar' ? 'right' : 'left'
  // A reviewer's state comes without the rule's sentence, which explains the engine's state and
  // could contradict the reviewer's, and with the action that belongs to it. A reviewer's «لم
  // يُعثر» also hides the source the engine had matched. A personal case never shows a source.
  const reviewed = !!overrideState && overrideState !== card.state
  const source = card.personal_case || (reviewed && state === 'not_found') ? null : card.source
  const quranSource = source?.kind === 'quran'
  // A verse is set in the Mushaf's face and is never cut: the source's own verse, or the verse
  // the card abstains with when there is no source.
  const isVerse = quranSource || (!source && state === 'not_found')

  const note = lang === 'ar' ? card.note_ar || card.note_en : card.note_en || card.note_ar
  const verdict = reviewed ? '' : firstSentence(note) || (state === 'not_found' ? t.card.abstention : '')
  const action = reviewed ? ACTION_OF_STATE[state] : card.action
  // The reason a claim has nothing to quote, unless the sentence under the state already says it.
  const said = (sentence: string) => plain(sentence) === plain(verdict)
  const reasons = [card.personal_case ? t.card.personalCase : '', card.disagreement_noted ? t.card.disagreement : ''].filter(
    (reason) => reason && !said(reason),
  )
  // One grading is drawn in the source's words; a grading too long for its line is counted, never cut.
  const gradeLine = card.grades.length === 1 ? card.grades[0].text.split('\n')[0].trim() : ''
  const grade = gradeLine && Array.from(gradeLine).length <= 60 ? card.grades[0] : null
  const wholeSource = useMemo(() => sourceText(source, card.diff), [source, card.diff])

  // The card gives way a step at a time until its body no longer overflows (measured below).
  // Nothing is clipped on the way: the body's children are `flex: none`, so what does not fit
  // overflows where it can be measured.
  // A face that arrives after the card was fitted changes every measure: fit again.
  const [faces, setFaces] = useState(0)
  useEffect(() => {
    const refit = () => setFaces((n) => n + 1)
    document.fonts.addEventListener('loadingdone', refit)
    return () => document.fonts.removeEventListener('loadingdone', refit)
  }, [])
  const fitKey = `${card.id}|${state}|${size}|${lang}|${faces}`
  const [fit, setFit] = useState(() => FIRST_FIT(isVerse))
  const [fitted, setFitted] = useState(fitKey)
  if (fitted !== fitKey) {
    setFitted(fitKey)
    setFit(FIRST_FIT(isVerse))
  }
  const canTrimAround = useMemo(() => {
    const [first, last] = quotedSpan(wholeSource.words)
    return first > 0 || last < wholeSource.words.length - 1
  }, [wholeSource])
  const canCutSpan = !!source && !quranSource
  const body = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const element = body.current
    // Measured, not derived: the body is asked whether its content overflows it.
    if (element && element.scrollHeight > element.clientHeight + 1) {
      setFit((current) => tighten(current, { around: canTrimAround, span: canCutSpan, verse: quranSource }) ?? current)
    }
  }, [fit, fitKey, canTrimAround, canCutSpan, quranSource, theme])

  const claimFull = truncateClaim(card.text_as_quoted)
  const claimWords = claimFull.split(' ').length
  const claim = fit.claimKept >= 1 ? claimFull : keepWords(claimFull, Math.max(5, Math.floor(claimWords * fit.claimKept)))
  const shown = fitSource(wholeSource, fit)
  const label = (text: string) => (
    <div style={{ flex: 'none', fontSize: whole(26 * k), lineHeight: 1.5, color: palette.quiet }}>{text}</div>
  )

  return (
    <Frame
      {...shell}
      label={t.share.cardLabel}
      bodyRef={body}
      alt={t.share.alt(t.states[state])}
      fit={`${fit.claim}/${fit.source}/${fit.verdictLines}/${fit.around.toFixed(2)}/${fit.span.toFixed(2)}/${fit.claimKept.toFixed(2)}/${fit.sourceShown ? 'text' : 'reference'}`}
    >
      {/* Is it right? The state, then one plain sentence. */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: whole(20 * k) }}>
        <Glyph state={state} size={whole(64 * k)} />
        <div style={{ minWidth: 0, fontSize: whole(52 * k), fontWeight: 600, lineHeight: 1.3, color: colours.ink }}>{t.states[state]}</div>
      </div>
      {reviewed ? (
        <div style={{ flex: 'none', fontSize: whole(26 * k), lineHeight: 1.5, color: palette.quiet }}>{t.share.humanReview}</div>
      ) : null}
      {verdict ? (
        <div style={{ flex: 'none', marginTop: whole(10 * k), fontSize: whole(34 * k), lineHeight: 1.6, ...clamp(fit.verdictLines) }}>{verdict}</div>
      ) : null}

      {/* What is this about? The words as they circulate, set as the passage is on the page. */}
      <div style={{ flex: 'none', marginTop: whole(22 * k) }}>{label(t.share.circulating)}</div>
      <div
        dir="auto"
        style={{
          flex: 'none',
          fontFamily: NASKH_FONT,
          fontSize: whole(fit.claim * k),
          lineHeight: 1.9,
          color: colours.ink,
          textAlign: align,
          textDecorationLine: 'underline',
          textDecorationColor: colours.solid,
          textDecorationThickness: 3,
          textUnderlineOffset: '0.32em',
        }}
      >
        {claim}
      </div>

      {/* What does the source say? Its own wording, its reference, the grading in its word. */}
      {source ? (
        <>
          <div style={{ flex: 'none', marginTop: whole(20 * k), paddingBottom: whole(6 * k) }}>{label(t.card.inSource)}</div>
          <Rule palette={palette} />
          {fit.sourceShown ? (
            <div
              data-quran={quranSource ? '' : undefined}
              lang="ar"
              dir="rtl"
              style={{
                flex: 'none',
                padding: `${whole(6 * k)}px 0`,
                fontFamily: quranSource ? QURAN_FONT : NASKH_FONT,
                fontSize: whole(fit.source * k),
                lineHeight: quranSource ? 2.2 : 2,
                textAlign: align,
              }}
            >
              {quranSource ? '﴿' : null}
              {shown.before ? '… ' : null}
              {shown.words.map((word, i) => (
                <span
                  key={i}
                  style={
                    word.differs
                      ? { textDecorationLine: 'underline', textDecorationColor: colours.solid, textDecorationThickness: 3, textUnderlineOffset: '0.3em' }
                      : undefined
                  }
                >
                  {word.text}
                  {i < shown.words.length - 1 || shown.after ? ' ' : null}
                </span>
              ))}
              {shown.after ? '…' : null}
              {quranSource ? '﴾' : null}
            </div>
          ) : (
            // A verse is not cut to fit: the card names it, and it is read whole in the Mushaf.
            <div style={{ flex: 'none', padding: `${whole(10 * k)}px 0`, fontSize: whole(30 * k), lineHeight: 1.6 }}>
              {t.share.verseInMushaf}
            </div>
          )}
          <Rule palette={palette} />
          <div style={{ flex: 'none', marginTop: whole(12 * k), fontSize: whole(30 * k), lineHeight: 1.6 }}>
            <span dir="auto">{source.ref}</span>
            {grade ? (
              <>
                {' — '}
                <span lang="ar" style={{ fontFamily: NASKH_FONT, fontSize: whole(36 * k) }}>
                  «{gradeLine}»
                </span>
                <span style={{ fontSize: whole(26 * k), color: palette.quiet }}>
                  {t.report.summary.comma}
                  {grade.scholar ? `${grade.scholar}${t.report.summary.comma}` : ''}
                  {grade.source_name}
                </span>
              </>
            ) : card.grades.length > 0 ? (
              <span style={{ fontSize: whole(26 * k), color: palette.quiet }}>
                {' — '}
                {t.card.gradesCount(card.grades.length)}
              </span>
            ) : card.grade_unavailable ? (
              <span style={{ fontSize: whole(26 * k), color: palette.quiet }}>
                {' — '}
                {t.card.gradeUnavailable}
              </span>
            ) : (
              <span style={{ fontSize: whole(26 * k), color: palette.quiet }}>
                {' — '}
                {source.source_name}
              </span>
            )}
          </div>
        </>
      ) : state === 'not_found' ? (
        // Nothing to quote: the tool abstains, and says so in a verse's words.
        <div style={{ flex: 'none', marginTop: whole(20 * k) }}>
          <Rule palette={palette} />
          <div style={{ padding: `${whole(10 * k)}px 0` }}>
            <div style={{ fontSize: whole(30 * k), lineHeight: 1.6 }}>{t.card.abstention}</div>
            {verse ? (
              <>
                <div data-quran="" lang="ar" dir="rtl" style={{ fontFamily: QURAN_FONT, fontSize: whole(fit.source * k), lineHeight: 2.2, textAlign: align }}>
                  ﴿{verse.text}﴾
                </div>
                <div style={{ fontSize: whole(26 * k), lineHeight: 1.5, color: palette.quiet }}>
                  {lang === 'ar' ? verse.ref : verse.ref_en || verse.ref}
                </div>
              </>
            ) : null}
          </div>
          <Rule palette={palette} />
        </div>
      ) : (
        // No source to show (a disputed matter, a personal case, something to review): the reason
        // and the referral stand where the source would.
        <div style={{ flex: 'none', marginTop: whole(20 * k) }}>
          <Rule palette={palette} />
          <div style={{ padding: `${whole(10 * k)}px 0`, fontSize: whole(30 * k), lineHeight: 1.6 }}>
            {reasons.map((reason) => (
              <div key={reason}>{reason}</div>
            ))}
            <div>{t.share.referral}</div>
          </div>
          <Rule palette={palette} />
        </div>
      )}

      {/* What should I do with it? */}
      <div style={{ flex: 'none', marginTop: whole(12 * k), paddingBottom: whole(16 * k), fontSize: whole(30 * k), fontWeight: 600, lineHeight: 1.6 }}>
        {t.actionSentences[action]}
      </div>
    </Frame>
  )
}

// ── The summary card ──────────────────────────────────────────────────────────────────────────

export interface SummaryCardImageProps extends Shell {
  total: number
  counts: Record<EvidenceState, number>
  /** True when some of the counted states were set by a human reviewer. */
  reviewed: boolean
  /** The title of what was checked, when the report has one. */
  title: string | null
}

/** The whole report in one sentence, each clause in its state's ink with its ring. No claim text. */
export function SummaryCardImage({ total, counts, reviewed, title, ...shell }: SummaryCardImageProps) {
  const { size, theme, t } = shell
  const palette = CARD_PALETTE[theme]
  const k = scaleOf(size)
  const { head, tail, clauses } = summaryParts(t, total, counts)
  // A sentence with all five clauses on the square card is set a step smaller.
  const sentence = whole((size === 'square' && clauses.length > 3 ? 38 : 44) * k)

  return (
    <Frame {...shell} label={t.share.summaryLabel} alt={t.share.altSummary}>
      <div style={{ flex: 'none', fontSize: sentence, fontWeight: 600, lineHeight: 1.75 }}>
        {head}
        {tail}
        {clauses.map((clause) => (
          <span key={clause.state}>
            {clause.lead}
            <span style={{ color: palette.states[clause.state].ink, whiteSpace: 'nowrap' }}>
              <StateGlyph
                state={clause.state}
                style={{ display: 'inline-block', width: whole(sentence * 0.9), height: whole(sentence * 0.9), verticalAlign: '-0.14em', marginInlineEnd: whole(8 * k) }}
              />
              {clause.joiner}
              {clause.text}
            </span>
          </span>
        ))}
      </div>
      {reviewed ? (
        <div style={{ flex: 'none', marginTop: whole(12 * k), fontSize: whole(26 * k), lineHeight: 1.5, color: palette.quiet }}>{t.share.humanReview}</div>
      ) : null}
      {title ? (
        <div style={{ flex: 'none', marginTop: whole(28 * k) }}>
          <div style={{ fontSize: whole(26 * k), lineHeight: 1.5, color: palette.quiet }}>{t.share.checked}</div>
          <div dir="auto" style={{ fontFamily: NASKH_FONT, fontSize: whole(40 * k), lineHeight: 1.9, textAlign: shell.lang === 'ar' ? 'right' : 'left', ...clamp(3) }}>
            {title}
          </div>
        </div>
      ) : null}
    </Frame>
  )
}
