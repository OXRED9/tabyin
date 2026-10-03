import { Copy, Download, Share2 } from 'lucide-react'
import { useCallback, useMemo, useRef, useState } from 'react'

import { ClaimCardImage, SummaryCardImage } from '@/components/share/verdict-card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useTheme } from '@/hooks/use-theme'
import { requestShareCard } from '@/lib/api'
import type { ShareCardRequest } from '@/lib/api'
import { appUrlOf } from '@/lib/features'
import { useI18n } from '@/lib/i18n'
import { notify } from '@/lib/notify'
import {
  CARD_HEIGHT,
  CARD_PALETTE,
  CARD_WIDTH,
  canShareFiles,
  cardFileName,
  copyImage,
  downloadBlob,
  renderCardPng,
  shareFile,
} from '@/lib/share-card'
import type { CardSize, CardTheme } from '@/lib/share-card'
import type { Card, EvidenceState, Meta, Summary } from '@/lib/types'
import { cn } from '@/lib/utils'

export type ShareTarget =
  | { kind: 'claim'; card: Card; overrideState: EvidenceState | null }
  | {
      kind: 'summary'
      summary: Summary
      counts: Record<EvidenceState, number>
      total: number
      reviewed: boolean
      /** The title of what was checked, when the report has one. */
      title: string | null
    }

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: string; hint?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="space-y-1">
      <p className="text-sm text-quiet">{label}</p>
      <div role="group" aria-label={label} className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-10 flex-1 items-center justify-center gap-2 rounded-control border px-3 text-sm whitespace-nowrap transition-colors duration-150',
              value === option.value
                ? 'border-green bg-accent font-semibold text-ink'
                : 'border-rule-strong text-quiet hover:text-ink',
            )}
          >
            {option.label}
            {option.hint ? (
              <span dir="ltr" className="tabular font-normal">
                {option.hint}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * F3 «مشاركة بطاقة التثبّت». A live preview of the card (the real template, scaled down), a choice
 * of size and theme, and the actions the device supports: the share sheet where files can be
 * shared, otherwise download and copy. The language follows the interface.
 */
export default function ShareCardDialog({
  target,
  meta,
  onClose,
}: {
  target: ShareTarget | null
  meta: Meta | null
  onClose: () => void
}) {
  const { t, lang } = useI18n()
  const page = useTheme()
  const [size, setSize] = useState<CardSize>('portrait')
  const [theme, setTheme] = useState<CardTheme>(page.theme)
  const [busy, setBusy] = useState<'share' | 'download' | 'copy' | null>(null)
  const [frameWidth, setFrameWidth] = useState(0)
  const node = useRef<HTMLDivElement | null>(null)
  const shareable = useMemo(() => canShareFiles(), [])
  const appUrl = appUrlOf(meta)

  // The preview is the template itself, scaled to the width the dialog gives it. A callback ref,
  // because the dialog's content is portalled in after this component's own effects have run.
  const frame = useCallback((element: HTMLDivElement | null) => {
    if (!element) return
    // The frame has 12px of padding on each side; the card gets what is left.
    const measure = () => setFrameWidth(Math.max(0, element.clientWidth - 24))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  if (!target) return null

  // A portrait card is tall: cap its preview height so the actions stay on screen.
  const maxPreviewHeight = 420
  const scale = Math.min(frameWidth / CARD_WIDTH || 0.2, maxPreviewHeight / CARD_HEIGHT[size])
  const state = target.kind === 'claim' ? (target.overrideState ?? target.card.state) : 'summary'
  const filename = cardFileName(state, size, theme)

  /** Client-side first; if drawing throws, the backend draws the same card. */
  const produce = async (): Promise<Blob> => {
    try {
      if (!node.current) throw new Error('template not mounted')
      return await renderCardPng(node.current, size, CARD_PALETTE[theme].paper)
    } catch {
      const payload: ShareCardRequest =
        target.kind === 'claim'
          ? { kind: 'claim', size, theme, lang, card: target.card, override_state: target.overrideState }
          : {
              kind: 'summary',
              size,
              theme,
              lang,
              summary: { ...target.summary, total: target.total, by_state: target.counts },
              human_reviewed: target.reviewed,
            }
      return requestShareCard(payload)
    }
  }

  const run = async (action: 'share' | 'download' | 'copy') => {
    if (busy) return
    setBusy(action)
    try {
      const blob = await produce()
      if (action === 'share') {
        if (await shareFile(blob, filename, `${t.share.footer} — ${appUrl}`)) notify((toast) => toast(t.share.shared))
      } else if (action === 'download') {
        downloadBlob(blob, filename)
        notify((toast) => toast(t.share.downloaded))
      } else if (await copyImage(blob)) {
        notify((toast) => toast(t.share.copied))
      } else {
        notify((toast) => toast.error(t.share.copyFailed))
      }
    } catch {
      notify((toast) => toast.error(t.share.failed))
    } finally {
      setBusy(null)
    }
  }

  const shell = { size, theme, lang, t, appUrl, nodeRef: node }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t.close} className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.share.button}</DialogTitle>
          <DialogDescription>{t.share.description}</DialogDescription>
        </DialogHeader>

        <div className="grid min-w-0 gap-3">
          <Choice
            label={t.share.size}
            value={size}
            onChange={setSize}
            options={[
              { value: 'portrait', label: t.share.portrait, hint: '1080×1350' },
              { value: 'square', label: t.share.square, hint: '1080×1080' },
            ]}
          />
          <Choice
            label={t.share.theme}
            value={theme}
            onChange={setTheme}
            options={[
              { value: 'light', label: t.share.light },
              { value: 'dark', label: t.share.dark },
            ]}
          />
        </div>

        <div
          ref={frame}
          aria-label={t.share.preview}
          role="group"
          className="flex min-w-0 justify-center overflow-hidden rounded-sheet border bg-desk p-3"
        >
          {/* A box the size of the scaled card; the full-size template sits inside it, scaled. */}
          <div
            dir="ltr"
            data-testid="share-preview"
            className="shrink-0 overflow-hidden"
            style={{ width: CARD_WIDTH * scale, height: CARD_HEIGHT[size] * scale }}
          >
            <div style={{ width: CARD_WIDTH, height: CARD_HEIGHT[size], transform: `scale(${scale})`, transformOrigin: '0 0' }}>
              {target.kind === 'claim' ? (
                <ClaimCardImage
                  {...shell}
                  card={target.card}
                  overrideState={target.overrideState}
                  verse={meta?.abstention_verse ?? null}
                />
              ) : (
                <SummaryCardImage
                  {...shell}
                  total={target.total}
                  counts={target.counts}
                  reviewed={target.reviewed}
                  title={target.title}
                />
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row" aria-live="polite">
          {shareable ? (
            <Button type="button" size="xl" className="flex-1 px-4" disabled={!!busy} onClick={() => void run('share')}>
              <Share2 aria-hidden="true" />
              {busy === 'share' ? t.share.preparing : t.share.send}
            </Button>
          ) : null}
          <Button
            type="button"
            variant={shareable ? 'outline' : 'default'}
            size="xl"
            className="flex-1 px-4"
            disabled={!!busy}
            data-testid="share-download"
            onClick={() => void run('download')}
          >
            <Download aria-hidden="true" />
            {busy === 'download' ? t.share.preparing : t.share.download}
          </Button>
          {shareable ? null : (
            <Button
              type="button"
              variant="outline"
              size="xl"
              className="flex-1 px-4"
              disabled={!!busy}
              data-testid="share-copy"
              onClick={() => void run('copy')}
            >
              <Copy aria-hidden="true" />
              {busy === 'copy' ? t.share.preparing : t.share.copyImage}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
