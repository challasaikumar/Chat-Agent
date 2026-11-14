import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentEvent,
  AgentRunUiStatus,
  CitationReference,
  ConversationMessage,
  ConversationSummary,
} from "@minimi/shared";
import {
  createConversation,
  deleteConversation,
  getConversation,
  listConversations,
  listMessages,
  updateConversation,
} from "../services/conversation.api.js";
import { getAgentRun, streamAgentTurn } from "../services/agent.api.js";
import { ApiError } from "../services/api.client.js";

const ACTIVE_KEY = "minimi.activeConversationId";
const DRAFT_PREFIX = "minimi.draft.";

export type UiMessage = ConversationMessage & {
  pending?: boolean;
  streaming?: boolean;
  incomplete?: boolean;
};

export function useChat(options: {
  conversationIdFromRoute: string | null;
  timeZone: string;
  onNavigate: (conversationId: string | null) => void;
}) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [conversationsLoading, setConversationsLoading] = useState(true);
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  );
  const [activeId, setActiveId] = useState<string | null>(
    options.conversationIdFromRoute,
  );
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [status, setStatus] = useState<AgentRunUiStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [citations, setCitations] = useState<CitationReference[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [activeCitation, setActiveCitation] =
    useState<CitationReference | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");

  const abortRef = useRef<AbortController | null>(null);
  const activeIdRef = useRef(activeId);
  const runIdRef = useRef<string | null>(null);
  const clientRequestIdRef = useRef<string | null>(null);

  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [searchQuery]);

  const refreshConversations = useCallback(async () => {
    setConversationsLoading(true);
    setConversationsError(null);
    try {
      const page = await listConversations({ limit: 50 });
      setConversations(page.items);
    } catch (error) {
      setConversationsError(
        error instanceof Error ? error.message : "Failed to load conversations",
      );
    } finally {
      setConversationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshConversations();
  }, [refreshConversations]);

  const loadMessages = useCallback(async (conversationId: string) => {
    setMessagesLoading(true);
    setMessagesError(null);
    try {
      const page = await listMessages(conversationId, { limit: 50 });
      // API returns newest-first typically — normalize to chronological
      const items = [...page.items].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
          a.id - b.id,
      );
      setMessages(items);
      setNextCursor(page.nextCursor);
    } catch (error) {
      setMessages([]);
      setMessagesError(
        error instanceof Error ? error.message : "Failed to load messages",
      );
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  const selectConversation = useCallback(
    async (id: string | null) => {
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      setStatus("idle");
      setStatusMessage(null);
      setStreamError(null);
      setCitations([]);
      setActiveCitation(null);

      if (activeId) {
        localStorage.setItem(`${DRAFT_PREFIX}${activeId}`, draft);
      }

      setActiveId(id);
      options.onNavigate(id);
      if (id) {
        localStorage.setItem(ACTIVE_KEY, id);
        setDraft(localStorage.getItem(`${DRAFT_PREFIX}${id}`) ?? "");
        await loadMessages(id);
      } else {
        localStorage.removeItem(ACTIVE_KEY);
        setMessages([]);
        setDraft("");
      }
    },
    [activeId, draft, loadMessages, options],
  );

  // Sync route → state
  useEffect(() => {
    const routeId = options.conversationIdFromRoute;
    if (routeId === activeId) {
      return;
    }
    if (!routeId) {
      void selectConversation(null);
      return;
    }
    void (async () => {
      try {
        await getConversation(routeId);
        setActiveId(routeId);
        localStorage.setItem(ACTIVE_KEY, routeId);
        setDraft(localStorage.getItem(`${DRAFT_PREFIX}${routeId}`) ?? "");
        await loadMessages(routeId);
      } catch {
        localStorage.removeItem(ACTIVE_KEY);
        setMessagesError("Conversation not found. Start a new chat.");
        setActiveId(null);
        options.onNavigate(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.conversationIdFromRoute]);

  const startNewConversation = useCallback(async () => {
    const created = await createConversation();
    setConversations((prev) => [created, ...prev]);
    await selectConversation(created.id);
    return created;
  }, [selectConversation]);

  const renameConversation = useCallback(
    async (id: string, title: string) => {
      const updated = await updateConversation(id, { title });
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, ...updated } : c)),
      );
    },
    [],
  );

  const archiveConversation = useCallback(
    async (id: string) => {
      await updateConversation(id, { archived: true });
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        await selectConversation(null);
      }
    },
    [activeId, selectConversation],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      const previous = conversations;
      // Optimistic UI so the chat disappears immediately.
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
        setMessages([]);
        localStorage.removeItem(ACTIVE_KEY);
        options.onNavigate(null);
      }
      try {
        await deleteConversation(id);
      } catch (error) {
        setConversations(previous);
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Failed to delete conversation";
        setConversationsError(message);
        window.alert(`Could not delete chat: ${message}`);
        throw error;
      }
    },
    [activeId, conversations, options],
  );

  const stopGeneration = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (raw: string) => {
      const content = raw.trim();
      if (!content || status === "submitting" || status === "streaming") {
        return;
      }

      let conversationId = activeId;
      if (!conversationId) {
        const created = await createConversation();
        setConversations((prev) => [created, ...prev]);
        conversationId = created.id;
        setActiveId(created.id);
        options.onNavigate(created.id);
        localStorage.setItem(ACTIVE_KEY, created.id);
      }

      const clientRequestId = crypto.randomUUID();
      clientRequestIdRef.current = clientRequestId;
      const optimisticId = -Date.now();
      const optimisticUser: UiMessage = {
        id: optimisticId,
        conversationId,
        role: "user",
        content,
        metadata: null,
        createdAt: new Date().toISOString(),
        pending: true,
      };
      const streamingAssistant: UiMessage = {
        id: optimisticId - 1,
        conversationId,
        role: "assistant",
        content: "",
        metadata: null,
        createdAt: new Date().toISOString(),
        streaming: true,
      };

      setDraft("");
      localStorage.removeItem(`${DRAFT_PREFIX}${conversationId}`);
      setMessages((prev) => [...prev, optimisticUser, streamingAssistant]);
      setStatus("submitting");
      setStatusMessage("Sending…");
      setStreamError(null);
      setCitations([]);

      const controller = new AbortController();
      abortRef.current = controller;
      const boundConversationId = conversationId;
      let sawEvent = false;
      const stallTimer = window.setTimeout(() => {
        if (!sawEvent && !controller.signal.aborted) {
          controller.abort();
          setStatus("failed");
          setStreamError(
            "No response from the assistant (connection stalled). Please try again.",
          );
          setStatusMessage(null);
          setMessages((prev) => prev.filter((m) => !m.streaming));
        }
      }, 120_000);

      try {
        await streamAgentTurn(
          {
            conversationId,
            message: content,
            timeZone: options.timeZone,
            clientRequestId,
          },
          {
            signal: controller.signal,
            onEvent: (event) => {
              if (activeIdRef.current !== boundConversationId) {
                return;
              }
              sawEvent = true;
              window.clearTimeout(stallTimer);
              handleAgentEvent(event, {
                setStatus,
                setStatusMessage,
                setCitations,
                setMessages,
                setConversations,
                setStreamError,
                runIdRef,
              });
            },
          },
        );
      } catch (error) {
        window.clearTimeout(stallTimer);
        if (controller.signal.aborted) {
          // Stall timer already set a failed state + message.
          if (!sawEvent) {
            // keep failed state from stall timer / explicit failure
          } else {
            setStatus("cancelled");
            setStatusMessage("Generation stopped");
            setMessages((prev) =>
              prev.map((m) =>
                m.streaming
                  ? { ...m, streaming: false, incomplete: true }
                  : m,
              ),
            );
          }
        } else {
          setStatus("failed");
          setStreamError(
            error instanceof Error ? error.message : "Request failed",
          );
          setMessages((prev) => prev.filter((m) => !m.streaming));
        }
      } finally {
        window.clearTimeout(stallTimer);
        abortRef.current = null;
        // Reconcile with persisted history
        if (activeIdRef.current === boundConversationId) {
          try {
            await loadMessages(boundConversationId);
            await refreshConversations();
            if (runIdRef.current) {
              const run = await getAgentRun(runIdRef.current);
              if (run.status === "cancelled") {
                setStatus("cancelled");
              } else if (run.status === "failed") {
                setStatus("failed");
              } else if (run.status === "completed") {
                setStatus("completed");
              }
            }
          } catch (error) {
            if (error instanceof ApiError) {
              if (error.message.toLowerCase().includes("not found")) {
                localStorage.removeItem(ACTIVE_KEY);
                setActiveId(null);
                options.onNavigate(null);
                setMessages([]);
                setMessagesError("Conversation not found. Start a new chat.");
              } else {
                setMessagesError(error.message);
              }
            }
          }
        }
      }
    },
    [activeId, loadMessages, options, refreshConversations, status],
  );

  const filteredConversations = useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) =>
      (c.title ?? "").toLowerCase().includes(q),
    );
  }, [conversations, debouncedSearchQuery]);

  const activeConversation = conversations.find((c) => c.id === activeId) ?? null;
  const isGenerating =
    status === "submitting" ||
    status === "retrieving_context" ||
    status === "searching" ||
    status === "evaluating_sources" ||
    status === "composing_answer" ||
    status === "streaming";

  return {
    conversations: filteredConversations,
    conversationsLoading,
    conversationsError,
    refreshConversations,
    activeId,
    activeConversation,
    messages,
    messagesLoading,
    messagesError,
    nextCursor,
    draft,
    setDraft,
    status,
    statusMessage,
    citations,
    streamError,
    activeCitation,
    setActiveCitation,
    searchQuery,
    setSearchQuery,
    selectConversation,
    startNewConversation,
    renameConversation,
    archiveConversation,
    removeConversation,
    sendMessage,
    stopGeneration,
    isGenerating,
    timeZone: options.timeZone,
  };
}

