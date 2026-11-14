import { describe, expect, it } from "vitest";
import { normalizePricingText } from "../apps/api/src/temporal/pricing/pricing-normalizer.ts";
import { comparePricingClaims } from "../apps/api/src/temporal/pricing/pricing-calculator.ts";
import {
  compareDecimal,
  decimalPercentageChange,
  decimalSubtract,
} from "../apps/api/src/temporal/comparison/comparison.numeric.ts";
import type { ResearchClaim } from "../apps/api/src/db/schema.ts";

function claim(partial: Partial<ResearchClaim> & Pick<ResearchClaim, "id" | "originalValue" | "numericValue">): ResearchClaim {
  return {
    userId: "u",
    entityId: null,
    entityName: "HubSpot",
    category: "pricing",
    attribute: "list_price",
    normalizedValue: null,
    currency: "USD",
    billingPeriod: "month",
    billingBasis: "monthly",
    unit: "per_organization",
    planName: "Professional",
    region: null,
    seatCount: 20,
    featureName: null,
    sourceId: "src",
    snapshotId: "snap",
    sourceUrl: "https://example.com",
    evidenceExcerpt: partial.originalValue,
    contentHash: "h",
    publishedAt: null,
    effectiveAt: null,
    observedAt: new Date(),
    extractionConfidence: 0.9,
    extractionModel: "test",
    verificationStatus: "verified",
    createdAt: new Date(),
    ...partial,
  };
}

describe("pricing normalization and comparison", () => {
  it("normalizes $25 per month", () => {
    const n = normalizePricingText("$25 per month, billed monthly");
    expect(n.amount).toBe("25.00");
    expect(n.currency).toBe("USD");
    expect(n.billingPeriod).toBe("month");
    expect(n.billingBasis).toBe("monthly");
  });

  it("normalizes annual billing separately", () => {
    const n = normalizePricingText("$240 per year, billed annually");
    expect(n.amount).toBe("240.00");
    expect(n.billingPeriod).toBe("year");
  });

  it("calculates $20 → $25 monthly increase with exact decimals", () => {
    expect(decimalSubtract("25.00", "20.00")).toBe("5.00");
    expect(decimalPercentageChange("25.00", "20.00")).toBe("25.00");
    expect(compareDecimal("25.00", "20.00")).toBe(1);

    const result = comparePricingClaims(
      claim({ id: "h", originalValue: "$20/month", numericValue: "20.00" }),
      claim({ id: "c", originalValue: "$25/month", numericValue: "25.00" }),
    );
    expect(result.changeType).toBe("PRICE_INCREASED");
    expect(result.absoluteDifference).toBe("5.00");
    expect(result.percentageDifference).toBe("25.00");
  });

  it("detects decrease and unchanged", () => {
    expect(
      comparePricingClaims(
        claim({ id: "h", originalValue: "$25", numericValue: "25.00" }),
        claim({ id: "c", originalValue: "$20", numericValue: "20.00" }),
      ).changeType,
    ).toBe("PRICE_DECREASED");

    expect(
      comparePricingClaims(
        claim({ id: "h", originalValue: "$20", numericValue: "20.00" }),
        claim({ id: "c", originalValue: "$20", numericValue: "20.00" }),
      ).changeType,
    ).toBe("PRICE_UNCHANGED");
  });

  it("marks monthly vs annual as not comparable", () => {
    const result = comparePricingClaims(
      claim({
        id: "h",
        originalValue: "$20/month",
        numericValue: "20.00",
        billingPeriod: "month",
      }),
      claim({
        id: "c",
        originalValue: "$240/year",
        numericValue: "240.00",
        billingPeriod: "year",
      }),
    );
    expect(result.changeType).toBe("PRICE_STRUCTURE_CHANGED");
  });

  it("marks per-user vs organization as not comparable", () => {
    const result = comparePricingClaims(
      claim({
        id: "h",
        originalValue: "$20 per user",
        numericValue: "20.00",
        unit: "per_user",
      }),
      claim({
        id: "c",
        originalValue: "$25 per organization",
        numericValue: "25.00",
        unit: "per_organization",
      }),
    );
    expect(result.changeType).toBe("PRICE_STRUCTURE_CHANGED");
  });

  it("does not convert different currencies", () => {
    const result = comparePricingClaims(
      claim({
        id: "h",
        originalValue: "$20",
        numericValue: "20.00",
        currency: "USD",
      }),
      claim({
        id: "c",
        originalValue: "₹1600",
        numericValue: "1600.00",
        currency: "INR",
      }),
    );
    expect(result.changeType).toBe("NOT_COMPARABLE");
    expect(result.reason).toContain("currency");
  });

  it("handles zero historical amount safely", () => {
    expect(decimalPercentageChange("10.00", "0.00")).toBeNull();
  });

  it("handles missing historical amount", () => {
    const result = comparePricingClaims(
      claim({ id: "h", originalValue: "unknown", numericValue: null }),
      claim({ id: "c", originalValue: "$25", numericValue: "25.00" }),
    );
    expect(result.changeType).toBe("NOT_COMPARABLE");
  });
});
