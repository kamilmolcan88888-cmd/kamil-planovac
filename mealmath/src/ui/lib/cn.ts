import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Teach tailwind-merge our type scale, otherwise `text-body` (a size) would be mistaken for a
// colour and silently remove `text-on-primary`.
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ['hero', 'title', 'section', 'card', 'body', 'support', 'caption'] } },
});

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
