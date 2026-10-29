// Store registry: every prices/<store>.json is picked up automatically.
// Adding a store = adding one JSON file, nothing else.
import type { PriceTable } from '../engine/types';

const files = import.meta.glob<PriceTable>('../../prices/*.json', { eager: true, import: 'default' });

export const PRICE_TABLES: ReadonlyMap<string, PriceTable> = new Map(
  Object.values(files).map(t => [t.store.id, t] as const).sort(([a], [b]) => a.localeCompare(b)),
);

export const STORES = [...PRICE_TABLES.values()].map(t => t.store);
export const DEFAULT_STORE_ID = 'lidl-sk';
