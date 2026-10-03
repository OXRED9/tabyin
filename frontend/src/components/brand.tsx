import { useI18n } from '@/lib/i18n'
import { cn } from '@/lib/utils'

/** The logotype: the name itself, set in the Naskh that the rest of the page is written in. */
export function Logotype({ className }: { className?: string }) {
  const { t } = useI18n()
  return <span className={cn('naskh-display text-xl leading-none text-ink', className)}>{t.appName}</span>
}
