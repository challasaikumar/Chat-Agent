/**
 * Ensure claims are atomic before verification.
 * Does not overwrite original claims — returns candidate splits only.
 */

export type AtomicClaimCandidate = {
  statement: string;
  attributeHint: string | null;
  valueHint: string | null;
};

const CONJUNCTION = /\s+and\s+/i;

export function splitCompoundClaim(statement: string): AtomicClaimCandidate[] {
  const trimmed = statement.trim();
  if (!trimmed) {
    return [];
  }

  // "costs $25/month and includes 100 GB storage and unlimited projects"
  if (!CONJUNCTION.test(trimmed)) {
    return [toCandidate(trimmed)];
  }

  const parts = trimmed
    .split(CONJUNCTION)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return [toCandidate(trimmed)];
  }

  // Keep subject prefix on later fragments when possible.
  const subjectMatch = parts[0]!.match(
    /^(.+?)\s+(costs?|includes?|offers?|provides?|has|have|is|are)\b/i,
  );
  const subject = subjectMatch?.[1]?.trim();

  return parts.map((part, index) => {
    if (index === 0 || !subject || part.toLowerCase().startsWith(subject.toLowerCase())) {
      return toCandidate(part);
    }
    return toCandidate(`${subject} ${part}`);
  });
}

function toCandidate(statement: string): AtomicClaimCandidate {
  const price = statement.match(/\$\s?([\d,.]+)/);
  const storage = statement.match(/([\d,.]+)\s*(gb|tb|mb)\b/i);
  const unlimited = /\bunlimited\b/i.test(statement);

  if (price) {
    return {
      statement,
      attributeHint: "price",
      valueHint: price[1]!.replace(/,/g, ""),
    };
  }
  if (storage) {
    return {
      statement,
      attributeHint: "storage",
      valueHint: `${storage[1]}${storage[2]!.toUpperCase()}`,
    };
  }
  if (unlimited) {
    const subject = statement.match(/unlimited\s+(\w+)/i)?.[1] ?? "quota";
    return {
      statement,
      attributeHint: subject.toLowerCase(),
      valueHint: "unlimited",
    };
  }
  return { statement, attributeHint: null, valueHint: null };
}
