import { describe, expect, it } from "vitest";
import { isOriginAllowed } from "../../apps/api/src/security/origin-allowlist.js";

describe("isOriginAllowed", () => {
  it("matches exact origins", () => {
    expect(
      isOriginAllowed("https://chat-agent-snowy.vercel.app", [
        "https://chat-agent-snowy.vercel.app",
      ]),
    ).toBe(true);
  });

  it("matches vercel wildcard previews", () => {
    const allowed = ["https://*.vercel.app", "http://localhost:5173"];
    expect(
      isOriginAllowed("https://chat-agent-snowy.vercel.app", allowed),
    ).toBe(true);
    expect(
      isOriginAllowed("https://chat-agent-2vuq.vercel.app", allowed),
    ).toBe(true);
    expect(isOriginAllowed("http://localhost:5173", allowed)).toBe(true);
  });

  it("rejects other hosts and bare wildcards", () => {
    expect(
      isOriginAllowed("https://evil.com", ["https://*.vercel.app"]),
    ).toBe(false);
    expect(isOriginAllowed("https://evil.com", ["*"])).toBe(false);
  });
});
