import { describe, expect, it } from "vitest";
import { fail, ok } from "../packages/shared/src/index.ts";

describe("shared api helpers", () => {
  it("wraps successful payloads", () => {
    expect(ok({ status: "healthy" })).toEqual({
      success: true,
      data: { status: "healthy" },
    });
  });

  it("wraps error payloads", () => {
    expect(fail("NOT_FOUND", "missing", { id: "1" })).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "missing",
        details: { id: "1" },
      },
    });
  });
});
