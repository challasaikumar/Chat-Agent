import type { AppDatabase } from "../../db/index.js";
import type { MemoryFact } from "../../db/schema.js";
import { FactRepository } from "../../repositories/fact.repository.js";
import { badRequest } from "../../utils/errors.js";

const SENSITIVE_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /bearer\s+[a-z0-9\-._~+/]+=*/i,
  /sk-[a-zA-Z0-9]{10,}/,
  /tvly-[a-zA-Z0-9_-]{10,}/i,
  /-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /session[_-]?cookie\s*[:=]/i,
  /access[_-]?token\s*[:=]/i,
  /\b\d{12,19}\b/, // crude card-like numbers
];

export class MemoryPrivacyService {
  private readonly facts: FactRepository;

  constructor(db: AppDatabase) {
    this.facts = new FactRepository(db);
  }

  assertSafeToStore(text: string): void {
    for (const pattern of SENSITIVE_PATTERNS) {
      if (pattern.test(text)) {
        throw badRequest(
          "Refusing to store sensitive credentials or secrets in long-term memory",
        );
      }
    }
  }

  isSafeContent(text: string): boolean {
    return !SENSITIVE_PATTERNS.some((pattern) => pattern.test(text));
  }

  async retract(userId: string, factId: string): Promise<MemoryFact | undefined> {
    return this.facts.retract(factId, userId);
  }

  async correct(
    userId: string,
    factId: string,
    updates: {
      fact?: string;
      assertionStatus?: MemoryFact["assertionStatus"];
      isActive?: boolean;
      importance?: number;
    },
  ): Promise<MemoryFact | undefined> {
    if (updates.fact) {
      this.assertSafeToStore(updates.fact);
    }
    return this.facts.patch(factId, userId, updates);
  }
}
