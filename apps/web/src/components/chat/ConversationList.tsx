import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import type { ConversationSummary } from "@minimi/shared";
import { groupConversationLabel } from "../../lib/dates.js";

type Props = {
  conversations: ConversationSummary[];
  activeId: string | null;
  timeZone: string;
  loading: boolean;
  error: string | null;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void | Promise<void>;
};

const GROUP_ORDER = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous 30 days",
  "Older",
];

export function ConversationList({
  conversations,
  activeId,
  timeZone,
  loading,
  error,
  onSelect,
  onRename,
  onArchive,
  onDelete,
}: Props) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, ConversationSummary[]>();
    for (const conversation of conversations) {
      const label = groupConversationLabel(
        conversation.updatedAt,
        timeZone,
      );
      const list = map.get(label) ?? [];
      list.push(conversation);
      map.set(label, list);
    }
    return GROUP_ORDER.filter((label) => map.has(label)).map((label) => ({
      label,
      items: map.get(label)!,
    }));
  }, [conversations, timeZone]);

  async function handleDelete(conversation: ConversationSummary) {
    const title = conversation.title || "Untitled";
    if (
      !window.confirm(
        `Delete “${title}”? This permanently removes the chat and cannot be undone.`,
      )
    ) {
      return;
    }
    setDeletingId(conversation.id);
    try {
      await onDelete(conversation.id);
    } finally {
      setDeletingId(null);
    }
  }

  if (loading) {
    return <p className="message__meta">Loading conversations…</p>;
  }
  if (error) {
    return <div className="error-banner">{error}</div>;
  }
  if (conversations.length === 0) {
    return <p className="message__meta">No conversations yet.</p>;
  }

  return (
    <div style={{ overflowY: "auto", flex: 1, minHeight: 0 }}>
      {groups.map((group) => (
        <section key={group.label} className="conversation-group">
          <h3 className="conversation-group__label">{group.label}</h3>
          {group.items.map((conversation) => (
            <div
              key={conversation.id}
              className={`conversation-item ${
                conversation.id === activeId ? "conversation-item--active" : ""
              }`}
            >
              <button
                type="button"
                className="conversation-item__title"
                style={{
                  border: "none",
                  background: "transparent",
                  color: "inherit",
                  textAlign: "left",
                  padding: 0,
                }}
                onClick={() => onSelect(conversation.id)}
              >
                {conversation.title || "Untitled"}
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon conversation-item__delete"
                aria-label={`Delete ${conversation.title || "conversation"}`}
                title="Delete chat"
                disabled={deletingId === conversation.id}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  void handleDelete(conversation);
                }}
              >
                <Trash2 size={14} />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--icon"
                aria-label="Rename or archive"
                title="Rename or archive"
                onClick={() => {
                  const next = window.prompt(
                    "Rename conversation",
                    conversation.title ?? "",
                  );
                  if (next && next.trim()) {
                    onRename(conversation.id, next.trim());
                    return;
                  }
                  if (
                    window.confirm(
                      "Archive this conversation? It will leave the main list.",
                    )
                  ) {
                    onArchive(conversation.id);
                  }
                }}
              >
                ···
              </button>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
