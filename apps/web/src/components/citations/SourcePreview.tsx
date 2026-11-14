import { useEffect, useState } from "react";
import type { CitationReference } from "@minimi/shared";
import {
  getEvidenceSource,
  type SourcePreviewData,
} from "../../services/agent.api.js";

type Props = {
  citation: CitationReference;
};

export function SourcePreview({ citation }: Props) {
  const [data, setData] = useState<SourcePreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);

    const sourceId =
      citation.id.startsWith("web_src_")
        ? citation.id.slice("web_src_".length)
        : null;

    if (!sourceId) {
      return;
    }

    void getEvidenceSource(sourceId)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : "Evidence metadata unavailable",
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [citation.id]);

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>{citation.title}</h3>
      <p>{citation.domain}</p>
      {citation.url ? (
        <p>
          <a href={citation.url} target="_blank" rel="noopener noreferrer">
            {citation.url}
          </a>
        </p>
      ) : (
        <p>No external URL available for this evidence record.</p>
      )}
      <p>
        Published: {citation.publishedAt ?? "Unknown"} · Retrieved:{" "}
        {citation.retrievedAt ?? "Unknown"}
      </p>
      {citation.contentExcerpt ? (
        <p style={{ whiteSpace: "pre-wrap" }}>{citation.contentExcerpt}</p>
      ) : null}

      {error ? <p className="error-banner">{error}</p> : null}

      {data ? (
        <div style={{ marginTop: "1rem" }}>
          <p>
            Type: {data.classification?.sourceType ?? "unknown"} · Relationship:{" "}
            {data.classification?.publisherRelationship ?? "unknown"}
          </p>
          <p>
            Freshness: {data.freshness?.freshnessCategory ?? "unknown"}
          </p>
          {data.quality ? (
            <p>
              Suitability (heuristic):{" "}
              {(data.quality.overallSuitabilityScore * 100).toFixed(0)}%
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
