import { PanelLeftClose, Plus } from "lucide-react";
import type { ConversationSummary } from "@minimi/shared";
import { ConversationList } from "../chat/ConversationList.js";
import { ThemeToggle } from "./ThemeToggle.js";

type Props = {
  conversations: ConversationSummary[];
  activeId: string | null;
  timeZone: string;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  onSearchQuery: (value: string) => void;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
  themeResolved: "light" | "dark";
  onToggleTheme: () => void;
  userLabel?: string | null;
  onLogout?: () => void;
};

export function Sidebar({
  conversations,
  activeId,
  timeZone,
  loading,
  error,
  searchQuery,
  onSearchQuery,
  onNewChat,
  onSelect,
  onRename,
  onArchive,
  onDelete,
  onCollapse,
  themeResolved,
  onToggleTheme,
  userLabel,
  onLogout,
}: Props) {
  return (
    <aside className="sidebar" aria-label="Conversations">
      <div className="sidebar__brand">
        <div>
          <h1>Minimi</h1>
          <span>Research Agent</span>
        </div>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          aria-label="Collapse sidebar"
          onClick={onCollapse}
        >
          <PanelLeftClose size={16} />
        </button>
      </div>

      <button type="button" className="btn btn--primary" onClick={onNewChat}>
        <Plus size={16} />
        New conversation
      </button>

      <input
        className="sidebar__search"
        type="search"
        placeholder="Search conversations…"
        value={searchQuery}
        onChange={(event) => onSearchQuery(event.target.value)}
        aria-label="Search conversations"
      />

      <ConversationList
        conversations={conversations}
        activeId={activeId}
        timeZone={timeZone}
        loading={loading}
        error={error}
        onSelect={onSelect}
        onRename={onRename}
        onArchive={onArchive}
        onDelete={onDelete}
      />

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>
            {userLabel ?? "Settings"}
          </span>
          <ThemeToggle resolved={themeResolved} onToggle={onToggleTheme} />
        </div>
        {onLogout ? (
          <button type="button" className="btn btn--ghost" onClick={onLogout}>
            Sign out
          </button>
        ) : null}
      </div>
    </aside>
  );
}
