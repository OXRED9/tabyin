import { ReferralLinks } from '@/components/report/referral-links'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'
import type { Meta, ReferralMatch } from '@/lib/types'

/**
 * "إحالة إلى أهل العلم": the approved fatwa sites, served by `/api/meta`, each opened on its own
 * search for the note's topic words when it has any. Opened only on request.
 */
export default function ReferralDialog({
  open,
  onOpenChange,
  meta,
  query,
  matches = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: Meta | null
  /** The topic words of the note the dialog was opened from; null opens each site's first page. */
  query: string | null
  matches?: ReferralMatch[]
}) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.close} data-testid="referral-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.referral.title}</DialogTitle>
          <DialogDescription>{t.referral.description}</DialogDescription>
        </DialogHeader>
        <ReferralLinks meta={meta} query={query} matches={matches} />
      </DialogContent>
    </Dialog>
  )
}
