import { Suspense, lazy, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'

const StatesLegend = lazy(() => import('@/components/states-legend'))

/** The quiet link «ما معنى هذه الحالات؟». What it opens is fetched when it is first asked for. */
export function LegendLink({ className }: { className?: string }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  // The dialog stays mounted once it has been opened, so it can close with its transition.
  const [seen, setSeen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="link"
        data-testid="legend-link"
        aria-haspopup="dialog"
        className={className}
        onClick={() => {
          setSeen(true)
          setOpen(true)
        }}
      >
        {t.legend.link}
      </Button>
      <Suspense fallback={null}>{seen ? <StatesLegend open={open} onOpenChange={setOpen} /> : null}</Suspense>
    </>
  )
}
