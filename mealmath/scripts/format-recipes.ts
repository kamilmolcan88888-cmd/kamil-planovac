/** Rewrites data/recipes/*.json in the compact house style (one ingredient per line). npm run format:recipes */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Recipe } from '../src/engine/types';

const DIR = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'data/recipes');
const j = (v: unknown) => JSON.stringify(v);
const inline = (o: Record<string, unknown>) => `{ ${Object.entries(o).map(([k, v]) => `${j(k)}: ${j(v)}`).join(', ')} }`;

export function formatRecipes(rs: Recipe[]): string {
  const one = (r: Recipe) => [
    '  {',
    `    "id": ${j(r.id)},`,
    `    "name": ${inline(r.name)},`,
    `    "meals": ${j(r.meals).replace(/,/g, ', ')}, "timeMin": ${r.timeMin}, "equipment": ${j(r.equipment).replace(/,/g, ', ')}, "tags": ${j(r.tags).replace(/,/g, ', ')}, "cuisine": ${j(r.cuisine)},`,
    `    "batch": ${inline(r.batch)},`,
    '    "ingredients": [',
    r.ingredients.map(i => `      ${inline({ food: i.food, g: i.g, min: i.min, max: i.max })}`).join(',\n'),
    '    ],',
    '    "steps": {',
    Object.entries(r.steps).map(([l, s]) => `      ${j(l)}: [${s!.map(j).join(', ')}]`).join(',\n'),
    '    }',
    '  }',
  ].join('\n');
  return `[\n${rs.map(one).join(',\n')}\n]\n`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const f of readdirSync(DIR).filter(f => f.endsWith('.json'))) {
    const p = join(DIR, f);
    writeFileSync(p, formatRecipes(JSON.parse(readFileSync(p, 'utf8'))));
    console.log(`✓ ${f}`);
  }
}
