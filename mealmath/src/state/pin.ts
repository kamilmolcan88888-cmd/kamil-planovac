// App lock. The PIN is stored only as a salted PBKDF2 hash. Honest scope: this hides the app from
// someone holding an unlocked phone; it does not encrypt the data in IndexedDB.
const ITERATIONS = 100_000;

const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b instanceof Uint8Array ? b.buffer : b)].map(x => x.toString(16).padStart(2, '0')).join('');

export const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

export async function hashPin(pin: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', iterations: ITERATIONS, salt: new TextEncoder().encode(salt) }, key, 256);
  return toHex(bits);
}

export async function verifyPin(pin: string, salt: string, hash: string): Promise<boolean> {
  const h = await hashPin(pin, salt);
  let diff = h.length ^ hash.length;
  for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ (hash.charCodeAt(i) || 0);
  return diff === 0;
}

export const isValidPin = (pin: string, length: number) => pin.length === length && /^\d+$/.test(pin);

/** Seconds to wait after repeated wrong PINs: none for 4 tries, then 30 s, doubling up to 10 min. */
export function lockoutSeconds(failures: number): number {
  if (failures < 5) return 0;
  return Math.min(600, 30 * 2 ** (failures - 5));
}

/** Locks again when the app was in the background for longer than this. */
export const RELOCK_AFTER_MS = 30_000;
export const shouldRelock = (hiddenAt: number | undefined, now: number) => hiddenAt !== undefined && now - hiddenAt > RELOCK_AFTER_MS;
