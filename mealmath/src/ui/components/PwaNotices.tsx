import { Download, RefreshCw, Share, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyUpdate, dismissInstallHint, dismissOfflineReady, shouldShowInstallHint, usePwa } from '../../state/pwa';
import { Banner, Button } from './primitives';

/** New-version prompt, "ready offline" note and the one-time iPhone install hint. */
export function PwaNotices() {
  const { t } = useTranslation();
  const { needRefresh, offlineReady } = usePwa();
  const [hint, setHint] = useState(false);
  useEffect(() => { setHint(shouldShowInstallHint()); }, []);
  useEffect(() => { if (offlineReady) { const id = setTimeout(dismissOfflineReady, 5000); return () => clearTimeout(id); } }, [offlineReady]);

  if (!needRefresh && !offlineReady && !hint) return null;
  return (
    <div className="mb-3 flex flex-col gap-2.5">
      {needRefresh && (
        <Banner tone="info" icon={Download}>
          <span className="flex flex-wrap items-center justify-between gap-2">
            {t('pwa.update')}
            <Button size="sm" icon={RefreshCw} onClick={() => void applyUpdate()}>{t('pwa.reload')}</Button>
          </span>
        </Banner>
      )}
      {offlineReady && <div role="status"><Banner tone="info" icon={WifiOff}>{t('pwa.offlineReady')}</Banner></div>}
      {hint && (
        <Banner tone="info" icon={Share}>
          <strong className="font-semibold">{t('pwa.installTitle')}</strong>
          <span className="mt-0.5 block">{t('pwa.installText')}</span>
          <Button size="sm" variant="ghost" className="-ml-3 mt-1" onClick={() => { dismissInstallHint(); setHint(false); }}>{t('pwa.ok')}</Button>
        </Banner>
      )}
    </div>
  );
}
