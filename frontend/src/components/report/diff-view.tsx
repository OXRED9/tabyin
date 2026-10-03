import { Equal } from 'lucide-react'

import { useI18n } from '@/lib/i18n'
import type { DiffOp } from '@/lib/types'
import { cn } from '@/lib/utils'

/*
 * Each kind of difference has its own shape as well as its own colour, so the comparison reads
 * without colour vision: changed words are boxed and bold, words that are not in the source are
 * struck through, and source words that were left out carry a dotted underline.
 */
const CHANGED = 'rounded bg-review-soft px-1 font-semibold text-review-ink ring-1 ring-review/50 box-decoration-clone'
const EXTRA = 'rounded bg-missing-soft px-1 text-missing-ink line-through decoration-2 box-decoration-clone'
const MISSING =
  'rounded bg-gold-soft px-1 text-foreground underline decoration-gold-ink decoration-dotted decoration-2 underline-offset-4 box-decoration-clone'

function Row({
  label,
  children,
  quran = false,
}: {
  label: string
  children: React.ReactNode
  quran?: boolean
}) {
  return (
    <div className="grid gap-1 sm:grid-cols-[5.5rem_1fr] sm:gap-3">
      <dt className="pt-1 text-xs text-muted-foreground">{label}</dt>
      <dd lang="ar" dir="rtl" className={cn('text-base leading-loose', quran && 'quran-text text-xl')}>
        {children}
      </dd>
    </div>
  )
}

/** Word-level comparison of the text as quoted against the source, rendered from `card.diff`. */
export function DiffView({ diff, quranSource }: { diff: DiffOp[]; quranSource: boolean }) {
  const { t } = useI18n()
  const kinds = new Set(diff.map((op) => op.op))

  return (
    <div className="space-y-3">
      <dl className="space-y-2 rounded-lg bg-muted/60 p-3">
        <Row label={t.card.quoted}>
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
        </Row>
        <Row label={t.card.inSource} quran={quranSource}>
          {diff.map((op, i) =>
            op.source ? (
              <span key={i}>
                {op.op === 'equal' ? (
                  op.source
                ) : op.op === 'replace' ? (
                  <mark className={CHANGED}>{op.source}</mark>
                ) : (
                  <ins className={MISSING}>{op.source}</ins>
                )}{' '}
              </span>
            ) : null,
          )}
        </Row>
      </dl>
      <ul aria-label={t.diff.legend} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {kinds.has('replace') ? (
          <li className="flex items-center gap-1">
            <span className={cn(CHANGED, 'text-xs')}>أ</span>
            {t.diff.changed}
          </li>
        ) : null}
        {kinds.has('delete') ? (
          <li className="flex items-center gap-1">
            <span className={cn(EXTRA, 'text-xs')}>أ</span>
            {t.diff.extra}
          </li>
        ) : null}
        {kinds.has('insert') ? (
          <li className="flex items-center gap-1">
            <span className={cn(MISSING, 'text-xs')}>أ</span>
            {t.diff.missing}
          </li>
        ) : null}
      </ul>
    </div>
  )
}

export function ExactMatch() {
  const { t } = useI18n()
  return (
    <p className="flex items-center gap-2 text-sm font-medium text-supported-ink">
      <Equal aria-hidden="true" className="size-4" />
      {t.diff.exact}
    </p>
  )
}
