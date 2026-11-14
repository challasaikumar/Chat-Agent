import argon2 from "argon2";
import type { Env } from "../config/env.js";
import { badRequest } from "../utils/errors.js";

/** Argon2id parameters — explicit and reviewable. */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export class PasswordService {
  constructor(private readonly env: Env) {}

  validatePlaintext(password: string): void {
    if (password.length < this.env.AUTH_PASSWORD_MIN_LENGTH) {
      throw badRequest(
        `Password must be at least ${this.env.AUTH_PASSWORD_MIN_LENGTH} characters`,
      );
    }
    if (password.length > this.env.AUTH_PASSWORD_MAX_LENGTH) {
      throw badRequest(
        `Password must be at most ${this.env.AUTH_PASSWORD_MAX_LENGTH} characters`,
      );
    }
  }

  async hash(password: string): Promise<string> {
    this.validatePlaintext(password);
    return (await argon2.hash(password, {
      ...ARGON2_OPTIONS,
    })) as unknown as string;
  }

  async verify(hash: string, password: string): Promise<boolean> {
    if (!hash || password.length > this.env.AUTH_PASSWORD_MAX_LENGTH) {
      return false;
    }
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  needsRehash(hash: string): boolean {
    try {
      return argon2.needsRehash(hash, { ...ARGON2_OPTIONS });
    } catch {
      return true;
    }
  }
}
