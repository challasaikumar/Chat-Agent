import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { CitationReference } from "@minimi/shared";
import type { UiMessage } from "../../hooks/useChat.js";
import { formatMessageTime } from "../../lib/dates.js";
import { MarkdownContent } from "./MarkdownContent.js";
import { AgentActivity } from "./AgentActivity.js";
import { EmptyState } from "./EmptyState.js";

type Props = {
  messages: UiMessage[];
  citations: CitationReference[];
  loading: boolean;
  error: string | null;
  activityMessage: string | null;
  showActivity: boolean;
  timeZone: string;
  onOpenCitation: (citation: CitationReference) => void;
  onNewChat: () => void;
  empty: boolean;
};

const MessageRow = memo(function MessageRow({
  message,
  citations,
  timeZone,
  onOpenCitation,
}: {
  message: UiMessage;
  citations: CitationReference[];
  timeZone: string;
  onOpenCitation: (citation: CitationReference) => void;
}) {
  return (
    <article className={`message message--${message.role}`}>
      <div className="message__meta">
        {message.role === "user" ? "You" : "Minimi"} ·{" "}
        {formatMessageTime(message.createdAt, timeZone)}
        {message.incomplete ? " · incomplete" : ""}
        {message.streaming ? " · streaming" : ""}
      </div>
      <div className="message__bubble">
        {message.role === "assistant" ? (
          <MarkdownContent
            content={message.content || (message.streaming ? "…" : "")}
            citations={citations}
            onOpenCitation={onOpenCitation}
          />
        ) : (
          message.content
        )}
      </div>
      {message.role === "assistant" && !message.streaming ? (
        <div>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => void navigator.clipboard.writeText(message.content)}
          >
            Copy
          </button>
        </div>
      ) : null}
    </article>
  );
});

export function MessageList({
  messages,
  citations,
  loading,
  error,
  activityMessage,
  showActivity,
  timeZone,
  onOpenCitation,
  onNewChat,
  empty,
}: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const visibleMessages = useMemo(
    () =>
      messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .filter((m) => {
          if (
            m.role === "assistant" &&
            m.metadata &&
            typeof m.metadata === "object" &&
            (m.metadata as { type?: string }).type === "tool_call"
          ) {
            return false;
          }
          return true;
        }),
    [messages],
  );

  // Only auto-scroll when the last message content changes (streaming) or count grows.
  const lastMessage = visibleMessages[visibleMessages.length - 1];
  const scrollKey = `${visibleMessages.length}:${lastMessage?.id ?? ""}:${lastMessage?.content.length ?? 0}:${activityMessage ?? ""}`;

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTop = el.scrollHeight;
  }, [scrollKey]);

  if (empty && !loading) {
    return <EmptyState onNewChat={onNewChat} />;
  }

  return (
    <div
      className="message-list"
      ref={scrollerRef}
      onScroll={() => {
        const el = scrollerRef.current;
        if (!el) return;
        const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
        stickToBottom.current = distance < 80;
        setShowJump(distance > 160);
      }}
    >
      <div className="message-list__inner">
        {loading ? <p className="message__meta">Loading messages…</p> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        {visibleMessages.map((message) => (
          <MessageRow
            key={message.id}
            message={message}
            citations={
              message.streaming || message.id === lastMessage?.id
                ? citations
                : message.role === "assistant"
                  ? citations
                  : []
            }
            timeZone={timeZone}
            onOpenCitation={onOpenCitation}
          />
        ))}

        <AgentActivity message={activityMessage} visible={showActivity} />

        {showJump ? (
          <button
            type="button"
            className="btn scroll-latest"
            onClick={() => {
              const el = scrollerRef.current;
              if (!el) return;
              el.scrollTop = el.scrollHeight;
              stickToBottom.current = true;
              setShowJump(false);
            }}
          >
            Jump to latest
          </button>
        ) : null}
      </div>
    </div>
  );
}
