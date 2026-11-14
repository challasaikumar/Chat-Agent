export type BillingPeriod = "month" | "year" | "week" | "day" | "one_time" | "unknown";
export type BillingBasis = "monthly" | "annually" | "weekly" | "daily" | "one_time" | "unknown";
export type PricingUnit =
  | "per_user"
  | "per_seat"
  | "per_organization"
  | "per_project"
  | "per_compute"
  | "usage"
  | "flat"
  | "unknown";

export type NormalizedPrice = {
  original: string;
  amount: string | null;
  currency: string | null;
  billingPeriod: BillingPeriod;
  billingBasis: BillingBasis;
  unit: PricingUnit;
  planName: string | null;
  seatCount: number | null;
  isPromotional: boolean;
  region: string | null;
};
