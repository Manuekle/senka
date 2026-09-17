"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  BubbleChatIcon,
  Delete01Icon,
  Add01Icon,
  } from "@hugeicons/core-free-icons";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { MessageResponse } from "@/components/ai-elements/message-response";
import {
  PromptInput,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { TextShimmer } from "@/components/motion/text-shimmer";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchJson, networkUiError, readApiError, type UiError } from "@/lib/api-error-message";
import { relativeTime } from "@/lib/format";
import { usePolling } from "@/lib/use-polling";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import type { Agent, AgentChatSession, ChannelConversation, ChannelId } from "@/lib/types";
import { CHANNEL_LABELS, ChannelIcon } from "../../../../_components/channel-badge";
import { ProspectBadge } from "../../../../_components/prospect-badge";
import { PageContainer } from "../../../../_components/page-container";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../_components/dashboard-card";
import { Spinner } from "@/components/ui/spinner";
import { SuggestionChip } from "@/components/ui/suggestion-chip";

/**
 * The text half of the agent playground — the same screen shape as
 * .../voice: the conversation on the left, what has been saved on the right.
 *
 * It runs the agent's real prompt on its real model and no tools at all (the
 * route tells it to narrate what it would reach for), so nothing said here
 * lands in the CRM or on a channel. Each conversation is saved once the first
 * answer completes, and every answer after that replaces it, so the list on
 * the right is what this agent has been rehearsed on.
 */

const STARTERS = ["agents.chatStarter1", "agents.chatStarter2", "agents.chatStarter3"] as const;

/** The Meta messaging products, in the order the Connections page lists them.
 *  Web chat is left out on purpose: it is this app's own surface and is
 *  always up, so a badge for it says nothing. */
const META_CHANNELS: readonly ChannelId[] = ["whatsapp", "instagram"];

type ChatTurn = { readonly id: number; readonly role: "user" | "assistant"; readonly content: string };

/** What /api/conversations lists — the record without its transcript. */
type ConversationSummary = Omit<ChannelConversation, "turns"> & {
  readonly turnCount: number;
  readonly lastMessage: string;
};

