// Shared building blocks: buttons, cards, banners and simple states.
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Info, Loader2, RefreshCw, type LucideIcon } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../lib/cn';

const button = cva(
  'pressable inline-flex items-center justify-center gap-2 font-semibold select-none disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-on-primary hover:bg-primary-strong',
        secondary: 'bg-surface-2 text-text hover:bg-border',
        ghost: 'text-primary hover:bg-surface-2',
      },
      size: {
        lg: 'h-[54px] px-6 text-body rounded-button w-full',
        md: 'h-11 px-4 text-support rounded-button',
        sm: 'h-9 px-3 text-caption rounded-xl',
      },
    },
    defaultVariants: { variant: 'primary', size: 'lg' },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { icon?: LucideIcon };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, icon: Icon, children, ...rest }, ref) => (
  <button ref={ref} type="button" className={cn(button({ variant, size }), className)} {...rest}>
    {Icon && <Icon aria-hidden className="size-5 shrink-0" />}
    {children}
  </button>
));
Button.displayName = 'Button';

export const PrimaryButton = (p: Omit<ButtonProps, 'variant'>) => <Button variant="primary" {...p} />;
export const SecondaryButton = (p: Omit<ButtonProps, 'variant'>) => <Button variant="secondary" {...p} />;

/** Round 44×44 icon button with a required accessible label. */
export const IconButton = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }>(
  ({ icon: Icon, label, className, ...rest }, ref) => (
    <button ref={ref} type="button" aria-label={label} title={label}
      className={cn('pressable inline-flex size-11 items-center justify-center rounded-full bg-surface text-text shadow-card', className)} {...rest}>
      <Icon aria-hidden className="size-5" />
    </button>
  ),
);
IconButton.displayName = 'IconButton';

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('rounded-card bg-surface p-4 shadow-card sm:p-5', className)} {...rest} />;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <h2 className="text-section font-[650] tracking-tight">{children}</h2>
      {action}
    </div>
  );
}

export function Banner({ tone = 'info', children, icon }: { tone?: 'info' | 'warning' | 'error'; children: ReactNode; icon?: LucideIcon }) {
  const Icon = icon ?? (tone === 'info' ? Info : AlertTriangle);
  const tones = { info: 'bg-success-bg text-text', warning: 'bg-warning-bg text-text', error: 'bg-error-bg text-text' };
  const iconTone = { info: 'text-primary', warning: 'text-warning', error: 'text-error' };
  return (
    <div role={tone === 'info' ? 'note' : 'alert'} className={cn('flex gap-3 rounded-2xl p-3.5 text-support', tones[tone])}>
      <Icon aria-hidden className={cn('mt-0.5 size-5 shrink-0', iconTone[tone])} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-surface-2 text-primary">
        <Icon aria-hidden className="size-8" />
      </div>
      <h2 className="text-card font-semibold">{title}</h2>
      {text && <p className="mt-2 max-w-xs text-support text-text-2">{text}</p>}
      {action && <div className="mt-6 w-full max-w-xs">{action}</div>}
    </div>
  );
}

export function LoadingState({ title, text }: { title: string; text?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-col items-center px-6 py-16 text-center">
      <Loader2 aria-hidden className="mb-4 size-8 animate-spin text-primary" />
      <p className="text-card font-semibold">{title}</p>
      {text && <p className="mt-2 max-w-xs text-support text-text-2">{text}</p>}
    </div>
  );
}

export function ErrorState({ title, detail, onRetry }: { title: string; detail?: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center px-6 py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-3xl bg-error-bg text-error">
        <AlertTriangle aria-hidden className="size-8" />
      </div>
      <p className="text-card font-semibold">{title}</p>
      {detail && <p className="mt-2 max-w-xs break-words text-caption text-text-2">{detail}</p>}
      {onRetry && <div className="mt-6 w-full max-w-xs"><SecondaryButton icon={RefreshCw} onClick={onRetry}>{t('plan.retry')}</SecondaryButton></div>}
    </div>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('num inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-caption font-medium text-text-2', className)}>{children}</span>;
}
