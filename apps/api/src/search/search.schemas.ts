import { z } from "zod";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const domainSchema = z
  .string()
  .trim()
  .min(1)
  .max(253)
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i,
    "Invalid domain",
  )
  .transform((value) => value.toLowerCase());

const calendarDateSchema = z
  .string()
  .regex(DATE_RE, "Expected YYYY-MM-DD")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number) as [
      number,
      number,
      number,
    ];
    const probe = new Date(Date.UTC(year, month - 1, day));
    return (
      probe.getUTCFullYear() === year &&
      probe.getUTCMonth() + 1 === month &&
      probe.getUTCDate() === day
    );
  }, "Invalid calendar date");

const searchFields = {
  query: z
    .string()
    .transform((value) => value.trim())
    .pipe(z.string().min(1, "Query is required").max(400)),
  searchDepth: z.enum(["basic", "advanced", "fast", "ultra-fast"]).optional(),
  topic: z.enum(["general", "news", "finance"]).optional(),
  maxResults: z.coerce.number().int().min(1).max(20).optional(),
  timeRange: z.enum(["day", "week", "month", "year"]).optional(),
  startDate: calendarDateSchema.optional(),
  endDate: calendarDateSchema.optional(),
  includeDomains: z.array(domainSchema).max(20).optional(),
  excludeDomains: z.array(domainSchema).max(20).optional(),
  country: z.string().trim().min(1).max(100).optional(),
  includeRawContent: z
    .union([z.boolean(), z.enum(["markdown", "text"])])
    .optional(),
};

function refineSearchDatesAndDomains<
  T extends {
    startDate?: string;
    endDate?: string;
    includeDomains?: string[];
    excludeDomains?: string[];
  },
>(value: T, ctx: z.RefinementCtx): void {
  if (value.startDate && value.endDate && value.startDate > value.endDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "startDate must not be after endDate",
      path: ["startDate"],
    });
  }

  if (value.includeDomains?.length && value.excludeDomains?.length) {
    const excluded = new Set(value.excludeDomains);
    const overlap = value.includeDomains.filter((domain) => excluded.has(domain));
    if (overlap.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Domains cannot appear in both include and exclude: ${overlap.join(", ")}`,
        path: ["includeDomains"],
      });
    }
  }
}

export const searchInputSchema = z
  .object(searchFields)
  .strict()
  .superRefine(refineSearchDatesAndDomains);

export type ValidatedSearchInput = z.infer<typeof searchInputSchema>;

export const researchSearchBodySchema = z
  .object({
    conversationId: z.string().uuid(),
    ...searchFields,
  })
  .strict()
  .superRefine(refineSearchDatesAndDomains);

export type ResearchSearchBody = z.infer<typeof researchSearchBodySchema>;
