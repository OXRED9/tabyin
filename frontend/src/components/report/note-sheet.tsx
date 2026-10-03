import NoteBody from '@/components/report/note-body'
import type { NoteBodyProps } from '@/components/report/note-body'
import { StateWord } from '@/components/state-badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useI18n } from '@/lib/i18n'

/** A note opened below 1024px: the same body, on a sheet that rises from the bottom. */
export default function NoteSheet({
  open,
  onClose,
  ...body
}: Omit<NoteBodyProps, 'showQuoted'> & { open: boolean; onClose: () => void }) {
  const { t } = useI18n()
  const { card, override } = body
  const state = override?.state ?? card.state
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="bottom"
        closeLabel={t.close}
        data-note-sheet={card.id}
        className="max-h-[88dvh] outline-none"
        // Focus goes to the sheet itself, not to its first button: that button has a tooltip,
        // which would open over the note the moment the sheet did.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          ;(event.currentTarget as HTMLElement).focus()
        }}
      >
        <SheetHeader className="border-b py-4">
          <SheetTitle className="mx-auto flex w-full max-w-[36rem] items-center gap-2">
            <StateWord state={state} className="text-base" />
            <span className="text-sm font-normal text-quiet">— {t.claimTypes[card.claim_type]}</span>
          </SheetTitle>
          <SheetDescription className="sr-only">{t.states[state]}</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-[36rem]">
            <NoteBody {...body} showQuoted />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
