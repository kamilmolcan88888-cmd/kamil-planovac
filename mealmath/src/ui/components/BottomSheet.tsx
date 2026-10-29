import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Accessible bottom sheet (Radix Dialog): focus trap, Esc to close, swipe-free tap targets. */
export function BottomSheet({ open, onOpenChange, title, description, children }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; children: ReactNode;
}) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-40 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[88dvh] max-w-lg overflow-y-auto rounded-t-[28px] bg-surface px-5 pt-3 shadow-float outline-none"
                style={{ paddingBottom: 'calc(20px + var(--safe-bottom))' }}
                initial={reduce ? { opacity: 0 } : { y: '100%' }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: '100%' }}
                transition={{ type: 'tween', ease: [0.2, 0.8, 0.2, 1], duration: 0.28 }}
              >
                <div aria-hidden className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-border" />
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <Dialog.Title className="text-section font-[650] tracking-tight">{title}</Dialog.Title>
                    {description && <Dialog.Description className="mt-1 text-support text-text-2">{description}</Dialog.Description>}
                  </div>
                  <Dialog.Close aria-label={t('common.close')} className="pressable -mr-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-2">
                    <X aria-hidden className="size-5" />
                  </Dialog.Close>
                </div>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
