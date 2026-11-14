import { Menu, BookOpen, Trash2 } from "lucide-react";
import type { CitationReference } from "@minimi/shared";
import type { UiMessage } from "../../hooks/useChat.js";
import { MessageList } from "./MessageList.js";
import { MessageComposer } from "./MessageComposer.js";
import { SourcePanel } from "../citations/SourcePanel.js";

type Props = {
  title: string;
  messages: UiMessage[];
  citations: CitationReference[];
  messagesLoading: boolean;
  messagesError: string | null;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: (value: string) => void;
  onStop: () => void;
  isGenerating: boolean;
  statusMessage: string | null;
  streamError: string | null;
  timeZone: string;
  activeCitation: CitationReference | null;
  onOpenCitation: (citation: CitationReference | null) => void;
  onNewChat: () => void;
  onDeleteChat?: () => void;
  onOpenSidebar: () => void;
  sourcesOpen: boolean;
  onToggleSources: () => void;
};

export function ChatWorkspace({
  title,
  messages,
  citations,
  messagesLoading,
  messagesError,
  draft,
  onDraftChange,
  onSend,
  onStop,
  isGenerating,
  statusMessage,
  streamError,
  timeZone,
  activeCitation,
  onOpenCitation,
  onNewChat,
  onDeleteChat,
  onOpenSidebar,
  sourcesOpen,
  onToggleSources,
}: Props) {
  const empty = messages.length === 0 && !messagesLoading;

  return (
    <main className="chat-workspace">
      <header className="chat-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.65rem" }}>
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            aria-label="Open conversations"
            onClick={onOpenSidebar}
          >
            <Menu size={16} />
          </button>
          <h2>{title}</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          {onDeleteChat ? (
            <button
              type="button"
              className="btn btn--ghost"
              aria-label="Delete conversation"
              title="Delete conversation"
              onClick={() => {
                if (
                  window.confirm(
                    `Delete “${title}”? This permanently removes the chat and cannot be undone.`,
                  )
                ) {
                  onDeleteChat();
                }
              }}
            >
              <Trash2 size={16} />
              Delete
            </button>
          ) : null}
          <button
            type="button"
            className="btn"
            onClick={onToggleSources}
            aria-pressed={sourcesOpen}
          >
            <BookOpen size={16} />
            Sources {citations.length ? `(${citations.length})` : ""}
          </button>
        </div>
      </header>

      <MessageList
        messages={messages}
        citations={citations}
        loading={messagesLoading}
        error={messagesError}
        activityMessage={statusMessage}
        showActivity={isGenerating}
        timeZone={timeZone}
        onOpenCitation={(citation) => {
          onOpenCitation(citation);
          if (!sourcesOpen) onToggleSources();
        }}
        onNewChat={onNewChat}
        empty={empty}
      />

      {streamError ? (
        <div style={{ maxWidth: "var(--chat-max)", margin: "0 auto", padding: "0 1.25rem 0.75rem" }}>
          <div className="error-banner" role="alert">
            {streamError}
          </div>
        </div>
      ) : null}

      <MessageComposer
        value={draft}
        onChange={onDraftChange}
        onSend={onSend}
        onStop={onStop}
        generating={isGenerating}
        disabled={isGenerating}
      />

      <SourcePanel
        open={sourcesOpen}
        citations={citations}
        selected={activeCitation}
        onSelect={onOpenCitation}
        onClose={() => {
          onOpenCitation(null);
          onToggleSources();
        }}
      />
    </main>
  );
}
