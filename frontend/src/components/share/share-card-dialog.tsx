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
import { shareLink, shareText } from '@/lib/share-text'
import type { ShareApp, ShareSubject } from '@/lib/share-text'
import type { Card, EvidenceState, Meta, Summary } from '@/lib/types'
import { cn } from '@/lib/utils'

export type ShareTarget =
  | { kind: 'claim'; card: Card }
  | {
      kind: 'summary'
      summary: Summary
      counts: Record<EvidenceState, number>
      total: number
      /** The report's citations, for the card's rows. */
      cards: Card[]
      /** The title of what was checked, when the report has one. */
      title: string | null
    }

type App = ShareApp | 'instagram'

/** Small marks for the named apps, drawn here: nothing is fetched. Each comes with its name as text. */
function AppMark({ app }: { app: App }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {app === 'whatsapp' ? (
        <>
          <path d="M12 3.5a8.5 8.5 0 0 0-7.3 12.8L3.5 20.5l4.3-1.1A8.5 8.5 0 1 0 12 3.5Z" />
          <path d="M9.4 8.4c-.5 1.1.2 2.8 1.6 4.2s3.1 2.1 4.2 1.6l.5-1.3-1.7-.9-.7.7c-.7-.3-1.7-1.3-2-2l.7-.7-.9-1.7Z" />
        </>
      ) : app === 'x' ? (
        <path d="M5 4.5 19 19.5M19 4.5 5 19.5" />
      ) : app === 'telegram' ? (
        <>
          <path d="M20.5 4.5 3.5 11l5 2 2 5.5 3-4 4.5 3.5Z" />
          <path d="m8.5 13 8-5.5-6 7" />
        </>
      ) : (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4.5" />
          <circle cx="12" cy="12" r="3.6" />
          <circle cx="16.6" cy="7.4" r="0.7" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  )
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  /** `hint` is said on hover and to assistive technology: the two groups share one row. */
  options: { value: T; label: string; hint?: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="text-sm text-quiet">{label}</p>
      <div role="group" aria-label={label} className="flex gap-2">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            title={option.hint}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex h-10 min-w-0 flex-1 items-center justify-center rounded-control border px-2 text-sm whitespace-nowrap transition-colors duration-150',
              value === option.value
                ? 'border-green bg-accent font-semibold text-ink'
                : 'border-rule-strong text-quiet hover:text-ink',
            )}
          >
            {option.label}
            {option.hint ? (
              <span dir="ltr" className="sr-only">
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
 * F3 «مشاركة بطاقة التثبّت» (docs/DESIGN.md §8.3). A live preview of the card (the real template,
 * scaled down), its size and theme, and the ways out, in this order: the system's share sheet
 * with the image, where the browser can share files; the named apps, which a web page can only
 * hand text and an address (Instagram takes the image: through the share sheet, or saved first);
 * then saving and copying the image. The language follows the interface.
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
  const [busy, setBusy] = useState<'share' | 'download' | 'copy' | 'instagram' | null>(null)
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

  // A portrait card is tall: cap its preview height so the ways to share stay within reach.
  const maxPreviewHeight = Math.min(420, Math.round(window.innerHeight * 0.34))
  const scale = Math.min(frameWidth / CARD_WIDTH || 0.2, maxPreviewHeight / CARD_HEIGHT[size])
  const filename = cardFileName(target.kind === 'claim' ? target.card.state : 'summary', size, theme)
  const subject: ShareSubject =
    target.kind === 'claim'
      ? { kind: 'claim', card: target.card }
      : { kind: 'summary', total: target.total, counts: target.counts, title: target.title }

  /** Client-side first; if drawing throws, the backend draws the same card. */
  const produce = async (): Promise<Blob> => {
    try {
      if (!node.current) throw new Error('template not mounted')
      return await renderCardPng(node.current, size, CARD_PALETTE[theme].paper)
    } catch {
      const payload: ShareCardRequest =
        target.kind === 'claim'
          ? { kind: 'claim', size, theme, lang, card: target.card }
          : {
              kind: 'summary',
              size,
              theme,
              lang,
              summary: { ...target.summary, total: target.total, by_state: target.counts },
              // What the contract allows: at most 60 cards, a title of at most 300 characters.
              cards: target.cards.slice(0, 60),
              title: target.title ? Array.from(target.title).slice(0, 300).join('') : null,
            }
      return requestShareCard(payload)
    }
  }

  const run = async (action: 'share' | 'download' | 'copy' | 'instagram') => {
    if (busy) return
    setBusy(action)
    try {
      const blob = await produce()
      if (action === 'share' || (action === 'instagram' && shareable)) {
        // The share sheet carries the image, and the verdict as text beside it.
        if (await shareFile(blob, filename, t.appName, shareText(subject, t, { address: appUrl }))) {
          notify((toast) => toast(t.share.shared))
        }
      } else if (action === 'instagram') {
        // No share sheet here: the image is saved, to be posted from the app.
        downloadBlob(blob, filename)
        notify((toast) => toast(t.share.instagramSaved))
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
  const tile =
    'flex h-16 min-w-0 flex-col items-center justify-center gap-1 rounded-control border border-rule-strong text-sm text-ink transition-colors duration-150 hover:bg-accent'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t.close} className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.share.button}</DialogTitle>
          <DialogDescription>{t.share.description}</DialogDescription>
        </DialogHeader>

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
                <ClaimCardImage {...shell} card={target.card} verse={meta?.abstention_verse ?? null} />
              ) : (
                <SummaryCardImage {...shell} total={target.total} counts={target.counts} cards={target.cards} title={target.title} />
              )}
            </div>
          </div>
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3">
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

        <div className="grid min-w-0 gap-3" aria-live="polite">
          {shareable ? (
            <Button type="button" size="xl" className="px-4" disabled={!!busy} data-testid="share-send" onClick={() => void run('share')}>
              <Share2 aria-hidden="true" />
              {busy === 'share' ? t.share.preparing : t.share.send}
            </Button>
          ) : null}

          <div>
            <div role="group" aria-label={t.share.targets} data-testid="share-targets" className="grid grid-cols-4 gap-2">
              {(['whatsapp', 'x', 'telegram'] as const).map((app) => (
                <a
                  key={app}
                  href={shareLink(app, subject, t, appUrl)}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid={`share-${app}`}
                  className={tile}
                >
                  <AppMark app={app} />
                  <span className="max-w-full truncate">{t.share.apps[app]}</span>
                  <span className="sr-only">{t.opensInNewTab}</span>
                </a>
              ))}
              <button type="button" disabled={!!busy} data-testid="share-instagram" onClick={() => void run('instagram')} className={tile}>
                <AppMark app="instagram" />
                <span className="max-w-full truncate">{t.share.apps.instagram}</span>
              </button>
            </div>
            <p className="pt-2 text-sm text-quiet">{t.share.targetsHint}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={shareable ? 'outline' : 'default'}
              size="touch"
              className="px-3"
              disabled={!!busy}
              data-testid="share-download"
              onClick={() => void run('download')}
            >
              <Download aria-hidden="true" />
              {busy === 'download' ? t.share.preparing : t.share.download}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="touch"
              className="px-3"
              disabled={!!busy}
              data-testid="share-copy"
              onClick={() => void run('copy')}
            >
              <Copy aria-hidden="true" />
              {busy === 'copy' ? t.share.preparing : t.share.copyImage}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
