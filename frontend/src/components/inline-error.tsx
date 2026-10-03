import { CircleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

/**
 * An error in human language, inside the sheet where the result would have been, never in a
 * modal: what happened, then what to do now, then the buttons that do it. It is set like a note
 * (a tick on its edge), not like a banner.
 */
export function InlineError({
  id,
  message,
  hint,
  actions,
  onDismiss,
}: {
  id?: string
  message: string
  hint?: string | null
  actions?: ReactNode
  onDismiss?: () => void
}) {
  const { t } = useI18n()
  return (
    <div id={id} role="alert" className="flex items-start gap-3 border-s-2 border-contra ps-3 text-base">
      <div className="min-w-0 flex-1 space-y-3 py-1">
        <div>
          <p className="flex items-start gap-2 font-semibold text-contra-ink">
            <CircleAlert aria-hidden="true" className="mt-1.5 size-4 shrink-0" />
            {message}
          </p>
          {hint ? <p className="text-ink">{hint}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
      </div>
      {onDismiss ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t.errors.dismiss}
          onClick={onDismiss}
          className="shrink-0 text-quiet"
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
