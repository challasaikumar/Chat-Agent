import { useCallback, useMemo, useState } from "react";
import { Navigate, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useChat } from "./hooks/useChat.js";
import { useTheme } from "./hooks/useTheme.js";
import { Sidebar } from "./components/layout/Sidebar.js";
import { ChatWorkspace } from "./components/chat/ChatWorkspace.js";
import { AuthProvider } from "./auth/AuthProvider.js";
import { ProtectedRoute } from "./auth/ProtectedRoute.js";
import { useAuth } from "./auth/useAuth.js";
import { LoginPage } from "./pages/LoginPage.js";
import { UnauthorizedPage } from "./pages/UnauthorizedPage.js";

const APP_NAME = (import.meta.env.VITE_APP_NAME as string | undefined) ?? "Minimi";

function ChatPage() {
  const params = useParams();
  const navigate = useNavigate();
  const auth = useAuth();
  const conversationIdFromRoute = params.conversationId ?? null;
  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  }, []);

  const theme = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const onNavigate = useCallback(
    (id: string | null) => {
      if (id) navigate(`/chat/${id}`);
      else navigate("/");
    },
    [navigate],
  );

  const chat = useChat({
    conversationIdFromRoute,
    timeZone,
    onNavigate,
  });

  return (
    <div
      className={`app-shell ${sidebarOpen ? "app-shell--sidebar-open" : "app-shell--sidebar-collapsed"}`}
    >
      {sidebarOpen ? (
        <button
          type="button"
          className="mobile-overlay"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <Sidebar
        conversations={chat.conversations}
        activeId={chat.activeId}
        timeZone={chat.timeZone}
        loading={chat.conversationsLoading}
        error={chat.conversationsError}
        searchQuery={chat.searchQuery}
        onSearchQuery={chat.setSearchQuery}
        onNewChat={() => void chat.startNewConversation()}
        onSelect={(id) => {
          void chat.selectConversation(id);
          // Only auto-close the drawer on small screens; desktop keeps the sidebar.
          if (window.matchMedia("(max-width: 900px)").matches) {
            setSidebarOpen(false);
          }
        }}
        onRename={(id, title) => void chat.renameConversation(id, title)}
        onArchive={(id) => void chat.archiveConversation(id)}
        onDelete={(id) => void chat.removeConversation(id)}
        onCollapse={() => setSidebarOpen(false)}
        themeResolved={theme.resolved}
        onToggleTheme={theme.toggle}
        userLabel={auth.user?.displayName ?? auth.user?.email ?? null}
        onLogout={() => void auth.logout()}
      />

      <ChatWorkspace
        title={chat.activeConversation?.title || APP_NAME}
        messages={chat.messages}
        citations={chat.citations}
        messagesLoading={chat.messagesLoading}
        messagesError={chat.messagesError}
        draft={chat.draft}
        onDraftChange={chat.setDraft}
        onSend={(value) => void chat.sendMessage(value)}
        onStop={chat.stopGeneration}
        isGenerating={chat.isGenerating}
        statusMessage={chat.statusMessage}
        streamError={chat.streamError}
        timeZone={chat.timeZone}
        activeCitation={chat.activeCitation}
        onOpenCitation={chat.setActiveCitation}
        onNewChat={() => void chat.startNewConversation()}
        onDeleteChat={
          chat.activeId
            ? () => void chat.removeConversation(chat.activeId!)
            : undefined
        }
        onOpenSidebar={() => setSidebarOpen(true)}
        sourcesOpen={sourcesOpen}
        onToggleSources={() => setSourcesOpen((v) => !v)}
      />
    </div>
  );
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/unauthorized" element={<UnauthorizedPage />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/chat/:conversationId"
          element={
            <ProtectedRoute>
              <ChatPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
