import { z } from "zod";

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export type PageResult<T> = {
  items: T[];
  nextCursor: string | null;
  limit: number;
};

export function encodeCursor(payload: Record<string, string | number>): string {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeCursor<T extends Record<string, unknown>>(
  cursor: string | undefined,
): T | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}
