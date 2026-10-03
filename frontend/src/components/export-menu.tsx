import { ClipboardCopy, FileJson, Printer } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/lib/i18n'

/**
 * "تصدير التقرير": a printable HTML page, JSON (client-side), or the whole report copied as
 * Markdown. A menu, not a blocking dialog. `onCopyReport` is absent when the copy feature is off.
 */
export function ExportMenu({
  children,
  onExportJson,
  onExportHtml,
  onCopyReport,
  align = 'end',
}: {
  children: ReactNode
  onExportJson: () => void
  onExportHtml: () => void
  onCopyReport?: () => void
  align?: 'start' | 'center' | 'end'
}) {
  const { t } = useI18n()
  const item = (icon: ReactNode, title: string, hint: string) => (
    <>
      {icon}
      <span className="flex flex-col">
        <span className="font-medium">{title}</span>
        <span className="text-quiet">{hint}</span>
      </span>
    </>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-72">
        <DropdownMenuLabel>{t.header.export}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={onExportHtml} className="items-start gap-3">
          {item(<Printer aria-hidden="true" className="mt-1 text-quiet" />, t.exportMenu.html, t.exportMenu.htmlHint)}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onExportJson} className="items-start gap-3">
          {item(<FileJson aria-hidden="true" className="mt-1 text-quiet" />, t.exportMenu.json, t.exportMenu.jsonHint)}
        </DropdownMenuItem>
        {onCopyReport ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCopyReport} className="items-start gap-3">
              {item(<ClipboardCopy aria-hidden="true" className="mt-1 text-quiet" />, t.copy.report, t.copy.reportHint)}
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
