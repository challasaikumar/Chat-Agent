import type { FastifyInstance } from "fastify";
import { ok } from "@minimi/shared";
import { z } from "zod";
import { EvidenceService } from "../evidence/evidence.service.js";
import {
  claimIdParamsSchema,
  evidencePaginationSchema,
  snapshotIdParamsSchema,
  sourceIdParamsSchema,
  verificationIdParamsSchema,
} from "../evidence/evidence.schemas.js";
import { badRequest, notFound } from "../utils/errors.js";
import { getRequestUserId } from "../auth/auth.middleware.js";
import { serializeDates } from "../utils/serialize.js";

function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    throw badRequest("Validation failed", parsed.error.flatten());
  }
  return parsed.data;
}

export async function evidenceRoutes(app: FastifyInstance): Promise<void> {
  const evidence = new EvidenceService(app.db, app.env, app.log);

  app.get("/api/evidence/sources/:id", async (request) => {
    const { id } = parseOrThrow(sourceIdParamsSchema, request.params);
    const row = await evidence.getSource(getRequestUserId(request), id);
    if (!row) {
      throw notFound("Source not found");
    }

    const latest = row.assessments[0] ?? null;
    return ok(
      serializeDates({
        source: {
          id: row.source.id,
          title: row.source.title,
          url: row.source.url,
          domain: row.source.domain,
          publishedAt: row.source.publishedAt,
          retrievedAt: row.source.retrievedAt,
          contentExcerpt: row.source.contentExcerpt.slice(0, 2000),
          snapshotId: row.snapshotId,
          capturedAt: row.capturedAt,
        },
        classification: latest
          ? {
              sourceType: latest.sourceType,
              publisherRelationship: latest.publisherRelationship,
              assessmentStatus: latest.assessmentStatus,
            }
          : null,
        freshness: latest
          ? {
              freshnessCategory: latest.freshnessCategory,
              freshnessScore: latest.freshnessScore,
            }
          : null,
        quality: latest
          ? {
              authorityScore: latest.authorityScore,
              relevanceScore: latest.relevanceScore,
              transparencyScore: latest.transparencyScore,
              directnessScore: latest.directnessScore,
              overallSuitabilityScore: latest.overallSuitabilityScore,
              reasons: latest.assessmentReasons,
              suspiciousContent: latest.suspiciousContent,
              assessedAt: latest.assessedAt,
            }
          : null,
        relationships: row.relationships.map((rel) => ({
          id: rel.id,
          relatedSourceId: rel.relatedSourceId,
          relationshipType: rel.relationshipType,
          confidence: rel.confidence,
          evidence: rel.evidence,
        })),
      }),
    );
  });

  app.get("/api/evidence/claims/:id", async (request) => {
    const { id } = parseOrThrow(claimIdParamsSchema, request.params);
    const row = await evidence.getClaim(getRequestUserId(request), id);
    if (!row) {
      throw notFound("Claim not found");
    }

    const supporting = row.links.filter(
      (l) =>
        l.relationship === "supports" ||
        l.relationship === "partially_supports",
    );
    const contradicting = row.links.filter(
      (l) => l.relationship === "contradicts",
    );
    const latest = row.runs[0] ?? null;

    return ok(
      serializeDates({
        claim: {
          id: row.claim.id,
          entityName: row.claim.entityName,
          category: row.claim.category,
          attribute: row.claim.attribute,
          originalValue: row.claim.originalValue,
          normalizedValue: row.claim.normalizedValue,
          sourceUrl: row.claim.sourceUrl,
          evidenceExcerpt: row.claim.evidenceExcerpt,
          observedAt: row.claim.observedAt,
          publishedAt: row.claim.publishedAt,
          effectiveAt: row.claim.effectiveAt,
        },
        verificationStatus: latest?.status ?? "not_verifiable",
        supportingEvidence: supporting.map(summarizeLink),
        contradictoryEvidence: contradicting.map(summarizeLink),
        verificationHistory: row.runs.map((run) => ({
          id: run.id,
          status: run.status,
          sufficiencyStatus: run.sufficiencyStatus,
          assessmentSummary: run.assessmentSummary,
          completedAt: run.completedAt,
          createdAt: run.createdAt,
        })),
      }),
    );
  });

  app.get("/api/evidence/claims/:id/verification", async (request) => {
    const { id } = parseOrThrow(claimIdParamsSchema, request.params);
    const query = parseOrThrow(evidencePaginationSchema, request.query);
    const row = await evidence.getClaim(getRequestUserId(request), id);
    if (!row) {
      throw notFound("Claim not found");
    }

    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;
    const runs = row.runs.slice(offset, offset + limit);
    const source = await evidence.getSource(
      getRequestUserId(request),
      row.claim.sourceId,
    );

    return ok(
      serializeDates({
        claimId: id,
        runs: runs.map((run) => ({
          id: run.id,
          status: run.status,
          sufficiencyStatus: run.sufficiencyStatus,
          sourceCount: run.sourceCount,
          independentSourceCount: run.independentSourceCount,
          supportingSourceCount: run.supportingSourceCount,
          contradictingSourceCount: run.contradictingSourceCount,
          assessmentSummary: run.assessmentSummary,
          metadata: run.metadata,
          completedAt: run.completedAt,
          createdAt: run.createdAt,
        })),
        sourceAssessments: source?.assessments ?? [],
        sufficiency:
          runs[0]?.sufficiencyStatus ??
          row.runs[0]?.sufficiencyStatus ??
          "insufficient",
        conflicts:
          (row.runs[0]?.metadata as { conflicts?: unknown } | null)?.conflicts ??
          [],
        pagination: {
          limit,
          offset,
          total: row.runs.length,
        },
      }),
    );
  });

  app.get("/api/evidence/snapshots/:id/report", async (request) => {
    const { id } = parseOrThrow(snapshotIdParamsSchema, request.params);
    const report = await evidence.getSnapshotReport(getRequestUserId(request), id);
    if (!report) {
      throw notFound("Snapshot not found");
    }
    return ok(serializeDates(report));
  });

  app.get("/api/evidence/verification/:id", async (request) => {
    const { id } = parseOrThrow(verificationIdParamsSchema, request.params);
    const row = await evidence.getVerification(getRequestUserId(request), id);
    if (!row) {
      throw notFound("Verification not found");
    }
    return ok(
      serializeDates({
        verification: {
          id: row.run.id,
          claimId: row.run.claimId,
          status: row.run.status,
          sufficiencyStatus: row.run.sufficiencyStatus,
          sourceCount: row.run.sourceCount,
          independentSourceCount: row.run.independentSourceCount,
          supportingSourceCount: row.run.supportingSourceCount,
          contradictingSourceCount: row.run.contradictingSourceCount,
          assessmentSummary: row.run.assessmentSummary,
          metadata: row.run.metadata,
          completedAt: row.run.completedAt,
          createdAt: row.run.createdAt,
        },
        results: row.results.map((result) => ({
          id: result.id,
          evidenceLinkId: result.evidenceLinkId,
          result: result.result,
          assessmentReason: result.assessmentReason,
          createdAt: result.createdAt,
        })),
      }),
    );
  });
}

function summarizeLink(link: {
  id: string;
  sourceId: string;
  relationship: string;
  evidenceExcerpt: string;
  directness: string;
  confidence: number;
  reasoningSummary: string;
}) {
  return {
    id: link.id,
    sourceId: link.sourceId,
    relationship: link.relationship,
    evidenceExcerpt: link.evidenceExcerpt.slice(0, 500),
    directness: link.directness,
    confidence: link.confidence,
    reasoningSummary: link.reasoningSummary,
  };
}
