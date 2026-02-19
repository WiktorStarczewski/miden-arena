/**
 * Truncate a Miden account ID for display.
 * e.g. "mtst1abc...xyz" → "mtst1abc...xyz" (first 10 + last 6)
 */
export function truncateAccountId(id: string, prefixLen = 10, suffixLen = 6): string {
  if (id.length <= prefixLen + suffixLen + 3) return id;
  return `${id.slice(0, prefixLen)}...${id.slice(-suffixLen)}`;
}

/**
 * Format a MIDEN amount (6 decimals) for display.
 * e.g. 10_000_000n → "10.000000"
 */
export function formatMiden(units: bigint, decimals = 6): string {
  const str = units.toString().padStart(decimals + 1, "0");
  const whole = str.slice(0, -decimals);
  const frac = str.slice(-decimals);
  return `${whole}.${frac}`;
}

/**
 * Format a MIDEN amount with short display (trim trailing zeros).
 * e.g. 10_000_000n → "10"
 */
export function formatMidenShort(units: bigint, decimals = 6): string {
  const full = formatMiden(units, decimals);
  const [whole, frac] = full.split(".");
  const trimmed = frac.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}
