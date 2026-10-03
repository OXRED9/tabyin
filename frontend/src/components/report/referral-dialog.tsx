import { ExternalLink, GraduationCap } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'
import type { Meta } from '@/lib/types'

/** "إحالة إلى أهل العلم": the bodies to consult, served by `/api/meta`. Opened only on request. */
export function ReferralDialog({
  open,
  onOpenChange,
  meta,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  meta: Meta | null
}) {
  const { t, lang } = useI18n()
  const links = (meta?.referral_links ?? []).filter((link) => safeHref(link.url))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.close} className="gap-4 p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg leading-snug font-semibold">
            <GraduationCap aria-hidden="true" className="size-5 text-primary" />
            {t.referral.title}
          </DialogTitle>
          <DialogDescription>{t.referral.description}</DialogDescription>
        </DialogHeader>
        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.referral.empty}</p>
        ) : (
          <ul className="space-y-2">
            {links.map((link) => (
              <li key={link.url}>
                <a
                  href={safeHref(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-lg border bg-background p-3 transition-colors hover:border-primary hover:bg-secondary"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-primary underline-offset-4 group-hover:underline">
                      {lang === 'ar' ? link.name_ar : link.name_en}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground" dir="ltr">
                      {link.url.replace(/^https?:\/\//, '')}
                    </span>
                  </span>
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-primary rtl:-scale-x-100" />
                  <span className="sr-only">{t.opensInNewTab}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t.transparency}</p>
      </DialogContent>
    </Dialog>
  )
}
