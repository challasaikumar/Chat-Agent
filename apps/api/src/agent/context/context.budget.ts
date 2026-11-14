export function trimToBudget(sections: string[], maxChars: number): string {
  const kept: string[] = [];
  let used = 0;

  for (const section of sections) {
    if (!section.trim()) {
      continue;
    }
    if (used + section.length + 2 > maxChars) {
      const remaining = maxChars - used - 2;
      if (remaining > 80) {
        kept.push(`${section.slice(0, remaining - 1)}…`);
      }
      break;
    }
    kept.push(section);
    used += section.length + 2;
  }

  return kept.join("\n\n");
}
