import { ExternalLink } from 'lucide-react'
import type { ReactNode } from 'react'

import { safeHref } from '@/lib/format'
import { useI18n } from '@/lib/i18n'

/** A link that looks like one: the tool's green, an underline, and an "opens elsewhere" arrow. */
export function SourceLink({ href, children }: { href: string | null | undefined; children: ReactNode }) {
  const { t } = useI18n()
  const safe = safeHref(href)
  if (!safe) return <span>{children}</span>
  return (
    <a
      href={safe}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-green underline decoration-green/40 underline-offset-4 hover:decoration-green"
    >
      {children}
      <ExternalLink aria-hidden="true" className="ms-1 inline size-3.5 align-[-2px] rtl:-scale-x-100" />
      <span className="sr-only"> ({t.opensInNewTab})</span>
    </a>
  )
}
