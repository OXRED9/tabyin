import { X } from 'lucide-react'
import { useSyncExternalStore } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n'
import { acceptInstall, dismissInstall, installOffer, subscribeInstall } from '@/lib/pwa'

/**
 * The offer to install, made once and quietly: a line in a finished report's footer, never on
 * load. Where the browser can install the app it has a «تثبيت» button; on iOS Safari it says how
 * to add the app by hand, and that sharing into it is not possible there. Closing it is remembered.
 */
export function InstallLine() {
  const { t } = useI18n()
  const offer = useSyncExternalStore(subscribeInstall, installOffer)
  if (!offer) return null
  return (
    <div data-testid="install-line" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-quiet print:hidden">
      <p className="min-w-0 flex-1">{offer === 'ios' ? t.pwa.ios : t.pwa.install}</p>
      {offer === 'prompt' ? (
        <Button type="button" variant="outline" size="sm" onClick={() => void acceptInstall()}>
          {t.pwa.installButton}
        </Button>
      ) : null}
      <Button type="button" variant="ghost" size="icon-sm" aria-label={t.pwa.dismiss} onClick={dismissInstall}>
        <X aria-hidden="true" />
      </Button>
    </div>
  )
}
