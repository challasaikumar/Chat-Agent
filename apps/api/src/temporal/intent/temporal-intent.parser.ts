import { DateIntentParser } from "../../agent/context/context.date-parser.js";
import { getZonedParts } from "../../utils/timezone.js";
import type { ChangeCategory, TemporalIntent } from "../temporal.types.js";
import {
  addLocalDays,
  formatCalendarDate,
  localCalendarToday,
  previousWeekdayDate,
} from "./temporal-date.utils.js";

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

const COMPARISON_RE =
  /\b(changed?|change|different|difference|still (the )?same|still correct|updated?|shipped|new feature|since|compared? to|vs\.?|versus|any (of them )?changed|has any)\b/i;

/**
 * Parses temporal comparison intent. Reuses Phase 04 DateIntentParser for
 * absolute/relative calendar expressions, then layers comparison semantics.
 */
export class TemporalIntentParser {
  private readonly dateParser = new DateIntentParser();

  parse(
    text: string,
    options: { timeZone: string; now?: Date },
  ): TemporalIntent {
    const now = options.now ?? new Date();
    const today = localCalendarToday(now, options.timeZone);
    const comparisonDate = formatCalendarDate(today.year, today.month, today.day);
    const lower = text.toLowerCase();

    const isComparison = COMPARISON_RE.test(text);
    const changeCategories = detectCategories(lower);
    const targets = detectTargets(text);

    let startDate: string | null = null;
    let endDate: string | null = null;
    let referenceType: TemporalIntent["referenceType"] = "unknown";
    let originalExpression: string | null = null;
    let ambiguous = false;
    let ambiguityReason: string | null = null;

    // ISO date
    const iso = /\b(\d{4}-\d{2}-\d{2})\b/.exec(text);
    if (iso?.[1]) {
      startDate = iso[1];
      endDate = iso[1];
      referenceType = "explicit_date";
      originalExpression = iso[1];
    }

    // last month
    if (!startDate && /\blast month\b/.test(lower)) {
      const firstThisMonth = { year: today.year, month: today.month, day: 1 };
      const lastOfPrev = addLocalDays(firstThisMonth, -1, options.timeZone);
      const firstOfPrev = { year: lastOfPrev.year, month: lastOfPrev.month, day: 1 };
      startDate = formatCalendarDate(
        firstOfPrev.year,
        firstOfPrev.month,
        firstOfPrev.day,
      );
      endDate = formatCalendarDate(
        lastOfPrev.year,
        lastOfPrev.month,
        lastOfPrev.day,
      );
      referenceType = "relative_date";
      originalExpression = "last month";
    }

    // two days ago
    if (!startDate && /\btwo days ago\b/.test(lower)) {
      const resolved = addLocalDays(today, -2, options.timeZone);
      startDate = formatCalendarDate(resolved.year, resolved.month, resolved.day);
      endDate = startDate;
      referenceType = "relative_date";
      originalExpression = "two days ago";
    }

    // since we last discussed / previous research
    if (
      !startDate &&
      /\b(since we last discussed|since my previous research|since the last comparison|since (we|i) last)\b/.test(
        lower,
      )
    ) {
      referenceType = /\bresearch\b/.test(lower)
        ? "previous_research"
        : "previous_conversation";
      originalExpression =
        /\bresearch\b/.test(lower)
          ? "since my previous research"
          : "since we last discussed this";
      // date filled later by resolver from actual snapshot/message timestamps
    }

    // last Monday / Tuesday etc. and November 3 via Phase 04 parser
    if (!startDate) {
      const dateIntent = this.dateParser.parse(text, {
        timeZone: options.timeZone,
        now,
        preferPast: true,
      });
      if (dateIntent?.kind === "absolute_day") {
        startDate = dateIntent.date;
        endDate = dateIntent.date;
        referenceType = /last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|yesterday/i.test(
          text,
        )
          ? "relative_date"
          : "explicit_date";
        originalExpression = dateIntent.label;
      } else if (dateIntent?.kind === "relative_range") {
        startDate = dateIntent.from;
        endDate = dateIntent.to;
        referenceType = "date_range";
        originalExpression = dateIntent.label;
      }
    }

    // "on Monday" without last — treat as previous weekday when comparison
    if (!startDate && isComparison) {
      const onWeekday =
        /\b(?:on|since)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i.exec(
          text,
        );
      if (onWeekday?.[1]) {
        const resolved = previousWeekdayDate(
          today,
          WEEKDAYS[onWeekday[1].toLowerCase()]!,
          options.timeZone,
        );
        startDate = formatCalendarDate(resolved.year, resolved.month, resolved.day);
        endDate = startDate;
        referenceType = "relative_date";
        originalExpression = onWeekday[0];
      }
    }

    if (isComparison && !startDate && referenceType === "unknown") {
      ambiguous = true;
      ambiguityReason =
        "Comparison requested but no resolvable historical reference date was found";
    }

    // Ensure endDate defaults
    if (startDate && !endDate) {
      endDate = startDate;
    }

    void getZonedParts; // keep import used for future DST helpers

    return {
      isComparison,
      referenceType,
      originalExpression,
      startDate,
      endDate,
      comparisonDate,
      timeZone: options.timeZone,
      comparisonTargets: targets,
      changeCategories:
        changeCategories.length > 0 ? changeCategories : (["general"] as ChangeCategory[]),
      ambiguous,
      ambiguityReason,
    };
  }
}

function detectCategories(lower: string): ChangeCategory[] {
  const cats: ChangeCategory[] = [];
  if (/\b(price|pricing|cost|\$|₹|€|£)\b/.test(lower)) {
    cats.push("pricing");
  }
  if (/\b(feature|shipped|release|released|changelog|launched)\b/.test(lower)) {
    cats.push("features");
    cats.push("product_updates");
  }
  if (/\b(available|availability|deprecated|sunset)\b/.test(lower)) {
    cats.push("availability");
  }
  return Array.from(new Set(cats));
}

function detectTargets(text: string): string[] {
  const known = [
    "HubSpot",
    "Salesforce",
    "Pipedrive",
    "Zoho CRM",
    "Zoho",
    "Close",
    "Supabase",
    "Neon",
    "Railway",
    "Render",
    "PlanetScale",
    "AWS RDS",
    "Amazon RDS",
    "Postgres",
    "PostgreSQL",
  ];
  return known.filter((name) =>
    new RegExp(`\\b${name.replace(/\s+/g, "\\s+")}\\b`, "i").test(text),
  );
}
