import { ExternalLink } from 'lucide-react'

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
      <DialogContent closeLabel={t.close} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.referral.title}</DialogTitle>
          <DialogDescription>{t.referral.description}</DialogDescription>
        </DialogHeader>
        {links.length === 0 ? (
          <p className="text-sm text-quiet">{t.referral.empty}</p>
        ) : (
          <ul className="divide-y border-y">
            {links.map((link) => (
              <li key={link.url}>
                <a
                  href={safeHref(link.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 py-3 focus-visible:-outline-offset-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-medium text-green underline decoration-green/40 underline-offset-4 group-hover:decoration-green">
                      {lang === 'ar' ? link.name_ar : link.name_en}
                    </span>
                    <span className="block truncate text-sm text-quiet" dir="ltr">
                      {link.url.replace(/^https?:\/\//, '')}
                    </span>
                  </span>
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0 text-quiet rtl:-scale-x-100" />
                  <span className="sr-only">{t.opensInNewTab}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-quiet">{t.transparency}</p>
      </DialogContent>
    </Dialog>
  )
}
