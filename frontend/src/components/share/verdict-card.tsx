import { Check, OctagonX, PencilLine, TriangleAlert, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, Ref } from 'react'

import type { Dictionary } from '@/lib/dictionary'
import { STATES_BY_RISK } from '@/lib/states'
import {
  CARD_HEIGHT,
  CARD_PALETTE,
  CARD_WIDTH,
  displayUrl,
  firstSentence,
  hostnameOf,
  qrPath,
  truncateClaim,
} from '@/lib/share-card'
import type { CardPalette as Palette, CardSize, CardTheme } from '@/lib/share-card'
import type { Card, EvidenceState, UiLang, VerseRef } from '@/lib/types'

/*
 * The verdict card template. It is a fixed 1080px-wide block styled entirely with inline pixel
 * values and its own palette, so the PNG looks the same whatever the page theme, zoom or viewport
 * is. The layout follows the server-side renderer (`POST /api/share-card`): header band, state
 * pill, the quoted text with a state-coloured bar on its start edge, the verdict line in the
 * state's ink, labelled reference / grading / source, then the footer with the QR code on the end
 * side and the transparency line centred at the bottom.
 *
 * Never drawn: a date or time, a reviewer's name, a video link or timestamp, anything about the user.
 */

/** Solid pill colour (white text and icon on it) and the ink used for the verdict line. */
const STATE_COLOURS: Record<EvidenceState, { pill: string; ink: Record<CardTheme, string>; icon: LucideIcon }> = {
  supported: { pill: '#1e7f4e', ink: { light: '#17613c', dark: '#6fd3a2' }, icon: Check },
  supported_with_note: { pill: '#4f8a22', ink: { light: '#3c6417', dark: '#b4de8e' }, icon: PencilLine },
  needs_review: { pill: '#a86c12', ink: { light: '#7a4e08', dark: '#f0c56a' }, icon: TriangleAlert },
  not_found: { pill: '#c8463c', ink: { light: '#a8322a', dark: '#f4928a' }, icon: X },
  contradicted: { pill: '#8b2020', ink: { light: '#8b2020', dark: '#f08a8a' }, icon: OctagonX },
}

const FONT: Record<UiLang, string> = {
  ar: '"IBM Plex Sans Arabic", "Noto Sans Arabic", "Inter Variable", system-ui, sans-serif',
  en: '"Inter Variable", "IBM Plex Sans Arabic", "Noto Sans Arabic", system-ui, sans-serif',
}
const QURAN_FONT = '"Amiri Quran", "Amiri", "Scheherazade New", "Traditional Arabic", serif'

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

function Mark({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true" style={{ flex: 'none' }}>
      <rect x="13" y="13" width="15" height="15" rx="4.5" fill="#ffffff" fillOpacity="0.2" stroke="#ffffff" strokeOpacity="0.65" strokeWidth="2.4" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="#ffffff" strokeWidth="2.8" />
      <rect x="12.4" y="12.4" width="7.4" height="7.4" rx="2.4" fill="#c9a227" />
    </svg>
  )
}

