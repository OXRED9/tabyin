import { cn } from '@/lib/utils'

/** The mark from the pitch deck: a gold tile with a green seal, laid over its outlined source. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn('size-8', className)}>
      <rect
        x="13"
        y="13"
        width="15"
        height="15"
        rx="4.5"
        fill="#ffffff"
        fillOpacity="0.16"
        stroke="#ffffff"
        strokeOpacity="0.7"
        strokeWidth="2"
      />
      <rect x="4" y="4" width="17" height="17" rx="5" fill="var(--gold)" />
      <circle cx="12.5" cy="12.5" r="4.4" fill="var(--header)" />
    </svg>
  )
}
