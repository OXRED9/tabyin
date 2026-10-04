import { RailContent } from '@/components/shell/rail'
import type { RailProps } from '@/components/shell/rail'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { useI18n } from '@/lib/i18n'

/** The rail as a drawer, below 1280px. Fetched the first time the menu is opened. */
export default function RailDrawer({
  open,
  onOpenChange,
  ...rail
}: RailProps & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  // Whatever is chosen in the drawer, it closes: the workspace is what the choice was for.
  const closing = <T extends unknown[]>(action: (...args: T) => void) => (...args: T) => {
    onOpenChange(false)
    action(...args)
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="start" closeLabel={t.close} data-testid="rail-drawer" className="data-[side=start]:w-[min(19rem,88vw)]">
        <SheetHeader className="sr-only">
          <SheetTitle>{t.shell.menu}</SheetTitle>
          <SheetDescription>{t.shell.rail}</SheetDescription>
        </SheetHeader>
        <RailContent
          {...rail}
          onHome={closing(rail.onHome)}
          onNew={closing(rail.onNew)}
          onOpenEntry={closing(rail.onOpenEntry)}
        />
      </SheetContent>
    </Sheet>
  )
}