function Qr({ value, size, quiet }: { value: string; size: number; quiet: boolean }) {
  const code = useMemo(() => qrPath(value), [value])
  // Dark theme: the code sits on a white tile with a quiet zone, so any scanner reads it.
  const margin = quiet ? 3 : 0
  const box = code.size + margin * 2
  return (
    <svg
      viewBox={`${-margin} ${-margin} ${box} ${box}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      role="img"
      aria-label={value}
      style={{ flex: 'none', background: '#ffffff', borderRadius: quiet ? 4 : 0 }}
    >
      <path d={code.path} fill="#0f1f1b" />
    </svg>
  )
}

function Field({ label, children, k, palette, lines = 1, lang, dir, align }: { label: string; children: ReactNode; k: number; palette: Palette; lines?: number; lang?: string; dir?: 'rtl' | 'ltr' | 'auto'; align: 'left' | 'right' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: whole(25 * k), lineHeight: 1.5, color: palette.label }}>{label}</div>
      {/* Aligned to the card's start edge whatever the value's own direction (a domain is LTR). */}
      <div lang={lang} dir={dir} style={{ fontSize: whole(32 * k), lineHeight: 1.55, fontWeight: 600, textAlign: align, ...clamp(lines) }}>
        {children}
      </div>
    </div>
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

/** The frame every card shares: page, rounded card, header band, body, footer. */
function Frame({ size, theme, lang, t, appUrl, nodeRef, label, children, bodyRef, alt, fitSteps = 0 }: Shell & { label: string; children: ReactNode; bodyRef?: Ref<HTMLDivElement>; alt: string; fitSteps?: number }) {
  const palette = CARD_PALETTE[theme]
  const square = size === 'square'
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
      data-fit-steps={fitSteps}
      style={{
        width: CARD_WIDTH,
        height: CARD_HEIGHT[size],
        boxSizing: 'border-box',
        padding: 48,
        background: palette.page,
        color: palette.text,
        fontFamily: FONT[lang],
        fontFeatureSettings: 'normal',
        letterSpacing: 0,
        textAlign: 'start',
      }}
    >
      <div
        style={{
          height: '100%',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          borderRadius: 44,
          background: palette.card,
          border: `2px solid ${palette.border}`,
        }}
      >
        <div
          style={{
            flex: 'none',
            height: 150,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            padding: '0 56px',
            background: palette.header,
            color: '#ffffff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <Mark size={84} />
            <span style={{ fontSize: lang === 'ar' ? 62 : 52, fontWeight: 700, lineHeight: 1.2 }}>{t.appName}</span>
          </div>
          <span style={{ fontSize: 33, fontWeight: 500, opacity: 0.88 }}>{label}</span>
        </div>

        <div
          ref={bodyRef}
          style={{
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            padding: `${square ? 40 : 44}px 56px 0`,
          }}
        >
          {children}
        </div>

        <div style={{ flex: 'none', padding: `0 56px ${square ? 26 : 30}px` }}>
          <div style={{ height: 2, background: palette.border }} />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32, padding: `${square ? 22 : 26}px 0 ${square ? 18 : 26}px` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: square ? 32 : 36, fontWeight: 600, lineHeight: 1.5 }}>{t.share.footer}</div>
              <div dir="ltr" style={{ fontSize: square ? 27 : 30, lineHeight: 1.5, color: palette.link, textAlign: lang === 'ar' ? 'right' : 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {displayUrl(appUrl)}
              </div>
            </div>
            <Qr value={appUrl} size={square ? 124 : 156} quiet={theme === 'dark'} />
          </div>
          <div style={{ fontSize: square ? 20 : 21, lineHeight: 1.5, color: palette.label, textAlign: 'center' }}>{t.transparency}</div>
        </div>
      </div>
    </div>
  )
}

export interface ClaimCardImageProps extends Shell {
  card: Card
  /** A reviewer's state, drawn with the "human review" mark and no name. */
  overrideState: EvidenceState | null
  verse: VerseRef | null
}

/** One claim's verdict. If the content does not fit, the type steps down until it does. */
export function ClaimCardImage({ card, overrideState, verse, ...shell }: ClaimCardImageProps) {
  const { size, theme, lang, t } = shell
  const palette = CARD_PALETTE[theme]
  const state = overrideState ?? card.state
  const colours = STATE_COLOURS[state]
  const Icon = colours.icon
  const ink = colours.ink[theme]
  const square = size === 'square'

  const claim = truncateClaim(card.text_as_quoted)
  const note = lang === 'ar' ? card.note_ar || card.note_en : card.note_en || card.note_ar
  const verdict = firstSentence(note) || (state === 'not_found' ? t.card.abstention : '')
  const domain = hostnameOf(card.source?.url)
  const grade = card.grades[0] ?? null
  const more = card.grades.length - 1
  const notFound = state === 'not_found'
  const align = lang === 'ar' ? 'right' : 'left'

  // Type scale: smaller on the square card, smaller again for a long claim, and one more step
  // each time the body still overflows (measured below). Nothing is ever clipped: the body's
  // children are `flex: none`, so content that does not fit overflows where it can be measured.
  const length = Array.from(claim).length
  const base = (square ? 0.84 : 1) * (length > 150 ? 0.86 : length > 80 ? 0.93 : 1)
  const [steps, setSteps] = useState(0)
  const body = useRef<HTMLDivElement | null>(null)
  const k = base * (1 - steps * 0.07)

  const fitKey = `${card.id}|${state}|${size}|${lang}`
  const [fitted, setFitted] = useState(fitKey)
  if (fitted !== fitKey) {
    setFitted(fitKey)
    setSteps(0)
  }
  useLayoutEffect(() => {
    const element = body.current
    if (element && element.scrollHeight > element.clientHeight + 1 && steps < 6) setSteps(steps + 1)
  }, [steps, fitKey, theme])

  return (
    <Frame {...shell} label={t.share.cardLabel} bodyRef={body} alt={t.share.alt(t.states[state])} fitSteps={steps}>
      <div style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10 * k }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 18 * k,
            padding: `${18 * k}px ${34 * k}px`,
            borderRadius: 999,
            background: colours.pill,
            color: '#ffffff',
            fontSize: whole(35 * k),
            fontWeight: 700,
            lineHeight: 1.4,
          }}
        >
          <Icon size={36 * k} strokeWidth={2.6} aria-hidden="true" style={{ flex: 'none' }} />
          {t.states[state]}
        </div>
        {overrideState && overrideState !== card.state ? (
          <div style={{ fontSize: whole(23 * k), fontWeight: 600, color: palette.label }}>{t.share.humanReview}</div>
        ) : null}
      </div>

      <div style={{ flex: 'none', marginTop: 26 * k, fontSize: whole(25 * k), lineHeight: 1.5, color: palette.label }}>{t.share.asQuoted}</div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'stretch', gap: 24 * k, marginTop: 8 * k }}>
        <div style={{ flex: 'none', width: 9, borderRadius: 9, background: colours.pill }} />
        {/* The text hugs the bar whichever script it is in, as in the server-side render. */}
        <div dir="auto" style={{ flex: 1, minWidth: 0, fontSize: whole(42 * k), fontWeight: 600, lineHeight: 1.65, textAlign: align, ...clamp(square ? 4 : 6) }}>
          {claim}
        </div>
      </div>

      {verdict ? (
        <div style={{ flex: 'none', marginTop: 22 * k, fontSize: whole(31 * k), fontWeight: 600, lineHeight: 1.6, color: ink, ...clamp(3) }}>{verdict}</div>
      ) : null}

      {notFound ? (
        verse ? (
          <div style={{ flex: '1 0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 * k, textAlign: 'center', padding: `${12 * k}px 0` }}>
            {/* It may grow into the free space but never shrinks: if it does not fit, the type steps down. */}
            <div data-quran lang="ar" dir="rtl" style={{ fontFamily: QURAN_FONT, fontSize: whole(44 * k), lineHeight: 2.1, fontWeight: 400 }}>
              ﴿{verse.text}﴾
            </div>
            <div style={{ fontSize: whole(25 * k), color: palette.label }}>{lang === 'ar' ? verse.ref : verse.ref_en || verse.ref}</div>
          </div>
        ) : null
      ) : (
        <div style={{ flex: 'none', marginTop: 22 * k, display: 'flex', flexDirection: 'column', gap: 12 * k }}>
          {card.source ? (
            <Field label={t.share.reference} k={k} palette={palette} lines={2} dir="auto" align={align}>
              {card.source.ref}
            </Field>
          ) : null}
          {grade ? (
            <Field label={t.share.grading} k={k} palette={palette} lines={2} lang="ar" dir="auto" align={align}>
              {grade.text}
              {more > 0 ? (
                <>
                  {' '}
                  <span dir="ltr">(+{more})</span>
                </>
              ) : null}
              <span style={{ fontWeight: 400, fontSize: whole(24 * k), color: palette.label }}> · {grade.source_name}</span>
            </Field>
          ) : card.grade_unavailable ? (
            <Field label={t.share.grading} k={k} palette={palette} align={align}>
              {t.card.gradeUnavailable}
            </Field>
          ) : null}
          {domain ? (
            <Field label={t.share.source} k={k} palette={palette} dir="ltr" align={align}>
              {domain}
            </Field>
          ) : null}
        </div>
      )}
    </Frame>
  )
}

export interface SummaryCardImageProps extends Shell {
  total: number
  counts: Record<EvidenceState, number>
  /** True when some of the counted states were set by a human reviewer. */
  reviewed: boolean
}

/** The whole report in numbers: the total and one row per state. No claim text. */
export function SummaryCardImage({ total, counts, reviewed, ...shell }: SummaryCardImageProps) {
  const { size, theme, t } = shell
  const palette = CARD_PALETTE[theme]
  const square = size === 'square'
  const rows = STATES_BY_RISK.filter((state) => counts[state] > 0)
  const k = square ? (rows.length > 3 ? 0.66 : 0.82) : 1

  return (
    <Frame {...shell} label={t.share.summaryLabel} alt={t.share.altSummary}>
      <div style={{ textAlign: 'center' }}>
        <div dir="ltr" style={{ fontSize: whole(150 * k), fontWeight: 700, lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>{total}</div>
        <div style={{ fontSize: whole(36 * k), fontWeight: 600, lineHeight: 1.5, color: palette.label }}>{t.share.citationsNoun(total)}</div>
        {reviewed ? <div style={{ fontSize: whole(23 * k), fontWeight: 600, color: palette.label }}>{t.share.humanReview}</div> : null}
      </div>
      <div style={{ marginTop: 28 * k, display: 'flex', flexDirection: 'column', gap: 14 * k }}>
        {rows.map((state) => {
          const colours = STATE_COLOURS[state]
          const Icon = colours.icon
          return (
            <div
              key={state}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20 * k,
                padding: `${13 * k}px ${26 * k}px`,
                borderRadius: 24 * k,
                background: palette.row,
              }}
            >
              <span style={{ flex: 'none', width: 50 * k, height: 50 * k, borderRadius: 999, background: colours.pill, color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={30 * k} strokeWidth={2.8} aria-hidden="true" />
              </span>
              <span style={{ flex: 1, minWidth: 0, fontSize: whole(33 * k), fontWeight: 600, lineHeight: 1.5 }}>{t.states[state]}</span>
              <span dir="ltr" style={{ flex: 'none', fontSize: whole(38 * k), fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {counts[state]}
              </span>
            </div>
          )
        })}
      </div>
    </Frame>
  )
}
