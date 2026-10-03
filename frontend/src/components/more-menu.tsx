import { ClipboardCopy, FileJson, Printer } from 'lucide-react'
import type { ReactNode } from 'react'

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useI18n } from '@/lib/i18n'

/**
 * Narrow screens: reviewer mode and export behind one menu. Loaded by the header the first time
 * its button is used, so it can be born open.
 */
export default function MoreMenu({
  children,
  defaultOpen,
  hasReport,
  reviewerMode,
  onReviewerModeChange,
  onExportJson,
  onExportHtml,
  onCopyReport,
}: {
  children: ReactNode
  defaultOpen?: boolean
  hasReport: boolean
  reviewerMode: boolean
  onReviewerModeChange: (on: boolean) => void
  onExportJson: () => void
  onExportHtml: () => void
  onCopyReport?: () => void
}) {
  const { t } = useI18n()
  return (
    <DropdownMenu defaultOpen={defaultOpen}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuCheckboxItem
          checked={reviewerMode}
          onCheckedChange={(checked) => onReviewerModeChange(checked === true)}
        >
          {t.header.reviewerMode}
        </DropdownMenuCheckboxItem>
        {hasReport ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{t.header.export}</DropdownMenuLabel>
            <DropdownMenuItem onSelect={onExportHtml}>
              <Printer aria-hidden="true" />
              {t.exportMenu.html}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onExportJson}>
              <FileJson aria-hidden="true" />
              {t.exportMenu.json}
            </DropdownMenuItem>
            {onCopyReport ? (
              <DropdownMenuItem onSelect={onCopyReport}>
                <ClipboardCopy aria-hidden="true" />
                {t.copy.report}
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
