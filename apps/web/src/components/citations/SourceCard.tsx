import type { CitationReference } from "@minimi/shared";

type Props = {
  citation: CitationReference;
  onSelect: (citation: CitationReference) => void;
};

export function SourceCard({ citation, onSelect }: Props) {
  return (
    <article className="source-card">
      <h3>{citation.title}</h3>
      <p>{citation.domain ?? "Unknown domain"}</p>
      {citation.contentExcerpt ? <p>{citation.contentExcerpt}</p> : null}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.65rem" }}>
        <button
          type="button"
          className="btn"
          onClick={() => onSelect(citation)}
        >
          View details
        </button>
        {citation.url ? (
          <a
            className="btn btn--ghost"
            href={citation.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open
          </a>
        ) : null}
      </div>
    </article>
  );
}
