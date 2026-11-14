import type {
  BillingBasis,
  BillingPeriod,
  NormalizedPrice,
  PricingUnit,
} from "./pricing.types.js";

const CURRENCY_SYMBOLS: Record<string, string> = {
  $: "USD",
  "€": "EUR",
  "£": "GBP",
  "₹": "INR",
};

const CURRENCY_CODES = new Set(["USD", "EUR", "GBP", "INR", "CAD", "AUD", "JPY"]);

function toAmountString(raw: string): string | null {
  const cleaned = raw.replace(/,/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    return null;
  }
  const [whole, frac = ""] = cleaned.split(".");
  const cents = (frac + "00").slice(0, 2);
  return `${whole}.${cents}`;
}

function detectCurrency(text: string): string | null {
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (text.includes(symbol)) {
      return code;
    }
  }
  const code = /\b(USD|EUR|GBP|INR|CAD|AUD|JPY)\b/i.exec(text)?.[1];
  if (code && CURRENCY_CODES.has(code.toUpperCase())) {
    return code.toUpperCase();
  }
  return null;
}

function detectBilling(text: string): {
  period: BillingPeriod;
  basis: BillingBasis;
} {
  const lower = text.toLowerCase();
  if (/\b(per\s+year|\/\s*year|\/yr|annually|yearly)\b/.test(lower)) {
    return { period: "year", basis: "annually" };
  }
  if (/\b(per\s+month|\/\s*mo|\/\s*month|monthly)\b/.test(lower)) {
    return { period: "month", basis: "monthly" };
  }
  if (/\b(per\s+week|weekly|\/wk)\b/.test(lower)) {
    return { period: "week", basis: "weekly" };
  }
  if (/\b(per\s+day|daily|\/day)\b/.test(lower)) {
    return { period: "day", basis: "daily" };
  }
  if (/\b(one[- ]time|once)\b/.test(lower)) {
    return { period: "one_time", basis: "one_time" };
  }
  return { period: "unknown", basis: "unknown" };
}

function detectUnit(text: string): PricingUnit {
  const lower = text.toLowerCase();
  if (/\b(per\s+user|\/\s*user|per[- ]seat|\/\s*seat)\b/.test(lower)) {
    return /\bseat\b/.test(lower) ? "per_seat" : "per_user";
  }
  if (/\b(per\s+org|per\s+organization|per\s+account|flat)\b/.test(lower)) {
    return "per_organization";
  }
  if (/\b(per\s+project)\b/.test(lower)) {
    return "per_project";
  }
  if (/\b(per\s+compute|compute unit)\b/.test(lower)) {
    return "per_compute";
  }
  if (/\b(usage[- ]based|pay as you go|metered)\b/.test(lower)) {
    return "usage";
  }
  return "flat";
}

function detectPlan(text: string): string | null {
  const match =
    /\b(free|hobby|starter|basic|pro|professional|team|business|enterprise|plus|growth|scale)\b/i.exec(
      text,
    );
  return match?.[1] ? match[1] : null;
}

/**
 * Deterministic pricing parser. Preserves nulls when unsupported.
 */
export function normalizePricingText(
  text: string,
  options: { planName?: string | null; seatCount?: number | null } = {},
): NormalizedPrice {
  const currency = detectCurrency(text);
  const billing = detectBilling(text);
  const unit = detectUnit(text);
  const isPromotional = /\b(promo|promotional|discount|intro|trial)\b/i.test(text);

  const amountMatch =
    /(?:USD|EUR|GBP|INR|CAD|AUD|JPY|\$|€|£|₹)\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)|([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]+)?|[0-9]+(?:\.[0-9]+)?)\s*(?:USD|EUR|GBP|INR)/i.exec(
      text,
    );

  const rawAmount = amountMatch?.[1] ?? amountMatch?.[2] ?? null;
  const amount = rawAmount ? toAmountString(rawAmount) : null;

  return {
    original: text.trim(),
    amount,
    currency,
    billingPeriod: billing.period,
    billingBasis: billing.basis,
    unit,
    planName: options.planName ?? detectPlan(text),
    seatCount: options.seatCount ?? null,
    isPromotional,
    region: null,
  };
}
