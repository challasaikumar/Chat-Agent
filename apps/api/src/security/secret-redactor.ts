import { createHash } from "node:crypto";

const PATTERNS: Array<{ id: string; regex: RegExp; replace: string }> = [
  {
    id: "openai",
    regex: /\bsk-[a-zA-Z0-9_-]{10,}\b/g,
    replace: "[redacted-openai-key]",
  },
  {
    id: "tavily",
    regex: /\btvly-[a-zA-Z0-9_-]{10,}\b/g,
    replace: "[redacted-tavily-key]",
  },
  {
    id: "bearer",
    regex: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi,
    replace: "Bearer [redacted]",
  },
  {
    id: "password_field",
    regex: /("password"\s*:\s*")[^"]*(")/gi,
    replace: "$1[redacted]$2",
  },
  {
    id: "session_token",
    regex: /\b(minimi_session|__Host-minimi_session)=([^\s;]+)/gi,
    replace: "$1=[redacted]",
  },
];

export function redactSecrets(input: string): string {
  let out = input;
  for (const pattern of PATTERNS) {
    out = out.replace(pattern.regex, pattern.replace);
  }
  return out;
}

export function hashForAudit(value: string | null | undefined): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}
