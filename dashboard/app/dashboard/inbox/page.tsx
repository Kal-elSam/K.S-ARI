"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getConversations, getMessages, type Conversation, type ConversationStatus, type Message } from "@/lib/api";

type Sender = "bot" | "user";

interface UIMessage {
  id: string;
  sender: Sender;
  content: string;
  time: string;
}

function getStatusChipClass(status: ConversationStatus): string {
  // Mapeo explícito de estado -> color para mantener consistencia visual.
  switch (status) {
    case "NEW_LEAD":
      return "bg-slate-500/20 text-slate-200 border-slate-400/30";
    case "QUALIFYING":
      return "bg-blue-500/20 text-blue-200 border-blue-400/30";
    case "READY_TO_BOOK":
      return "bg-amber-500/20 text-amber-200 border-amber-400/30";
    case "BOOKED":
      return "bg-emerald-500/20 text-emerald-200 border-emerald-400/30";
    case "FOLLOW_UP":
      return "bg-orange-500/20 text-orange-200 border-orange-400/30";
    default: {
      const exhaustiveCheck: never = status;
      return exhaustiveCheck;
    }
  }
}

function normalizeStatus(status: string): ConversationStatus {
  switch (status) {
    case "NEW_LEAD":
    case "QUALIFYING":
    case "READY_TO_BOOK":
    case "BOOKED":
    case "FOLLOW_UP":
      return status;
    default:
      return "FOLLOW_UP";
  }
}

function formatMessageTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-MX", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function toUIMessage(message: Message): UIMessage {
  return {
    id: message.id,
    sender: message.from === "ari" ? "bot" : "user",
    content: message.text,
    time: formatMessageTime(message.sent_at),
  };
}

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [isLoadingConversations, setIsLoadingConversations] = useState<boolean>(true);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [errorConversations, setErrorConversations] = useState<string>("");
  const [errorMessages, setErrorMessages] = useState<string>("");
  const [manualMessage, setManualMessage] = useState<string>("");
  const [isManualControl, setIsManualControl] = useState<boolean>(false);
  const [highlightedConversationIds, setHighlightedConversationIds] = useState<string[]>([]);
  const previousConversationIdsRef = useRef<Set<string>>(new Set());
  const highlightTimeoutsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    let isMounted = true;

    const loadConversations = async (showSkeleton: boolean) => {
      if (showSkeleton) {
        setIsLoadingConversations(true);
      }

      try {
        const data = await getConversations();
        if (!isMounted) {
          return;
        }

        const previousIds = previousConversationIdsRef.current;
        const incomingIds = new Set(data.map((conversation) => conversation.id));
        const newConversationIds =
          previousIds.size === 0
            ? []
            : data
                .filter((conversation) => !previousIds.has(conversation.id))
                .map((conversation) => conversation.id);

        if (newConversationIds.length > 0) {
          setHighlightedConversationIds((currentIds) =>
            Array.from(new Set([...currentIds, ...newConversationIds]))
          );

          // Se limpia cada resaltado en 2s para mantener señal visual breve.
          newConversationIds.forEach((conversationId) => {
            const existingTimeout = highlightTimeoutsRef.current[conversationId];
            if (existingTimeout) {
              window.clearTimeout(existingTimeout);
            }

            highlightTimeoutsRef.current[conversationId] = window.setTimeout(() => {
              setHighlightedConversationIds((currentIds) =>
                currentIds.filter((currentId) => currentId !== conversationId)
              );
              delete highlightTimeoutsRef.current[conversationId];
            }, 2_000);
          });
        }

        previousConversationIdsRef.current = incomingIds;
        setConversations(data);
        setSelectedId((currentId) => {
          if (currentId && data.some((conversation) => conversation.id === currentId)) {
            return currentId;
          }
          return data[0]?.id || "";
        });
        setErrorConversations("");
      } catch {
        if (isMounted) {
          setErrorConversations("No se pudieron cargar las conversaciones");
        }
      } finally {
        if (isMounted && showSkeleton) {
          setIsLoadingConversations(false);
        }
      }
    };

    // Primer fetch + polling cada 15s para refrescar inbox.
    void loadConversations(true);
    const conversationsIntervalId = window.setInterval(() => {
      void loadConversations(false);
    }, 15_000);

    return () => {
      isMounted = false;
      window.clearInterval(conversationsIntervalId);
      Object.values(highlightTimeoutsRef.current).forEach((timeoutId) => {
        window.clearTimeout(timeoutId);
      });
      highlightTimeoutsRef.current = {};
    };
  }, []);

  const selectedConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === selectedId) ?? conversations[0],
    [conversations, selectedId]
  );

  useEffect(() => {
    if (!selectedConversation?.phone) {
      setMessages([]);
      return;
    }

    let isMounted = true;
    const loadMessages = async () => {
      setIsLoadingMessages(true);
      setErrorMessages("");

      try {
        const data = await getMessages(selectedConversation.phone);
        if (isMounted) {
          setMessages(data.map(toUIMessage));
        }
      } catch {
        if (isMounted) {
          setErrorMessages("No se pudieron cargar los mensajes");
          setMessages([]);
        }
      } finally {
        if (isMounted) {
          setIsLoadingMessages(false);
        }
      }
    };

    loadMessages();
    return () => {
      isMounted = false;
    };
  }, [selectedConversation?.phone]);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-2xl font-semibold text-white">Inbox</h2>
        <p className="mt-1 text-sm text-slate-400">Conversaciones recientes en WhatsApp.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <article className="rounded-xl border border-white/10 bg-ari-card p-3">
          {errorConversations ? <p className="mb-3 text-xs text-red-300">{errorConversations}</p> : null}
          <ul className="space-y-2">
            {isLoadingConversations
              ? Array.from({ length: 5 }).map((_, index) => (
                  <li key={`conversation-skeleton-${index}`} className="rounded-lg border border-white/10 bg-white/5 p-3">
                    <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-3 w-24 animate-pulse rounded bg-white/10" />
                  </li>
                ))
              : conversations.map((conversation) => (
                  <li key={conversation.id}>
                    {(() => {
                      const isSelected = selectedId === conversation.id;
                      const isHighlighted = highlightedConversationIds.includes(conversation.id);
                      const conversationClass = isSelected
                        ? "border-ari-accent bg-ari-accent/10"
                        : isHighlighted
                          ? "border-violet-400 bg-violet-500/10"
                          : "border-white/10 bg-white/5 hover:border-white/20";

                      return (
                    <button
                      type="button"
                      onClick={() => setSelectedId(conversation.id)}
                      className={`w-full rounded-lg border p-3 text-left transition ${conversationClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-medium text-white">{conversation.phone}</p>
                        <span
                          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${getStatusChipClass(
                            normalizeStatus(conversation.state)
                          )}`}
                        >
                          {conversation.state}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-400">{conversation.business_id}</p>
                    </button>
                      );
                    })()}
                  </li>
                ))}
          </ul>
        </article>

        <article className="flex min-h-[560px] flex-col rounded-xl border border-white/10 bg-ari-card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <div>
              <p className="font-medium text-white">{selectedConversation?.phone || "Sin selección"}</p>
              <p className="text-xs text-slate-400">{selectedConversation?.business_id || "-"}</p>
            </div>
            <button
              type="button"
              onClick={() => setIsManualControl((currentValue) => !currentValue)}
              className="rounded-lg bg-ari-accent px-3 py-2 text-sm font-medium text-white transition hover:brightness-110"
            >
              {isManualControl ? "Control manual activo" : "Tomar control"}
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {errorMessages ? <p className="text-xs text-red-300">{errorMessages}</p> : null}

            {isLoadingMessages
              ? Array.from({ length: 4 }).map((_, index) => (
                  <div
                    key={`msg-skeleton-${index}`}
                    className="max-w-[75%] rounded-2xl bg-white/10 px-3 py-2"
                  >
                    <div className="h-4 w-48 animate-pulse rounded bg-white/10" />
                    <div className="mt-2 h-3 w-14 animate-pulse rounded bg-white/10" />
                  </div>
                ))
              : messages.map((message) => (
                  <div
                    key={message.id}
                    className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                      message.sender === "bot"
                        ? "mr-auto bg-white/10 text-slate-100"
                        : "ml-auto bg-ari-accent/25 text-violet-100"
                    }`}
                  >
                    <p>{message.content}</p>
                    <p className="mt-1 text-[11px] text-slate-400">{message.time}</p>
                  </div>
                ))}
          </div>

          <footer className="border-t border-white/10 p-4">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setManualMessage("");
              }}
              className="flex gap-2"
            >
              <input
                value={manualMessage}
                onChange={(event) => setManualMessage(event.target.value)}
                placeholder="Enviar mensaje manual..."
                className="w-full rounded-lg border border-white/10 bg-[#111217] px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500 focus:border-ari-accent"
              />
              <button
                type="submit"
                className="rounded-lg border border-ari-accent bg-ari-accent/20 px-4 py-2 text-sm font-medium text-violet-200 hover:bg-ari-accent/30"
              >
                Enviar
              </button>
            </form>
          </footer>
        </article>
      </div>
    </section>
  );
}
