import type { CitationReference } from "@minimi/shared";

type Props = {
  citation: CitationReference;
  onOpen: (citation: CitationReference) => void;
};

export function CitationMarker({ citation, onOpen }: Props) {
  const label = citation.domain ?? citation.title.slice(0, 18);
  return (
    <button
      type="button"
      className="citation-marker"
      title={citation.title}
      aria-label={`Open source ${citation.title}`}
      onClick={() => onOpen(citation)}
    >
      {label}
    </button>
  );
}
