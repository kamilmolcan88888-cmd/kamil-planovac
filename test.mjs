// Run: node test.mjs
import assert from 'node:assert';
import { dayType, nextChange, diffDays, addDays, addMonths, dni } from './js/util.js';

assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
assert.equal(addMonths('2026-02-28', 1, 31), '2026-03-31');   // anchor keeps the 31st
assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
assert.equal(addMonths('2028-02-29', 12), '2029-02-28');      // yearly from leap day

const st = { shift: { start: '2026-10-01', work: 14, off: 7 }, days: {} };
assert.equal(dayType(st, '2026-10-01'), 'work');
assert.equal(dayType(st, '2026-10-14'), 'work');
assert.equal(dayType(st, '2026-10-15'), 'off');
assert.equal(dayType(st, '2026-10-22'), 'work');       // cycle repeats (21 days)
assert.equal(dayType(st, '2026-09-30'), 'off');        // before start, going backwards
assert.equal(dayType(st, '2027-10-01'), dayType(st, addDays('2026-10-01', 365))); // a year ahead
assert.equal(diffDays('2026-03-28', '2026-03-30'), 2); // DST change
assert.deepEqual(nextChange(st, '2026-10-10'), { days: 5, date: '2026-10-15', toWork: false });
st.days['2026-10-15'] = { type: 'work', note: '' };    // manual override extends work
assert.equal(nextChange(st, '2026-10-10').date, '2026-10-16');
st.days['2026-10-16'] = { type: 'vac', note: '' };     // vacation counts as not-work
assert.equal(nextChange(st, '2026-10-10').date, '2026-10-16');
assert.equal(dni(1), '1 deň'); assert.equal(dni(3), '3 dni'); assert.equal(dni(5), '5 dní'); assert.equal(dni(0), '0 dní');
import { parseReceipt } from './js/receipt.js';
let r = parseReceipt(`BILLA s.r.o.\nIČO 31347037\nRohlík 0,12\nMlieko 1,19\nSPOLU EUR 12,48\nDPH 20% 2,08\nHotovosť 20,00\nVrátiť 7,52\nDátum: 24.10.2026 18:03`);
assert.deepEqual(r, { amount: 12.48, date: '2026-10-24', shop: 'BILLA s.r.o.' });
r = parseReceipt(`ARAL Tankstelle\n24/10/26\nSuper E10 45,12 L\nSumme EUR 1.234,56\nMwSt 19% 197,12`);
assert.equal(r.amount, 1234.56); assert.equal(r.date, '2026-10-24');
r = parseReceipt(`Obchod\nchlieb 2.40\nmaslo 3, 10`);       // no keyword: largest price, OCR space after comma
assert.equal(r.amount, 3.10); assert.equal(r.date, null);
import { nextInvoiceNumber } from './js/util.js';
assert.equal(nextInvoiceNumber([], '2026'), '2026001');
assert.equal(nextInvoiceNumber([{ number: '2026009' }, { number: '2025041' }, { number: '2026003' }], '2026'), '2026010');
assert.equal(nextInvoiceNumber([{ number: '2025041' }], '2026'), '2026001');   // new year restarts
console.log('OK');
