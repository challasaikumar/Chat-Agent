/**
 * Exact decimal arithmetic using integer fixed-point (2 decimal places).
 * Financial comparisons must not use IEEE floats.
 */

function toScaled(value: string): bigint | null {
  const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = BigInt(match[2]!);
  const frac = (match[3] ?? "00").padEnd(2, "0").slice(0, 2);
  return sign * (whole * 100n + BigInt(frac));
}

function fromScaled(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  const whole = abs / 100n;
  const frac = (abs % 100n).toString().padStart(2, "0");
  return `${sign}${whole}.${frac}`;
}

export function decimalSubtract(
  current: string,
  historical: string,
): string | null {
  const a = toScaled(current);
  const b = toScaled(historical);
  if (a === null || b === null) {
    return null;
  }
  return fromScaled(a - b);
}

export function decimalPercentageChange(
  current: string,
  historical: string,
): string | null {
  const a = toScaled(current);
  const b = toScaled(historical);
  if (a === null || b === null) {
    return null;
  }
  if (b === 0n) {
    return null;
  }
  // (a - b) / b * 100, keep 2 decimal places
  const diff = a - b;
  const scaled = (diff * 10000n) / b; // *100 for percent, *100 for 2dp
  return fromScaled(scaled);
}

export function compareDecimal(a: string, b: string): number | null {
  const left = toScaled(a);
  const right = toScaled(b);
  if (left === null || right === null) {
    return null;
  }
  if (left === right) {
    return 0;
  }
  return left > right ? 1 : -1;
}

export function formatSignedMoney(
  difference: string,
  currency: string | null,
  period: string | null,
): string {
  const prefix = difference.startsWith("-") ? "-" : "+";
  const abs = difference.replace(/^-/, "");
  const cur = currency ? `${currency} ` : "";
  const per = period && period !== "unknown" ? `/${period}` : "";
  return `${prefix}${cur}${abs}${per}`;
}
