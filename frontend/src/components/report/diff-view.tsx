import { hasUnquoted } from '@/lib/diff'
import { useI18n } from '@/lib/i18n'
import { STATE_STYLE } from '@/lib/states'
import type { DiffOp, EvidenceState } from '@/lib/types'
import { cn } from '@/lib/utils'

/*
 * The collation, as a copyist marks it: no boxes and no tints, only what the pen does to the
 * word. A word that differs is underlined; a word that is not in the source is struck through.
 * In the source's text the words that were quoted take the state's ink, as the passage does on
 * the page, and the rest of the source stays in plain ink: nothing of it is greyed or dotted.
 */
const CHANGED = 'bg-transparent text-review-ink underline decoration-review decoration-2 underline-offset-[0.35em]'
const EXTRA = 'text-missing-ink line-through decoration-missing decoration-2'
const UNQUOTED = 'text-ink no-underline'

/**
 * The source side of a comparison, word for word: the quoted words in the state's ink, the
 * differing words underlined, the rest plain.
 */
export function MarkedSource({ diff, state }: { diff: DiffOp[]; state: EvidenceState }) {
  const quoted = { color: STATE_STYLE[state].inkVariable }
  return (
    <>
      {diff.map((op, i) =>
        op.source ? (
          <span key={i}>
            {op.op === 'equal' ? (
              <span style={quoted}>{op.source}</span>
            ) : op.op === 'replace' ? (
              <mark className={CHANGED}>{op.source}</mark>
            ) : (
              <ins className={UNQUOTED}>{op.source}</ins>
            )}{' '}
          </span>
        ) : null,
      )}
    </>
  )
}

function MarkedQuote({ diff }: { diff: DiffOp[] }) {
  return (
    <>
      {diff.map((op, i) =>
        op.quoted ? (
          <span key={i}>
            {op.op === 'equal' ? (
              op.quoted
            ) : op.op === 'replace' ? (
              <mark className={CHANGED}>{op.quoted}</mark>
            ) : (
              <del className={EXTRA}>{op.quoted}</del>
            )}{' '}
          </span>
        ) : null,
      )}
    </>
  )
}

/** What each mark means, listed only for the marks that occur. */
function DiffLegend({ diff }: { diff: DiffOp[] }) {
  const { t } = useI18n()
  const kinds = new Set(diff.map((op) => op.op))
  if (!kinds.has('replace') && !kinds.has('delete')) return null
  return (
    <ul aria-label={t.diff.legend} className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-quiet">
      {kinds.has('replace') ? (
        <li className="flex items-baseline gap-2">
          <span aria-hidden="true" className={cn(CHANGED, 'font-naskh')}>
            لفظ
          </span>
          {t.diff.changed}
        </li>
      ) : null}
      {kinds.has('delete') ? (
        <li className="flex items-baseline gap-2">
          <span aria-hidden="true" className={cn(EXTRA, 'font-naskh')}>
            لفظ
          </span>
          {t.diff.extra}
        </li>
      ) : null}
    </ul>
  )
}

/**
 * «في النص / في المصدر»: the words as quoted against the words of the source, from `card.diff`.
 * When the source's words are already shown above with their marks, only the quoted side is set.
 */
export function DiffView({
  diff,
  state,
  quranSource,
  sourceShownAbove,
}: {
  diff: DiffOp[]
  state: EvidenceState
  quranSource: boolean
  sourceShownAbove: boolean
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-2">
      <dl className="space-y-2">
        <div>
          <dt className="text-sm text-quiet">{t.card.inText}</dt>
          <dd lang="ar" dir="rtl" className="page-text">
            <MarkedQuote diff={diff} />
          </dd>
        </div>
        {sourceShownAbove ? null : (
          <div>
            <dt className="text-sm text-quiet">{t.card.inSource}</dt>
            <dd lang="ar" dir="rtl" className={quranSource ? 'quran-text' : 'naskh-quote'}>
              <MarkedSource diff={diff} state={state} />
            </dd>
          </div>
        )}
      </dl>
      {!sourceShownAbove && hasUnquoted(diff) ? <p className="text-sm text-quiet">{t.diff.partial}</p> : null}
      <DiffLegend diff={diff} />
    </div>
  )
}
