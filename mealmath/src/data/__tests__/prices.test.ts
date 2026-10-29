// Integrity of the bundled price tables (prices/*.json).
import { FOOD_MAP, FOODS, RECIPES } from '../catalog';
import { PRICE_TABLES, STORES } from '../stores';
import { checkPriceTable, PriceBook } from '../../engine/pricing';

describe('price tables', () => {
  it('ships exactly the three initial stores', () => {
    expect(STORES.map(s => s.id).sort()).toEqual(['kaufland-sk', 'lidl-de', 'lidl-sk']);
    expect(STORES.find(s => s.id === 'lidl-de')!.lang).toBe('de');
    expect(STORES.find(s => s.id === 'kaufland-sk')!.lang).toBe('sk');
  });

  it.each([...PRICE_TABLES.keys()])('%s is valid, marked as estimate and covers every food', id => {
    const t = PRICE_TABLES.get(id)!;
    expect(checkPriceTable(t, FOOD_MAP)).toEqual([]);
    expect(t.estimate).toBe(true);
    expect(FOODS.filter(f => !(f.id in t.items)).map(f => f.id)).toEqual([]);
  });

  it.each([...PRICE_TABLES.keys()])('%s can cook most recipes', id => {
    const book = new PriceBook(PRICE_TABLES.get(id)!);
    const ok = RECIPES.filter(r => r.ingredients.every(i => i.g === 0 && i.min === 0 ? true : book.isAvailable(i.food)));
    expect(ok.length).toBeGreaterThanOrEqual(70);
  });
});
