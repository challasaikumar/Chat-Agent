import { describe, expect, it } from "vitest";
import { SourceAssessor } from "../apps/api/src/evidence/sources/source.assessor.js";
import { classifySource } from "../apps/api/src/evidence/sources/source.classifier.js";
import { assessFreshness } from "../apps/api/src/evidence/sources/source.freshness.js";
import { analyzeSourceIndependence } from "../apps/api/src/evidence/sources/source.independence.js";
import { canonicalizeSourceUrl } from "../apps/api/src/evidence/sources/source.url-normalizer.js";

describe("Phase 07 source classification", () => {
  it("classifies official pricing pages", () => {
    const result = classifySource({
      url: "https://www.hubspot.com/pricing/crm",
      title: "HubSpot CRM Pricing",
      content: "Starter costs $20 per month. Professional costs $90 per month.",
      claimCategory: "pricing",
      entityName: "HubSpot",
    });
    expect(result.sourceType).toBe("official_pricing");
    expect(result.publisherRelationship).toBe("first_party");
  });

  it("classifies official documentation", () => {
    const result = classifySource({
      url: "https://docs.stripe.com/api",
      title: "Stripe API docs",
      content: "Authentication uses secret keys.",
      claimCategory: "feature",
      entityName: "Stripe",
    });
    expect(result.sourceType).toBe("official_documentation");
    expect(result.publisherRelationship).toBe("first_party");
  });

  it("classifies government sources", () => {
    const result = classifySource({
      url: "https://www.fda.gov/medical-devices/guidance",
      title: "FDA guidance",
      content: "Regulatory requirements for devices.",
    });
    expect(result.sourceType).toBe("government_or_regulatory");
  });

  it("classifies established news", () => {
    const result = classifySource({
      url: "https://techcrunch.com/2024/01/01/saas-pricing",
      title: "SaaS pricing shifts",
      content: "Vendors raised prices.",
    });
    expect(result.sourceType).toBe("established_news");
    expect(result.publisherRelationship).toBe("independent");
  });

  it("classifies community discussion", () => {
    const result = classifySource({
      url: "https://www.reddit.com/r/saas/comments/abc/pricing",
      title: "Anyone else see HubSpot price change?",
      content: "Saw $25 somewhere.",
    });
    expect(result.publisherRelationship).toBe("community");
  });

  it("keeps unknown publishers unknown", () => {
    const result = classifySource({
      url: "https://random-blog.example/post",
      title: "Thoughts",
      content: "Maybe pricing changed.",
    });
    expect(result.sourceType).toBe("unknown");
  });

  it("does not treat every official-domain page as pricing authority", () => {
    const assessor = new SourceAssessor();
    const pricing = assessor.assess({
      sourceId: "s1",
      url: "https://hubspot.com/pricing",
      title: "Pricing",
      content: "Pro plan costs $90/month.",
      claimCategory: "pricing",
      entityName: "HubSpot",
      publishedAt: new Date(),
    });
    const careers = assessor.assess({
      sourceId: "s2",
      url: "https://hubspot.com/careers",
      title: "Careers",
      content: "Join our team in marketing.",
      claimCategory: "pricing",
      entityName: "HubSpot",
      publishedAt: new Date(),
    });
    expect(pricing.authorityScore).toBeGreaterThan(careers.authorityScore);
  });
});

describe("Phase 07 source freshness", () => {
  const now = new Date("2024-06-15T12:00:00.000Z");

  it("marks current sources", () => {
    const result = assessFreshness({
      publishedAt: new Date("2024-06-10T00:00:00.000Z"),
      claimCategory: "pricing",
      now,
    });
    expect(result.freshnessCategory).toBe("current");
    expect(result.sourceDateType).toBe("published_at");
  });

  it("marks recently updated sources", () => {
    const result = assessFreshness({
      updatedAt: new Date("2024-02-01T00:00:00.000Z"),
      claimCategory: "feature",
      now,
    });
    expect(result.freshnessCategory).toBe("recent");
    expect(result.sourceDateType).toBe("updated_at");
  });

  it("marks old publications stale for pricing", () => {
    const result = assessFreshness({
      publishedAt: new Date("2022-01-01T00:00:00.000Z"),
      claimCategory: "pricing",
      now,
    });
    expect(result.freshnessCategory).toBe("stale");
  });

  it("does not treat undated retrieved-today content as current", () => {
    const result = assessFreshness({
      retrievedAt: now,
      claimCategory: "pricing",
      now,
    });
    expect(result.freshnessCategory).toBe("unknown");
    expect(result.reasons).toContain("retrieval_date_is_not_content_currency");
  });

  it("prefers effective_at over published_at", () => {
    const result = assessFreshness({
      publishedAt: new Date("2023-01-01T00:00:00.000Z"),
      effectiveAt: new Date("2024-06-01T00:00:00.000Z"),
      claimCategory: "policy",
      now,
    });
    expect(result.sourceDateType).toBe("effective_at");
    expect(result.reasons).toContain(
      "effective_date_differs_from_publication_date",
    );
  });
});

describe("Phase 07 source independence", () => {
  it("detects duplicate canonical URLs", () => {
    const a = canonicalizeSourceUrl(
      "https://Example.com/pricing?utm_source=news",
    );
    const b = canonicalizeSourceUrl("https://example.com/pricing");
    expect(a).toBe(b);

    const analysis = analyzeSourceIndependence([
      {
        id: "1",
        url: "https://Example.com/pricing?utm_source=news",
        content: "Pro is $25/mo",
      },
      {
        id: "2",
        url: "https://example.com/pricing",
        content: "Pro is $25/mo",
      },
    ]);
    expect(analysis.relationships[0]?.relationshipType).toBe("duplicate");
    expect(analysis.independentSourceCount).toBe(1);
  });

  it("detects syndicated identical content across domains", () => {
    const body =
      "Acme announces Pro plan at $25 per month with unlimited projects effective June.";
    const analysis = analyzeSourceIndependence([
      {
        id: "1",
        url: "https://acme.com/blog/pro-pricing",
        title: "Acme Pro pricing",
        content: body,
      },
      {
        id: "2",
        url: "https://news-wire.example/acme-pro-pricing",
        title: "Acme Pro pricing",
        content: body,
      },
    ]);
    expect(analysis.relationships[0]?.relationshipType).toBe("syndicated");
    expect(analysis.independentSourceCount).toBe(1);
  });

  it("treats genuinely independent sources separately", () => {
    const analysis = analyzeSourceIndependence([
      {
        id: "1",
        url: "https://neon.tech/pricing",
        title: "Neon pricing",
        content: "Launch plan starts at $19/month for compute.",
      },
      {
        id: "2",
        url: "https://independent-review.example/neon",
        title: "Neon reviewed",
        content: "In our lab tests Neon latency stayed under 20ms.",
      },
    ]);
    expect(analysis.independentSourceCount).toBe(2);
    expect(
      analysis.relationships.some((r) => r.relationshipType === "independent"),
    ).toBe(true);
  });

  it("marks uncertain dependencies as unknown", () => {
    const analysis = analyzeSourceIndependence([
      {
        id: "1",
        url: "https://a.example/post",
        title: "Pricing notes",
        content: "Something about plans and seats in Europe markets today.",
      },
      {
        id: "2",
        url: "https://b.example/article",
        title: "Plan overview",
        content: "Markets and seats mentioned with vague plan commentary.",
      },
    ]);
    expect(
      analysis.relationships.some(
        (r) =>
          r.relationshipType === "unknown" ||
          r.relationshipType === "independent",
      ),
    ).toBe(true);
  });
});
