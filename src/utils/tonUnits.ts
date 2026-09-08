/**
 * Utilities for converting between GRAM (display currency) and nanograms (base units on TON Blockchain).
 * 1 GRAM = 1,000,000,000 nanograms (10^9)
 */

export const NANOGRAMS_PER_GRAM = 1_000_000_000n;

/**
 * Converts a decimal GRAM amount to integer nanograms as a string.
 * @param gram Amount in GRAM (e.g. 0.5)
 * @returns Nanograms string (e.g. "500000000")
 */
export function toNanoGram(gram: number): string {
  if (isNaN(gram) || gram <= 0) {
    return '0';
  }
  // Convert using fixed precision to avoid floating point issues
  const fixed = gram.toFixed(9);
  const [whole, fraction = ''] = fixed.split('.');
  const paddedFraction = fraction.padEnd(9, '0').slice(0, 9);
  const nanograms = BigInt(whole) * NANOGRAMS_PER_GRAM + BigInt(paddedFraction);
  return nanograms.toString();
}

/**
 * Converts a nanogram representation (string, number, or bigint) to decimal GRAM.
 * @param nanograms Nanograms as string or bigint
 * @returns Number in GRAM (e.g. 0.5)
 */
export function fromNanoGram(nanograms: string | number | bigint): number {
  if (typeof nanograms === 'number') {
    if (isNaN(nanograms) || nanograms <= 0) return 0;
    return nanograms / 1e9;
  }
  if (typeof nanograms === 'bigint') {
    if (nanograms <= 0n) return 0;
    return Number(nanograms) / 1e9;
  }
  if (typeof nanograms === 'string') {
    const cleaned = nanograms.trim();
    if (!/^\d+$/.test(cleaned)) return 0;
    try {
      const bn = BigInt(cleaned);
      if (bn <= 0n) return 0;
      return Number(bn) / 1e9;
    } catch {
      return 0;
    }
  }
  return 0;
}

/**
 * Formats a GRAM amount with thousands separators and custom decimal places.
 * @param amount Amount in GRAM
 * @param decimals Number of decimal places (default: 2)
 */
export function formatGram(amount: number, decimals: number = 2): string {
  if (isNaN(amount)) return '0.00';
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(amount);
}