export default function AgentChatPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id;
  const t = useT();
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [status, setStatus] = useState<"ready" | "submitted" | "streaming">("ready");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saved, setSaved] = useState<AgentChatSession[]>([]);
  const [channels, setChannels] = useState<Record<string, boolean>>({});

  // The right column shows one of two histories: this agent's rehearsals, or
  // the real conversations running on the connected channels.
  const [sidebarTab, setSidebarTab] = useState<"test" | "real">("test");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  // A real conversation, once opened, takes over the main pane read-only —
  // it is the agent's conversation with a customer, not a place to type.
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<ChannelConversation | null>(null);
  const [assessing, setAssessing] = useState(false);
  // Below `lg` the two columns stack, and the history column is tall enough
  // to squeeze the conversation to nothing — so a phone shows one at a time.
  const [mobilePane, setMobilePane] = useState<"chat" | "history">("chat");

  const turnId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const loadAgent = useCallback(async () => {
    const result = await fetchJson<{ agents?: Agent[] }>("/api/agents", t);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setAgent(result.data.agents?.find((a) => a.id === agentId) ?? null);
    setLoading(false);
  }, [agentId, t]);

  const loadSaved = useCallback(async () => {
    if (!agentId) return;
    const result = await fetchJson<{ chats: AgentChatSession[] }>(
      `/api/agents/${encodeURIComponent(agentId)}/chats`,
      t,
    );
    if (result.ok) setSaved(result.data.chats);
  }, [agentId, t]);

  useEffect(() => {
    void loadAgent();
  }, [loadAgent]);

  useEffect(() => {
    void loadSaved();
  }, [loadSaved]);

  // Whether the agent has anywhere to answer once it goes live. A failed
  // request leaves the card empty rather than claiming everything is down —
  // "disconnected" is a statement about the account, not about this fetch.
  useEffect(() => {
    let cancelled = false;
    void fetchJson<{ status?: Record<string, boolean> }>("/api/channels/status", t).then(
      (result) => {
        if (!cancelled && result.ok) setChannels(result.data.status ?? {});
      },
    );
    return () => {
      cancelled = true;
    };
  }, [t]);

  // A stream outliving the screen would keep costing money and writing into
  // state nobody shows.
  useEffect(() => () => abortRef.current?.abort(), []);

  const loadConversations = useCallback(async () => {
    const result = await fetchJson<{ conversations: ConversationSummary[] }>(
      "/api/conversations",
      t,
    );
    if (result.ok) setConversations(result.data.conversations);
  }, [t]);

  const loadOpen = useCallback(async () => {
    if (!openId) return;
    const result = await fetchJson<{ conversation: ChannelConversation }>(
      `/api/conversations/${encodeURIComponent(openId)}`,
      t,
    );
    if (result.ok) setOpen(result.data.conversation);
  }, [openId, t]);

  // The list refreshes while its tab is up; the open conversation refreshes
  // faster, which is what makes a chat with a customer readable as it happens.
  usePolling(() => void loadConversations(), 15_000, sidebarTab === "real");
  usePolling(() => void loadOpen(), 5_000, openId !== null);

  // Switching straight from one conversation to another keeps the poller
  // enabled, so without this the new transcript would wait out the interval.
  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  /** Read a real conversation's transcript again, now. */
  const assess = async (kind: "conversation" | "call", id: string) => {
    setAssessing(true);
    const result = await fetchJson(`/api/prospect/assess`, t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind, id }),
    });
    setAssessing(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await Promise.all([loadOpen(), loadConversations()]);
  };

  const openConversation = (summary: ConversationSummary) => {
    stop();
    setError(null);
    setOpenId(summary.id);
    setMobilePane("chat");
    // Show what the list already knows while the transcript is on its way,
    // so opening a conversation never blanks the pane.
    setOpen({ ...summary, turns: [] });
  };

  /** Persist the conversation as it stands. Best-effort: a failed save is
   *  worth a banner, never the answer that was just streamed. */
  const persist = useCallback(
    async (allTurns: readonly ChatTurn[], id: string | null) => {
      if (!agentId || allTurns.length === 0) return;
      const result = await fetchJson<{ chat: AgentChatSession }>(
        `/api/agents/${encodeURIComponent(agentId)}/chats`,
        t,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            sessionId: id,
            turns: allTurns.map(({ role, content }) => ({ role, content })),
          }),
        },
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSessionId(result.data.chat.id);
      await loadSaved();
    },
    [agentId, loadSaved, t],
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!agentId || !trimmed || status !== "ready") return;

      turnId.current += 1;
      const userTurn: ChatTurn = { id: turnId.current, role: "user", content: trimmed };
      // What gets sent is what is on screen plus this line — reading state
      // back after setState would send the conversation one turn behind.
      const history = [...turns, userTurn];
      setTurns(history);
      setError(null);
      setStatus("submitted");

      const controller = new AbortController();
      abortRef.current = controller;

      turnId.current += 1;
      const replyId = turnId.current;

      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agentId)}/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: history.map(({ role, content }) => ({ role, content })),
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          setError(await readApiError(response, t));
          setStatus("ready");
          return;
        }

        setTurns((current) => [...current, { id: replyId, role: "assistant", content: "" }]);
        setStatus("streaming");

        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
        let answer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          answer += value;
          setTurns((current) =>
            current.map((turn) => (turn.id === replyId ? { ...turn, content: answer } : turn)),
          );
        }

        // The stream closes cleanly whether the model finished or the
        // provider gave up mid-answer, so an empty reply is the only signal
        // left that nothing came back.
        if (!answer.trim()) {
          setTurns((current) => current.filter((turn) => turn.id !== replyId));
          setError({ messageKey: "agents.chatStreamFailed" });
          return;
        }

        await persist([...history, { id: replyId, role: "assistant", content: answer }], sessionId);
      } catch (err) {
        if (controller.signal.aborted) return;
        setTurns((current) => current.filter((turn) => turn.id !== replyId));
        setError(networkUiError(err));
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setStatus("ready");
      }
    },
    [agentId, persist, sessionId, status, t, turns],
  );

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("ready");
  };

  /** Start a fresh conversation. The one on screen is already saved, so this
   *  only lets go of it — it does not throw it away. */
  const startNew = () => {
    stop();
    setTurns([]);
    setSessionId(null);
    setError(null);
  };

  const openSaved = (session: AgentChatSession) => {
    stop();
    setError(null);
    setSessionId(session.id);
    setMobilePane("chat");
    setTurns(
      session.turns.map((turn, index) => ({
        id: index + 1,
        role: turn.role,
        content: turn.content,
      })),
    );
    turnId.current = session.turns.length;
  };

  const removeSaved = async (session: AgentChatSession) => {
    if (!agentId) return;
    const result = await fetchJson(
      `/api/agents/${encodeURIComponent(agentId)}/chats?sessionId=${encodeURIComponent(session.id)}`,
      t,
      { method: "DELETE" },
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (sessionId === session.id) startNew();
    await loadSaved();
  };

  if (loading) {
    return (
      <PageContainer maxWidth="max-w-6xl">
        <Skeleton
          isLoading
          skeleton={
            <div className="flex flex-col gap-6">
              <div className="h-9 w-56 rounded-lg bg-muted" />
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="h-[420px] rounded-xl bg-muted" />
                <div className="h-[420px] rounded-xl bg-muted" />
              </div>
            </div>
          }
        >
          <div />
        </Skeleton>
      </PageContainer>
    );
  }

  if (!agent) {
    return (
      <PageContainer maxWidth="max-w-6xl">
        {error ? <ErrorBanner error={error} onRetry={() => void loadAgent()} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("voice.notFound")}</CardTitle>
            <CardDescription>{t("voice.notFoundDesc")}</CardDescription>
          </CardHeader>
          <div className="p-5 pt-0">
            <Button asChild variant="outline">
              <Link href="/agents">{t("voice.backToAgents")}</Link>
            </Button>
          </div>
        </Card>
      </PageContainer>
    );
  }

  const isActive = agent.status === "active";

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      {/* Toolbar — same pattern as the voice screen next door */}
      <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push("/agents")}
                aria-label={t("voice.backToAgents")}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("voice.backToAgents")}</TooltipContent>
          </Tooltip>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">{agent.name}</h1>
            <StatusBadge
              status={isActive ? "active" : "paused"}
              label={t("agents.chatBadge")}
            />
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              startNew();
              setMobilePane("chat");
            }}
            disabled={turns.length === 0}
            aria-label={t("agents.chatNew")}
            className="shrink-0"
          >
            <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} />
            <span className="hidden sm:inline">{t("agents.chatNew")}</span>
          </Button>

          <span className="hidden shrink-0 text-xs text-muted-foreground xl:block">
            {t("agents.chatPageEyebrow")}
          </span>
        </div>

        {error ? (
          <ErrorBanner
            className="rounded-none border-x-0 border-t shadow-none"
            error={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </header>

      <div className="shrink-0 border-b border-border px-3 py-2 lg:hidden">
        <SlidingTabs
          value={mobilePane}
          onValueChange={(id) => setMobilePane(id as "chat" | "history")}
          tabs={[
            { id: "chat", label: t("agents.chatPaneConversation") },
            { id: "history", label: t("agents.chatPaneHistory") },
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
        {/* Conversation + composer */}
        <div
          className={cn(
            "min-h-0 flex-1 flex-col overflow-hidden",
            mobilePane === "chat" ? "flex" : "hidden lg:flex",
          )}
        >
          {open ? (
            <LiveConversation
              conversation={open}
              assessing={assessing}
              onAssess={() => void assess("conversation", open.id)}
              onClose={() => {
                setOpenId(null);
                setOpen(null);
              }}
            />
          ) : (
          <>
          <Conversation className="min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-3xl gap-6 p-5">
              {turns.length === 0 ? (
                <ConversationEmptyState className="gap-4">
                  <div className="text-muted-foreground">
                    <HugeiconsIcon icon={BubbleChatIcon} size={24} strokeWidth={1.75} />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium">{t("agents.chatEmptyTitle")}</h3>
                    <p className="text-sm text-muted-foreground">
                      {agent.tools.length > 0
                        ? t("agents.chatToolsNote", { tools: agent.tools.join(", ") })
                        : t("agents.chatSubtitle")}
                    </p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {STARTERS.map((key) => (
                      <SuggestionChip key={key} onClick={() => void send(t(key))}>
                        {t(key)}
                      </SuggestionChip>
                    ))}
                  </div>
                </ConversationEmptyState>
              ) : (
                turns.map((turn) => (
                  <Message key={turn.id} from={turn.role}>
                    <MessageContent>
                      {turn.role === "user" ? (
                        turn.content
                      ) : turn.content ? (
                        <MessageResponse>{turn.content}</MessageResponse>
                      ) : (
                        // An assistant turn with no text yet is the agent
                        // searching the knowledge base or the media library —
                        // a tool call streams nothing until it returns.
                        <TextShimmer as="span" className="text-sm">{`${agent.name}…`}</TextShimmer>
                      )}
                    </MessageContent>
                  </Message>
                ))
              )}
              {status === "submitted" && (
                <Message from="assistant">
                  <MessageContent>
                    <TextShimmer as="span" className="text-sm">{`${agent.name}…`}</TextShimmer>
                  </MessageContent>
                </Message>
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="shrink-0 border-t border-border bg-card/40 p-4">
            <div className="mx-auto w-full max-w-3xl">
              <PromptInput
                onSubmit={(message: PromptInputMessage) => void send(message.text)}
                emptyErrorMessage={t("agents.chatEmptyMessage")}
              >
                <PromptInputTextarea placeholder={t("agents.chatPlaceholder")} />
                <PromptInputSubmit status={status} onStop={stop} />
              </PromptInput>
            </div>
          </div>
          </>
          )}
        </div>

        {/* Saved chats — scrolls independently, like the voice config column */}
        <div
          className={cn(
            "min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto bg-muted/20 p-4 lg:w-[380px] lg:flex-none lg:shrink-0 lg:border-l lg:border-border",
            mobilePane === "history" ? "flex" : "hidden lg:flex",
          )}
        >
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>{t("agents.chatChannelsTitle")}</CardTitle>
              <CardDescription>{t("agents.chatChannelsDesc")}</CardDescription>
            </CardHeader>

            <div className="flex flex-col gap-1.5 p-5 pt-0">
              {META_CHANNELS.map((channel) => (
                <div
                  key={channel}
                  className="flex items-center gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <ChannelIcon channel={channel} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                    {CHANNEL_LABELS[channel]}
                  </span>
                  <StatusBadge status={channels[channel] ? "connected" : "disconnected"} />
                </div>
              ))}

              {META_CHANNELS.some((channel) => !channels[channel]) ? (
                <Button asChild size="sm" variant="outline" className="mt-1.5 w-full">
                  <Link href="/connections">{t("agents.chatChannelsConnect")}</Link>
                </Button>
              ) : null}
            </div>
          </Card>

          <SlidingTabs
            value={sidebarTab}
            onValueChange={(id) => setSidebarTab(id as "test" | "real")}
            tabs={[
              { id: "test", label: t("agents.chatTabTest") },
              { id: "real", label: t("agents.chatTabReal") },
            ]}
          />

          {sidebarTab === "real" ? (
            <Card>
              <CardHeader className="flex-col gap-1">
                <CardTitle>{t("agents.chatRealTitle")}</CardTitle>
                <CardDescription>{t("agents.chatRealDesc")}</CardDescription>
              </CardHeader>

              <div className="flex flex-col gap-2 p-5 pt-0">
                {conversations.length === 0 ? (
                  <p className="text-[13px] text-muted-foreground">{t("agents.chatRealEmpty")}</p>
                ) : (
                  conversations.map((conversation) => (
                    <button
                      key={conversation.id}
                      type="button"
                      onClick={() => openConversation(conversation)}
                      className={cn(
                        "flex flex-col gap-1.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                        openId === conversation.id
                          ? "border-input bg-accent/40"
                          : "border-border hover:bg-accent/20",
                      )}
                    >
                      <span className="flex items-center gap-2">
                        <ChannelIcon channel={conversation.channel} />
                        <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                          {conversation.title || CHANNEL_LABELS[conversation.channel]}
                        </span>
                        <ProspectBadge prospect={conversation.prospect} />
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground">
                        {relativeTime(conversation.updatedAt)} · {conversation.lastMessage}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Card>
          ) : (
          <Card>
            <CardHeader className="flex-col gap-1">
              <CardTitle>{t("agents.chatSavedTitle")}</CardTitle>
              <CardDescription>{t("agents.chatSavedDesc")}</CardDescription>
            </CardHeader>

            <div className="flex flex-col gap-2 p-5 pt-0">
              {saved.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">{t("agents.chatSavedEmpty")}</p>
              ) : (
                saved.map((session) => {
                  const isOpen = sessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors",
                        isOpen ? "border-input bg-accent/40" : "border-border hover:bg-accent/20",
                      )}
                    >
                      <button
                        type="button"
                        aria-label={t("agents.chatSavedOpen")}
                        className="min-w-0 flex-1 text-left"
                        onClick={() => openSaved(session)}
                      >
                        <p className="truncate text-[13px] font-medium">
                          {session.title || t("agents.chatSavedUntitled")}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                          {relativeTime(session.updatedAt)} ·{" "}
                          {t("agents.chatSavedTurns", { count: session.turns.length })}
                        </p>
                      </button>
                      {isOpen ? (
                        <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {t("agents.chatSavedCurrent")}
                        </span>
                      ) : null}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            aria-label={t("agents.chatSavedDelete")}
                            size="icon-xs"
                            variant="ghost"
                            onClick={() => void removeSaved(session)}
                          >
                            <HugeiconsIcon icon={Delete01Icon} size={12} strokeWidth={1.75} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t("agents.chatSavedDelete")}</TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })
              )}
            </div>
          </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A real conversation with a customer, read-only.
 *
 * Read-only is the whole point: the agent is holding this conversation on
 * WhatsApp or Instagram, and a composer here would put a second
 * voice into a thread the customer thinks is one. What this screen adds is
 * the transcript as it arrives and where the model thinks the sale stands.
 */
function LiveConversation({
  conversation,
  assessing,
  onAssess,
  onClose,
}: {
  readonly conversation: ChannelConversation;
  readonly assessing: boolean;
  readonly onAssess: () => void;
  readonly onClose: () => void;
}) {
  const t = useT();
  // "Live" is a claim about the customer, not about the poll: a thread that
  // moved in the last few minutes is one someone may still be typing into.
  const isLive = Date.now() - new Date(conversation.updatedAt).getTime() < 5 * 60_000;
  const prospect = conversation.prospect;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <ChannelIcon channel={conversation.channel} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">
            {conversation.title || CHANNEL_LABELS[conversation.channel]}
          </p>
          {isLive ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] leading-none tracking-wide text-emerald-700 dark:text-emerald-400">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              {t("agents.chatRealLive")}
            </span>
          ) : null}
          <ProspectBadge prospect={prospect} />
          <Button size="xs" variant="ghost" disabled={assessing} onClick={onAssess}>
            {assessing ? (
              <Spinner size={12} />
            ) : null}
            {assessing ? t("prospect.assessing") : prospect ? t("prospect.reassess") : t("prospect.assess")}
          </Button>
          <Button size="xs" variant="outline" onClick={onClose}>
            {t("agents.chatBackToTest")}
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {prospect
            ? `${prospect.reason}${prospect.nextStep ? ` · ${t("prospect.nextStep")}: ${prospect.nextStep}` : ""}`
            : t("prospect.empty")}
        </p>
      </div>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-6 p-5">
          {conversation.turns.length === 0 ? (
            <ConversationEmptyState className="gap-4">
              <div className="text-muted-foreground">
                <HugeiconsIcon icon={BubbleChatIcon} size={24} strokeWidth={1.75} />
              </div>
              <p className="text-sm text-muted-foreground">{t("agents.chatRealLoading")}</p>
            </ConversationEmptyState>
          ) : (
            conversation.turns.map((turn, index) => (
              <Message key={index} from={turn.role}>
                <MessageContent>
                  {turn.role === "assistant" ? (
                    <MessageResponse>{turn.content}</MessageResponse>
                  ) : (
                    turn.content
                  )}
                </MessageContent>
              </Message>
            ))
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <p className="shrink-0 border-t border-border bg-muted/20 px-5 py-3 text-center text-xs text-muted-foreground">
        {t("agents.chatRealReadOnly")}
      </p>
    </div>
  );
}
