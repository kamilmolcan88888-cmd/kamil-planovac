import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { hashPin, newSalt, verifyPin } from '../../state/pin';
import type { AppSettings } from '../../state/db';
import { updateSettings } from '../../state/store';
import { SegmentedControl } from './controls';
import { PinPad } from './PinPad';
import { Banner, PrimaryButton, SecondaryButton } from './primitives';

type Mode = 'menu' | 'verify-change' | 'verify-remove' | 'new' | 'confirm';

/** Set, change or remove the PIN. Changing or removing first asks for the current one. */
export function PinSettings({ settings, onDone }: { settings: AppSettings; onDone: () => void }) {
  const { t } = useTranslation();
  const has = !!settings.pinHash;
  const [mode, setMode] = useState<Mode>(has ? 'menu' : 'new');
  const [length, setLength] = useState<4 | 6>(settings.pinLength ?? 4);
  const [first, setFirst] = useState('');
  const [msg, setMsg] = useState<string>();
  const [bad, setBad] = useState(false);
  const fail = (m: string) => { setMsg(m); setBad(true); setTimeout(() => setBad(false), 500); };

  const verify = async (pin: string, next: Mode | 'remove') => {
    if (!(await verifyPin(pin, settings.pinSalt!, settings.pinHash!))) { fail(t('lock.wrong')); return; }
    setMsg(undefined);
    if (next === 'remove') { await updateSettings({ pinHash: undefined, pinSalt: undefined, pinLength: undefined }); onDone(); }
    else setMode(next);
  };
  const create = async (pin: string) => {
    if (mode === 'new') { setFirst(pin); setMsg(undefined); setMode('confirm'); return; }
    if (pin !== first) { fail(t('lock.mismatch')); setMode('new'); setFirst(''); return; }
    const salt = newSalt();
    await updateSettings({ pinSalt: salt, pinHash: await hashPin(pin, salt), pinLength: length });
    onDone();
  };

  return (
    <div className="flex flex-col gap-5">
      <Banner tone="info">{t('lock.scope')}</Banner>
      {mode === 'menu' && (
        <div className="flex flex-col gap-2.5">
          <p className="text-support text-text-2">{t('lock.isOn')}</p>
          <PrimaryButton onClick={() => { setMsg(undefined); setMode('verify-change'); }}>{t('lock.change')}</PrimaryButton>
          <SecondaryButton onClick={() => { setMsg(undefined); setMode('verify-remove'); }}>{t('lock.remove')}</SecondaryButton>
        </div>
      )}
      {(mode === 'verify-change' || mode === 'verify-remove') && (
        <div className="flex flex-col items-center gap-5">
          <p className="text-support font-medium">{t('lock.current')}</p>
          <PinPad length={settings.pinLength ?? 4} error={bad} onComplete={pin => void verify(pin, mode === 'verify-change' ? 'new' : 'remove')} />
        </div>
      )}
      {(mode === 'new' || mode === 'confirm') && (
        <div className="flex flex-col items-center gap-5">
          {mode === 'new' && !first && (
            <div className="w-full"><SegmentedControl<'4' | '6'> label={t('lock.length')} value={String(length) as '4' | '6'} onChange={v => setLength(Number(v) as 4 | 6)}
              options={[{ value: '4', label: t('lock.digits', { count: 4 }) }, { value: '6', label: t('lock.digits', { count: 6 }) }]} /></div>
          )}
          <p className="text-support font-medium">{mode === 'new' ? t('lock.newPin') : t('lock.confirmPin')}</p>
          <PinPad key={mode + length} length={length} error={bad} onComplete={pin => void create(pin)} />
        </div>
      )}
      {msg && <p role="alert" className="text-center text-support text-error">{msg}</p>}
    </div>
  );
}
