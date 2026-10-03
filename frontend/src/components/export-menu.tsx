import { Download, FileJson, Printer } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/lib/i18n'

/** "تصدير التقرير": JSON (client-side) or a printable HTML page. A menu, not a blocking dialog. */
export function ExportMenu({
  children,
  onExportJson,
  onExportHtml,
  align = 'end',
}: {
  children: ReactNode
  onExportJson: () => void
  onExportHtml: () => void
  align?: 'start' | 'center' | 'end'
}) {
  const { t } = useI18n()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Download aria-hidden="true" className="size-4" />
          {t.header.export}
        </DropdownMenuLabel>
        <DropdownMenuItem onSelect={onExportHtml} className="items-start gap-3 py-2">
          <Printer aria-hidden="true" className="mt-1" />
          <span className="flex flex-col">
            <span className="font-medium">{t.exportMenu.html}</span>
            <span className="text-xs text-muted-foreground">{t.exportMenu.htmlHint}</span>
          </span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportJson} className="items-start gap-3 py-2">
          <FileJson aria-hidden="true" className="mt-1" />
          <span className="flex flex-col">
            <span className="font-medium">{t.exportMenu.json}</span>
            <span className="text-xs text-muted-foreground">{t.exportMenu.jsonHint}</span>
          </span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
