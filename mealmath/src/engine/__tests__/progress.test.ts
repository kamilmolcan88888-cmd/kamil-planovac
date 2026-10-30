import { paceFor, weightTrend, type WeightEntry } from '../progress';

const w = (date: string, kg: number): WeightEntry => ({ date, kg });

describe('weightTrend', () => {
  it('is undefined without entries', () => expect(weightTrend([])).toBeUndefined());

  it('gives the change but no weekly slope for few or close entries', () => {
    const t = weightTrend([w('2026-01-10', 80), w('2026-01-12', 79.5)])!;
    expect(t.changeKg).toBe(-0.5);
    expect(t.perWeekKg).toBeUndefined();
  });

  it('fits a weekly slope regardless of input order', () => {
    const t = weightTrend([w('2026-01-15', 79), w('2026-01-01', 80), w('2026-01-08', 79.5)])!;
    expect(t.first.date).toBe('2026-01-01');
    expect(t.last.kg).toBe(79);
    expect(t.perWeekKg).toBe(-0.5);
  });
});

describe('paceFor', () => {
  const trend = (perWeek: number) => ({ first: w('2026-01-01', 80), last: w('2026-02-01', 80), changeKg: 0, perWeekKg: perWeek });
  it('needs data', () => expect(paceFor('lose', undefined)).toBe('few_data'));
  it('loss 0.25–1 % per week is on track', () => expect(paceFor('lose', trend(-0.5))).toBe('on_track'));
  it('loss above 1 % per week is too fast', () => expect(paceFor('lose', trend(-1.2))).toBe('too_fast'));
  it('barely moving while losing is too slow', () => expect(paceFor('lose', trend(-0.1))).toBe('too_slow'));
  it('gaining while losing is the wrong direction', () => expect(paceFor('lose', trend(0.4))).toBe('wrong_direction'));
  it('gain 0.1–0.5 % per week is on track', () => expect(paceFor('gain', trend(0.2))).toBe('on_track'));
  it('maintain within ±0.25 %', () => { expect(paceFor('maintain', trend(0.1))).toBe('on_track'); expect(paceFor('maintain', trend(-0.6))).toBe('wrong_direction'); });
});
