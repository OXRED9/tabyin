import { hasUnquoted } from '@/lib/diff'
import { useI18n } from '@/lib/i18n'
import type { DiffOp } from '@/lib/types'
import { cn } from '@/lib/utils'

/*
 * The collation, as a copyist marks it: no boxes and no tints, only what the pen does to the
 * word. A word that differs is underlined; a word that is not in the source is struck through.
 * Source words that were simply not quoted carry no mark at all: they are set fainter, so the
 * quoted part of a long narration stands out in ink and the rest steps back.
 */
const CHANGED = 'bg-transparent text-review-ink underline decoration-review decoration-2 underline-offset-[0.35em]'
const EXTRA = 'text-missing-ink line-through decoration-missing decoration-2'
const UNQUOTED = 'text-quiet no-underline'

/** The source side of a comparison, word for word, with the differing words marked. */
export function MarkedSource({ diff }: { diff: DiffOp[] }) {
  return (
    <>
      {diff.map((op, i) =>
        op.source ? (
          <span key={i}>
            {op.op === 'equal' ? (
              op.source
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
  quranSource,
  sourceShownAbove,
}: {
  diff: DiffOp[]
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
              <MarkedSource diff={diff} />
            </dd>
          </div>
        )}
      </dl>
      {!sourceShownAbove && hasUnquoted(diff) ? <p className="text-sm text-quiet">{t.diff.partial}</p> : null}
      <DiffLegend diff={diff} />
    </div>
  )
}
