import { hashPin, isValidPin, lockoutSeconds, newSalt, shouldRelock, verifyPin } from '../pin';

describe('pin', () => {
  it('verifies the right PIN and rejects a wrong one', async () => {
    const salt = newSalt();
    const hash = await hashPin('1234', salt);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(await verifyPin('1234', salt, hash)).toBe(true);
    expect(await verifyPin('1235', salt, hash)).toBe(false);
  });

  it('uses the salt: same PIN, different salt → different hash', async () => {
    expect(await hashPin('1234', 'a')).not.toBe(await hashPin('1234', 'b'));
    expect(newSalt()).not.toBe(newSalt());
  });

  it('validates PIN shape', () => {
    expect(isValidPin('1234', 4)).toBe(true);
    expect(isValidPin('123', 4)).toBe(false);
    expect(isValidPin('12a4', 4)).toBe(false);
    expect(isValidPin('123456', 6)).toBe(true);
  });

  it('slows down after repeated failures', () => {
    expect([0, 4].map(lockoutSeconds)).toEqual([0, 0]);
    expect([5, 6, 7].map(lockoutSeconds)).toEqual([30, 60, 120]);
    expect(lockoutSeconds(50)).toBe(600);
  });

  it('relocks only after 30 s in the background', () => {
    expect(shouldRelock(undefined, 100_000)).toBe(false);
    expect(shouldRelock(90_000, 100_000)).toBe(false);
    expect(shouldRelock(60_000, 100_000)).toBe(true);
  });
});
