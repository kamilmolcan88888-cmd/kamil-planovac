import { Beef, CookingPot, Drumstick, Egg, Fish, Leaf, Milk, Salad, Sandwich, Soup, Wheat, type LucideIcon } from 'lucide-react';
import type { FoodMap } from '../../engine/nutrition';
import type { MealSlot, Recipe } from '../../engine/types';
import { cn } from '../lib/cn';

/**
 * Food visual. Real photos can be dropped into public/photos/<recipeId>.webp later; until then a
 * calm, generated illustration (main ingredient icon on a tinted tile) is shown. It is clearly an
 * illustration, never a fake photo.
 */
export function iconFor(recipe: Recipe | undefined, foods: FoodMap): LucideIcon {
  if (!recipe) return CookingPot;
  const main = [...recipe.ingredients].sort((a, b) => {
    const pa = foods.get(a.food)?.per100.protein ?? 0, pb = foods.get(b.food)?.per100.protein ?? 0;
    return pb * b.g - pa * a.g;
  })[0];
  const f = main && foods.get(main.food);
  if (recipe.tags.includes('soup') || /soup|polievk|suppe|kapustnic/i.test(recipe.id)) return Soup;
  if (f?.flags.includes('fish')) return Fish;
  if (f?.flags.includes('red_meat')) return Beef;
  if (f?.flags.includes('meat')) return Drumstick;
  if (f?.flags.includes('egg')) return Egg;
  if (f?.flags.includes('dairy')) return recipe.meals.includes('breakfast') ? Milk : Sandwich;
  if (f?.aisle === 'plant_protein' || f?.aisle === 'dry_goods') return recipe.meals.includes('breakfast') ? Wheat : Leaf;
  return Salad;
}

const TINT: Record<MealSlot, string> = {
  breakfast: 'from-[color-mix(in_oklab,var(--c-accent)_55%,var(--c-surface))] to-[color-mix(in_oklab,var(--c-warning)_25%,var(--c-surface))]',
  lunch: 'from-[color-mix(in_oklab,var(--c-primary)_28%,var(--c-surface))] to-[color-mix(in_oklab,var(--c-accent)_40%,var(--c-surface))]',
  dinner: 'from-[color-mix(in_oklab,var(--c-protein)_22%,var(--c-surface))] to-[color-mix(in_oklab,var(--c-primary)_22%,var(--c-surface))]',
  snack: 'from-[color-mix(in_oklab,var(--c-warning)_30%,var(--c-surface))] to-[color-mix(in_oklab,var(--c-accent)_30%,var(--c-surface))]',
};

export function RecipeVisual({ recipe, slot, foods, className, iconClass }: { recipe?: Recipe; slot: MealSlot; foods: FoodMap; className?: string; iconClass?: string }) {
  const Icon = iconFor(recipe, foods);
  return (
    <div aria-hidden className={cn('relative flex items-center justify-center overflow-hidden bg-gradient-to-br', TINT[slot], className)}>
      <div className="absolute -right-6 -top-6 size-28 rounded-full bg-surface/30" />
      <div className="absolute -bottom-8 -left-4 size-24 rounded-full bg-surface/25" />
      <Icon className={cn('relative text-text/70', iconClass ?? 'size-12')} strokeWidth={1.6} />
    </div>
  );
}
