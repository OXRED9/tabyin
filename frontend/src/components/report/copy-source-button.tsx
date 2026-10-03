import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { copyText } from '@/lib/clipboard'
import { useI18n } from '@/lib/i18n'
import { notify } from '@/lib/notify'
import type { SourceRef } from '@/lib/types'

/**
 * F4: one click copies `card.copy_text` exactly as the API built it: the source's wording with
 * its reference (and grading), never the wording as quoted by the content.
 */
export function CopySourceButton({ text, kind }: { text: string; kind: SourceRef['kind'] | null }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current)
    },
    [],
  )

  const label = kind === 'quran' ? t.copy.ayah : kind === 'hadith' ? t.copy.hadith : t.copy.source

  const copy = async () => {
    if (await copyText(text)) {
      setCopied(true)
      notify((toast) => toast(t.copy.done))
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), 2000)
    } else {
      notify((toast) => toast.error(t.copy.failed))
    }
  }

  return (
    <TooltipProvider delayDuration={300}>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="outline" size="touch" data-testid="copy-source" onClick={() => void copy()}>
          {copied ? <Check aria-hidden="true" className="text-green" /> : <Copy aria-hidden="true" />}
          {label}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{t.copy.hint}</TooltipContent>
    </Tooltip>
    </TooltipProvider>
  )
}
