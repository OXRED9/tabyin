import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/**
 * The brand's mark, as in the pitch deck and the favicon (public/favicon.svg): a gold tile with a
 * green seal, laid over its outlined source. It is the one place besides the verified ring where
 * gold appears: it is the brand's own. The static shell in index.html draws the same SVG.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-7 shrink-0', className)}>
      <rect width="32" height="32" rx="7" fill="var(--logo-tile)" />
      <rect
        x="13"
        y="13"
        width="13"
        height="13"
        rx="4"
        fill="#ffffff"
        fillOpacity="0.18"
        stroke="#ffffff"
        strokeOpacity="0.7"
        strokeWidth="2"
      />
      <rect x="6" y="6" width="14" height="14" rx="4.5" fill="var(--gold)" />
      <circle cx="13" cy="13" r="3.6" fill="var(--logo-tile)" />
    </svg>
  )
}

/** The logotype: the name itself, set in the Naskh that the rest of the page is written in. */
export function Logotype({ className }: { className?: string }) {
  const { t } = useI18n()
  return <span className={cn('naskh-display text-xl leading-none text-ink', className)}>{t.appName}</span>
}
