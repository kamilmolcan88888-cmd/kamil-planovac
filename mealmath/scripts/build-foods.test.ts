import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsvLine, parseFoodList } from './build-foods';
import { normalize, scoreMatch } from './match';

describe('food-list.txt', () => {
  const list = parseFoodList(readFileSync(join(__dirname, 'food-list.txt'), 'utf8'));
  it('parses and has ~400 foods', () => expect(list.length).toBeGreaterThanOrEqual(350));
  it('rejects bad lines', () => {
    expect(() => parseFoodList('x | y | a | b | c | nowhere | - | - | 3')).toThrow(/aisle/);
    expect(() => parseFoodList('x | y | a | b | c | meat | wheat | - | 3')).toThrow(/allergen/);
  });
});

describe('csv + matching', () => {
  it('parses quoted CSV', () => expect(parseCsvLine('1,"Beef, ground, 95% lean meat / 5% fat, raw","a ""q"""')).toEqual(['1', 'Beef, ground, 95% lean meat / 5% fat, raw', 'a "q"']));
  it('normalizes', () => expect(normalize('Cheese, cottage, lowfat, 2% milkfat')).toBe('cheese cottage lowfat 2% milkfat'));
  it('prefers same food and state', () => {
    const want = 'Chicken, broilers or fryers, breast, meat only, raw';
    expect(scoreMatch(want, 'Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw'))
      .toBeGreaterThan(scoreMatch(want, 'Chicken, broilers or fryers, breast, meat only, cooked, roasted'));
    expect(scoreMatch(want, 'Turkey, breast, meat only, raw')).toBeLessThan(0.72);
  });
});
