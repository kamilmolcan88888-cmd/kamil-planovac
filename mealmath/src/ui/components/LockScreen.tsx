import { Lock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { db } from '../../state/db';
import { lockoutSeconds, verifyPin } from '../../state/pin';
import { PinPad } from './PinPad';
import { SecondaryButton } from './primitives';

/** Full-screen lock. The app behind it is not rendered at all. */
export function LockScreen({ salt, hash, length, onUnlock }: { salt: string; hash: string; length: number; onUnlock: () => void }) {
  const { t } = useTranslation();
  const failures = useRef(0);
  const [wrong, setWrong] = useState(false);
  const [wait, setWait] = useState(0);
  const [forgot, setForgot] = useState(false);

  useEffect(() => {
    if (wait <= 0) return;
    const id = setInterval(() => setWait(w => Math.max(0, w - 1)), 1000);
    return () => clearInterval(id);
  }, [wait > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const check = async (pin: string) => {
    if (await verifyPin(pin, salt, hash)) { failures.current = 0; setWrong(false); onUnlock(); return; }
    failures.current += 1;
    setWrong(true);
    setWait(lockoutSeconds(failures.current));
    setTimeout(() => setWrong(false), 600);
  };

  const wipe = async () => {
    if (!window.confirm(t('lock.forgotConfirm'))) return;
    db.close();
    await db.delete();
    location.reload();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label={t('lock.title')} className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-bg px-6"
      style={{ paddingTop: 'var(--safe-top)', paddingBottom: 'var(--safe-bottom)' }}>
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-success-bg text-primary"><Lock aria-hidden className="size-7" /></span>
        <h1 className="text-title font-bold">{t('lock.title')}</h1>
        <p role="status" className="min-h-6 text-support text-text-2">{wait > 0 ? t('lock.wait', { seconds: wait }) : wrong ? t('lock.wrong') : t('lock.enter')}</p>
      </div>
      <PinPad length={length} onComplete={pin => void check(pin)} disabled={wait > 0} error={wrong} />
      {forgot ? (
        <div className="max-w-xs text-center">
          <p className="mb-3 text-caption text-text-2">{t('lock.forgotText')}</p>
          <SecondaryButton size="md" onClick={() => void wipe()}>{t('lock.forgotWipe')}</SecondaryButton>
        </div>
      ) : (
        <button type="button" onClick={() => setForgot(true)} className="pressable h-11 px-4 text-support font-semibold text-primary">{t('lock.forgot')}</button>
      )}
    </div>
  );
}
