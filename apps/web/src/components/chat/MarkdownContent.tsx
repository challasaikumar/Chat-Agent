import { memo, useState, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { CitationReference } from "@minimi/shared";
import { CitationMarker } from "../citations/CitationMarker.js";

const schema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    "table",
    "thead",
    "tbody",
    "tr",
    "th",
    "td",
  ],
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
  attributes: {
    ...defaultSchema.attributes,
    a: [...(defaultSchema.attributes?.a ?? []), ["target"], ["rel"]],
    code: [...(defaultSchema.attributes?.code ?? []), ["className"]],
    th: [...(defaultSchema.attributes?.th ?? []), ["align", "colSpan", "rowSpan"]],
    td: [...(defaultSchema.attributes?.td ?? []), ["align", "colSpan", "rowSpan"]],
  },
};

const REF_SPLIT = /(\[ref:[a-zA-Z0-9_:-]+\])/g;
const REF_CAPTURE = /^\[ref:([a-zA-Z0-9_:-]+)\]$/;

function renderWithCitations(
  children: ReactNode,
  citations: CitationReference[],
  onOpen: (citation: CitationReference) => void,
): ReactNode {
  if (typeof children !== "string") {
    if (Array.isArray(children)) {
      return children.map((child, index) => (
        <span key={index}>
          {renderWithCitations(child, citations, onOpen)}
        </span>
      ));
    }
    return children;
  }

  const parts = children.split(REF_SPLIT);
  return parts.map((part, index) => {
    const match = part.match(REF_CAPTURE);
    if (!match) {
      return <span key={index}>{part}</span>;
    }
    const id = match[1]!;
    const citation =
      citations.find((c) => c.id === id) ??
      ({
        id,
        title: id,
        url: null,
        domain: null,
        retrievedAt: null,
        publishedAt: null,
      } satisfies CitationReference);
    return (
      <CitationMarker
        key={`${id}-${index}`}
        citation={citation}
        onOpen={onOpen}
      />
    );
  });
}

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = String(children).replace(/\n$/, "");
  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="btn btn--ghost"
        style={{
          position: "absolute",
          top: "0.35rem",
          right: "0.35rem",
          fontSize: "0.75rem",
        }}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

type Props = {
  content: string;
  citations: CitationReference[];
  onOpenCitation: (citation: CitationReference) => void;
};

export const MarkdownContent = memo(function MarkdownContent({
  content,
  citations,
  onOpenCitation,
}: Props) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeSanitize, schema]]}
        components={{
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          ),
          p: ({ children }) => (
            <p>{renderWithCitations(children, citations, onOpenCitation)}</p>
          ),
          li: ({ children }) => (
            <li>{renderWithCitations(children, citations, onOpenCitation)}</li>
          ),
          table: ({ children }) => (
            <div className="markdown-table-wrap">
              <table>{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th>{renderWithCitations(children, citations, onOpenCitation)}</th>
          ),
          td: ({ children }) => (
            <td>{renderWithCitations(children, citations, onOpenCitation)}</td>
          ),
          code: ({ className, children }) => {
            const isBlock = Boolean(className);
            if (isBlock) {
              return <CodeBlock>{children}</CodeBlock>;
            }
            return <code>{children}</code>;
          },
          pre: ({ children }) => <>{children}</>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