function mapStageToUiStatus(
  stage: Extract<AgentEvent, { type: "agent.status" }>["stage"],
): AgentRunUiStatus {
  switch (stage) {
    case "retrieving_context":
      return "retrieving_context";
    case "planning_research":
      return "planning_research";
    case "searching":
      return "searching";
    case "evaluating_sources":
      return "evaluating_sources";
    case "comparing_information":
      return "comparing_information";
    case "composing_answer":
      return "composing_answer";
    default:
      return "streaming";
  }
}

function handleAgentEvent(
  event: AgentEvent,
  ctx: {
    setStatus: (s: AgentRunUiStatus) => void;
    setStatusMessage: (s: string | null) => void;
    setCitations: React.Dispatch<React.SetStateAction<CitationReference[]>>;
    setMessages: React.Dispatch<React.SetStateAction<UiMessage[]>>;
    setConversations: React.Dispatch<
      React.SetStateAction<ConversationSummary[]>
    >;
    setStreamError: (s: string | null) => void;
    runIdRef: React.MutableRefObject<string | null>;
  },
) {
  switch (event.type) {
    case "run.started":
      ctx.runIdRef.current = event.runId;
      ctx.setStatus("retrieving_context");
      break;
    case "agent.status":
      ctx.setStatus(
        event.stage === "composing_answer"
          ? "streaming"
          : mapStageToUiStatus(event.stage),
      );
      ctx.setStatusMessage(event.message);
      break;
    case "tool.started":
      ctx.setStatus("searching");
      ctx.setStatusMessage(`Searching: ${event.query}`);
      break;
    case "tool.completed":
      ctx.setStatusMessage(
        `Found ${event.resultCount} source${event.resultCount === 1 ? "" : "s"}`,
      );
      break;
    case "citation.available":
      ctx.setCitations((prev) => {
        if (prev.some((c) => c.id === event.citation.id)) return prev;
        return [...prev, event.citation];
      });
      break;
    case "message.delta":
      ctx.setStatus("streaming");
      ctx.setMessages((prev) => {
        const copy = [...prev];
        for (let i = copy.length - 1; i >= 0; i -= 1) {
          if (copy[i]?.streaming) {
            copy[i] = {
              ...copy[i]!,
              content: `${copy[i]!.content}${event.delta}`,
            };
            break;
          }
        }
        return copy;
      });
      break;
    case "run.completed":
      ctx.setStatus("completed");
      ctx.setStatusMessage(null);
      ctx.setCitations(event.citations);
      if (event.conversationTitle) {
        ctx.setConversations((prev) =>
          prev.map((c) =>
            c.id === event.conversationId
              ? { ...c, title: event.conversationTitle ?? c.title }
              : c,
          ),
        );
      }
      ctx.setMessages((prev) => {
        const withoutStreaming = prev.filter((m) => !m.streaming && !m.pending);
        return [
          ...withoutStreaming,
          {
            id: event.messageId,
            conversationId: event.conversationId,
            role: "assistant",
            content: event.answer,
            metadata: { citations: event.citations.map((c) => c.id) },
            createdAt: new Date().toISOString(),
          },
        ];
      });
      break;
    case "run.cancelled":
      ctx.setStatus("cancelled");
      ctx.setStatusMessage("Generation stopped");
      ctx.setMessages((prev) =>
        prev.map((m) =>
          m.streaming ? { ...m, streaming: false, incomplete: true } : m,
        ),
      );
      break;
    case "run.error":
      ctx.setStatus("failed");
      ctx.setStreamError(event.message);
      ctx.setMessages((prev) => prev.filter((m) => !m.streaming));
      if (event.code === "NOT_FOUND") {
        localStorage.removeItem(ACTIVE_KEY);
      }
      break;
  }
}
