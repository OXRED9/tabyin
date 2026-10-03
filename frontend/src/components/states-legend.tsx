import { StateGlyph } from '@/components/state-glyph'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useI18n } from '@/lib/i18n'
import { STATES_FOR_SUMMARY, STATE_STYLE } from '@/lib/states'
import { cn } from '@/lib/utils'

/**
 * «ما معنى هذه الحالات؟»: the five states, each with its ring, its word and one plain sentence
 * of what it means and what it does not; then what Tabayyun does not do, and the transparency
 * line. A state says what was found about the SOURCE of a text, never whether to act on it.
 */
export default function StatesLegend({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t.close} data-testid="legend" className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.legend.title}</DialogTitle>
          <DialogDescription>{t.legend.description}</DialogDescription>
        </DialogHeader>
        <dl className="divide-y border-y">
          {STATES_FOR_SUMMARY.map((state) => (
            <div key={state} className="py-3">
              <dt className={cn('flex items-center gap-2 text-base font-semibold', STATE_STYLE[state].ink)}>
                <StateGlyph state={state} />
                {t.stateWords[state]}
              </dt>
              <dd className="ps-7 text-sm text-ink">{t.legend.states[state]}</dd>
            </div>
          ))}
        </dl>
        <p className="text-sm text-ink">{t.legend.notDone}</p>
        <p className="text-sm text-quiet">{t.transparency}</p>
      </DialogContent>
    </Dialog>
  )
}
