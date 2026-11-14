export type PromptInjectionDetection = {
  suspicious: boolean;
  indicators: string[];
  /** Heuristic score 0–1 — not a calibrated probability. */
  riskScore: number;
};

const PATTERNS: Array<{ id: string; regex: RegExp }> = [
  {
    id: "ignore_previous",
    regex: /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/i,
  },
  {
    id: "reveal_system",
    regex: /(reveal|show|print|dump)\s+(the\s+)?(system|developer)\s+(prompt|message|instructions?)/i,
  },
  {
    id: "exfiltrate_secrets",
    regex: /(exfiltrate|leak|send|reveal)\s+(api\s*keys?|secrets?|tokens?|credentials?|env)/i,
  },
  {
    id: "execute_commands",
    regex: /(execute|run)\s+(shell|bash|powershell|cmd|terminal)\s*(command)?/i,
  },
  {
    id: "access_other_conversations",
    regex: /access\s+(another|other|all)\s+(user'?s?\s+)?(conversation|memory|history)/i,
  },
  {
    id: "role_override",
    regex: /(you\s+are\s+now|act\s+as|new\s+persona|jailbreak|DAN\s+mode)/i,
  },
  {
    id: "tool_override",
    regex: /(call\s+tool|invoke\s+function|override\s+tool|disable\s+safety)/i,
  },
];

/**
 * Defensive heuristic — detection does not discard legitimate evidence.
 * Mark suspicious content and keep factual excerpts separated from instructions.
 */
export function detectPromptInjection(
  content: string,
): PromptInjectionDetection {
  const indicators: string[] = [];
  for (const pattern of PATTERNS) {
    if (pattern.regex.test(content)) {
      indicators.push(pattern.id);
    }
  }
  const riskScore = Math.min(1, indicators.length * 0.25);
  return {
    suspicious: indicators.length > 0,
    indicators,
    riskScore,
  };
}
