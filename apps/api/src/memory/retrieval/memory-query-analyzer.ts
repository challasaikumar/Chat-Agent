import type { MemoryQueryIntent } from "../memory.types.js";

export type AnalyzedMemoryQuery = {
  intent: MemoryQueryIntent;
  wantsHistorical: boolean;
  wantsCurrent: boolean;
  wantsChangeHistory: boolean;
  categories: string[];
  keywords: string[];
};

export function analyzeMemoryQuery(query: string): AnalyzedMemoryQuery {
  const lower = query.toLowerCase();
  const wantsHistorical =
    /\b(originally|previously|before|was|used to|last|history|earlier|first)\b/.test(
      lower,
    );
  const wantsChangeHistory =
    /\b(changed|change|migrat|evolution|how has|timeline)\b/.test(lower);
  const wantsCurrent =
    /\b(current|now|today|latest|using|prefer)\b/.test(lower) ||
    (!wantsHistorical && !wantsChangeHistory);

  let intent: MemoryQueryIntent = "general";
  const categories: string[] = [];

  if (/\bprefer|preference|concise|style\b/.test(lower)) {
    intent = "preference";
    categories.push("preference");
  } else if (wantsChangeHistory) {
    intent = "change_history";
    categories.push("decision", "technical_context", "project_context");
  } else if (/\b(stack|architecture|nestjs|react|mysql|postgres|cdn)\b/.test(lower)) {
    intent = "architecture";
    categories.push("technical_context", "project_context", "decision");
  } else if (/\b(decision|chose|selected|migrat|database|hosting)\b/.test(lower)) {
    intent = "decision";
    categories.push("decision");
  } else if (/\b(requirement|must|constraint|goal)\b/.test(lower)) {
    intent = "requirements";
    categories.push("requirement", "constraint", "goal");
  } else if (/\b(project|building|lms|saas)\b/.test(lower)) {
    intent = "current_project";
    categories.push("project_context", "technical_context");
  } else if (/\b(last monday|yesterday|on \d|november|discussed)\b/.test(lower)) {
    intent = "past_conversation";
  } else if (/\b(i am|my name|timezone|about me)\b/.test(lower)) {
    intent = "personal_context";
    categories.push("user_context");
  }

  const keywords = query
    .split(/\s+/)
    .map((token) => token.replace(/[^a-zA-Z0-9_-]/g, ""))
    .filter((token) => token.length >= 3)
    .slice(0, 12);

  return {
    intent,
    wantsHistorical,
    wantsCurrent,
    wantsChangeHistory,
    categories: Array.from(new Set(categories)),
    keywords,
  };
}
