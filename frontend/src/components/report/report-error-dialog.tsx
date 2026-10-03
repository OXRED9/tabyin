import { Copy, Mail, MessageCircle, Share2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { copyText } from '@/lib/clipboard'
import { appUrlOf } from '@/lib/features'
import { errorReport, errorSubject, feedbackOf } from '@/lib/feedback'
import type { ErrorTarget } from '@/lib/feedback'
import { useI18n } from '@/lib/i18n'
import { notify } from '@/lib/notify'
import { canShareText, shareWords } from '@/lib/share-card'
import type { Meta, SourceInfo } from '@/lib/types'

/**
 * «أبلغ عن خطأ في هذا الحكم». The dialog shows the report exactly as it will be sent, takes what
 * the reader wants to add, and hands the message to the reader's own mail or WhatsApp (where the
 * server names an address), to the share sheet, or to the clipboard. Tabayyun's server receives
 * nothing: there is no request of ours here.
 */
export default function ReportErrorDialog({
  target,
  meta,
  source,
  onClose,
}: {
  target: ErrorTarget | null
  meta: Meta | null
  source: SourceInfo | null
  onClose: () => void
}) {
  const { t } = useI18n()
  const [comment, setComment] = useState('')
  const field = useId()
  const shareable = useMemo(() => canShareText(), [])
  if (!target) return null

  const { email, whatsapp } = feedbackOf(meta)
  const subject = errorSubject(target, t)
  const report = errorReport(target, t, { source, dataVersion: meta?.data_version, address: appUrlOf(meta), comment })
  const way =
    'inline-flex h-10 items-center justify-center gap-2 rounded-control border border-rule-strong px-4 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-accent'

  const copy = async () => {
    if (await copyText(report)) notify((toast) => toast(t.feedback.copied))
    else notify((toast) => toast.error(t.copy.failed))
  }
  const share = async () => {
    try {
      await shareWords(subject, report)
    } catch {
      notify((toast) => toast.error(t.copy.failed))
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t.close} data-testid="report-error-dialog" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{target.kind === 'claim' ? t.feedback.title : t.feedback.titleMissed}</DialogTitle>
          <DialogDescription>{t.feedback.privacy}</DialogDescription>
        </DialogHeader>

        {/* The report as it will be sent: selectable, each line in its own direction. */}
        <div
          role="group"
          aria-label={t.feedback.report}
          tabIndex={0}
          data-testid="report-error-text"
          className="max-h-64 min-w-0 space-y-1 overflow-y-auto rounded-sheet border bg-desk p-3 text-sm leading-relaxed text-ink select-text"
        >
          {report.split('\n').map((line, i) => {
            // A label and its value each keep their own direction (a rule id, a version, an address).
            const at = line.indexOf(': ')
            return (
              <p key={i} className="break-words">
                {at === -1 ? (
                  line
                ) : (
                  <>
                    {line.slice(0, at + 2)}
                    <bdi>{line.slice(at + 2)}</bdi>
                  </>
                )}
              </p>
            )
          })}
        </div>

        <div className="space-y-1">
          <label htmlFor={field} className="text-sm font-semibold text-ink">
            {t.feedback.what}
          </label>
          <textarea
            id={field}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder={t.feedback.whatPlaceholder}
            rows={3}
            dir="auto"
            className="block w-full resize-y rounded-control border border-rule-strong bg-paper px-3 py-2 text-base text-ink placeholder:text-quiet"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {email ? (
            <a
              href={`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(report)}`}
              data-testid="report-error-mail"
              className={way}
            >
              <Mail aria-hidden="true" className="size-4" />
              {t.feedback.mail}
            </a>
          ) : null}
          {whatsapp ? (
            <a
              href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(report)}`}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="report-error-whatsapp"
              className={way}
            >
              <MessageCircle aria-hidden="true" className="size-4" />
              {t.feedback.whatsapp}
              <span className="sr-only">{t.opensInNewTab}</span>
            </a>
          ) : null}
          {shareable ? (
            <Button type="button" variant="outline" size="touch" data-testid="report-error-share" onClick={() => void share()}>
              <Share2 aria-hidden="true" />
              {t.feedback.share}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={email || whatsapp || shareable ? 'outline' : 'default'}
            size="touch"
            data-testid="report-error-copy"
            onClick={() => void copy()}
          >
            <Copy aria-hidden="true" />
            {t.feedback.copy}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
