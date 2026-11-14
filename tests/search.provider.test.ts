import { afterEach, describe, expect, it, vi } from "vitest";
import { loadEnvironment } from "../apps/api/src/config/env.ts";
import { TavilySearchProvider } from "../apps/api/src/search/providers/tavily/tavily.provider.ts";
import { resetTavilyClientCache } from "../apps/api/src/search/providers/tavily/tavily.client.ts";
import {
  TavilyKeylessLimitError,
  TavilyRequestError,
} from "@tavily/core";

const searchMock = vi.fn();

vi.mock("@tavily/core", async () => {
  const actual = await vi.importActual<typeof import("@tavily/core")>("@tavily/core");
  return {
    ...actual,
    tavily: () => ({
      search: searchMock,
      extract: vi.fn(),
      crawl: vi.fn(),
      map: vi.fn(),
      research: vi.fn(),
      getResearch: vi.fn(),
      feedback: vi.fn(),
    }),
  };
});

describe("TavilySearchProvider", () => {
  afterEach(() => {
    searchMock.mockReset();
    resetTavilyClientCache();
  });

  it("requires an API key", async () => {
    const provider = new TavilySearchProvider(
      loadEnvironment({ TAVILY_API_KEY: "", NODE_ENV: "test" }),
    );

    await expect(provider.search({ query: "postgres" })).rejects.toMatchObject({
      code: "SEARCH_CONFIGURATION_ERROR",
    });
  });

  it("maps a successful SDK response", async () => {
    searchMock.mockResolvedValue({
      query: "postgres hosting",
      responseTime: 0.25,
      requestId: "tvly-req-1",
      images: [],
      results: [
        {
          title: "Neon",
          url: "https://neon.tech/pricing",
          content: "Serverless Postgres pricing",
          score: 0.88,
          publishedDate: "2025-10-01",
          favicon: "https://neon.tech/favicon.ico",
          id: "1",
        },
      ],
      usage: { credits: 1 },
    });

    const provider = new TavilySearchProvider(
      loadEnvironment({
        TAVILY_API_KEY: "tvly-test-key",
        NODE_ENV: "test",
        SEARCH_MAX_CONTENT_LENGTH: "12000",
      }),
    );

    const response = await provider.search({
      query: "postgres hosting",
      maxResults: 5,
      searchDepth: "advanced",
    });

    expect(searchMock).toHaveBeenCalledWith(
      "postgres hosting",
      expect.objectContaining({
        maxResults: 5,
        searchDepth: "advanced",
        includePublishedDate: true,
      }),
    );
    expect(response.provider).toBe("tavily");
    expect(response.requestId).toBe("tvly-req-1");
    expect(response.results).toHaveLength(1);
    expect(response.results[0]?.domain).toBe("neon.tech");
    expect(response.responseTimeMs).toBe(250);
  });

  it("translates auth, rate-limit, timeout, and empty-shape failures", async () => {
    const provider = new TavilySearchProvider(
      loadEnvironment({ TAVILY_API_KEY: "tvly-test-key", NODE_ENV: "test" }),
    );

    searchMock.mockRejectedValueOnce(
      new TavilyRequestError({
        message: "unauthorized",
        status: 401,
        body: {},
      }),
    );
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "SEARCH_AUTHENTICATION_ERROR",
    });

    searchMock.mockRejectedValueOnce(
      new TavilyKeylessLimitError({
        message: "rate limited",
        status: 429,
        body: {},
        capType: "hourly_cap_reached",
        retryAfter: 30,
        bonusEligible: false,
        continuationPaths: [],
      }),
    );
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "SEARCH_RATE_LIMIT_ERROR",
    });

    searchMock.mockRejectedValueOnce(
      Object.assign(new Error("timeout of 30000ms exceeded"), {
        code: "ECONNABORTED",
      }),
    );
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "SEARCH_TIMEOUT_ERROR",
    });

    searchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "SEARCH_PROVIDER_ERROR",
    });

    searchMock.mockResolvedValueOnce({
      query: "x",
      responseTime: 0.1,
      requestId: "r",
      images: [],
      results: null,
    });
    await expect(provider.search({ query: "x" })).rejects.toMatchObject({
      code: "SEARCH_PROVIDER_ERROR",
    });
  });
});
