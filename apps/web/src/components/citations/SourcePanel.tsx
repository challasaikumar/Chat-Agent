import { useEffect, useRef } from "react";
import type { CitationReference } from "@minimi/shared";
import { SourceCard } from "./SourceCard.js";
import { SourcePreview } from "./SourcePreview.js";

type Props = {
  open: boolean;
  citations: CitationReference[];
  selected: CitationReference | null;
  onSelect: (citation: CitationReference | null) => void;
  onClose: () => void;
};

export function SourcePanel({
  open,
  citations,
  selected,
  onSelect,
  onClose,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("button, a")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <aside
      className="sources-panel"
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Sources"
    >
      <div className="sources-panel__header">
        <strong>{selected ? "Source details" : `Sources (${citations.length})`}</strong>
        <button type="button" className="btn btn--ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="sources-panel__body">
        {selected ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => onSelect(null)}
            >
              ← All sources
            </button>
            <SourcePreview citation={selected} />
          </>
        ) : citations.length === 0 ? (
          <p>No sources for this turn yet.</p>
        ) : (
          citations.map((citation) => (
            <SourceCard
              key={citation.id}
              citation={citation}
              onSelect={onSelect}
            />
          ))
        )}
      </div>
    </aside>
  );
}
