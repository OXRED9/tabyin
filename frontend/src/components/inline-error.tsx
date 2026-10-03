import { CircleAlert, X } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

/**
 * An error in human language, shown where it happened (under the field), never in a modal:
 * what went wrong, then what to do now, then the actions that do it.
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
    <div
      id={id}
      role="alert"
      className="flex animate-rise items-start gap-3 rounded-lg border border-missing/50 bg-missing-soft p-3 text-sm"
    >
      <CircleAlert aria-hidden="true" className="mt-1 size-4 shrink-0 text-missing-ink" />
      <div className="min-w-0 flex-1 space-y-2">
        <div>
          <p className="font-semibold text-missing-ink">{message}</p>
          {hint ? <p className="text-foreground">{hint}</p> : null}
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
          className="shrink-0 text-missing-ink hover:bg-missing/15 hover:text-missing-ink"
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  )
}
