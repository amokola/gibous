export const NANOS_PER_GRAM = 1_000_000_000n;

/** Convert a decimal GRAM number to an exact integer nanogram string. */
export function gramsToNano(value: number): string {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid monetary amount');
  const fixed = value.toFixed(9);
  const [whole, fraction = ''] = fixed.split('.');
  return (BigInt(whole) * NANOS_PER_GRAM + BigInt(fraction.padEnd(9, '0'))).toString();
}

/** Convert an exact integer nanogram value to a display number at the API edge. */
export function nanoToGrams(value: string | number | bigint): number {
  const nano = typeof value === 'bigint' ? value : BigInt(String(value));
  return Number(nano) / Number(NANOS_PER_GRAM);
}

export function integerGramsToNano(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid integer monetary amount');
  return (BigInt(value) * NANOS_PER_GRAM).toString();
}
