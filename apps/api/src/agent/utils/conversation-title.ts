/**
 * Derive a short sidebar title from the first user message in a turn.
 */
export function titleFromUserMessage(message: string): string {
  let text = message.replace(/\s+/g, " ").trim();
  if (!text) {
    return "New conversation";
  }

  const sentenceEnd = text.search(/[.!?]/);
  if (sentenceEnd >= 12 && sentenceEnd <= 72) {
    text = text.slice(0, sentenceEnd);
  }

  if (text.length > 64) {
    const clipped = text.slice(0, 61);
    const lastSpace = clipped.lastIndexOf(" ");
    text =
      (lastSpace > 24 ? clipped.slice(0, lastSpace) : clipped).trimEnd() + "…";
  }

  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shouldAutoTitle(currentTitle: string | null | undefined): boolean {
  const title = (currentTitle ?? "").trim();
  return !title || title === "New conversation";
}
