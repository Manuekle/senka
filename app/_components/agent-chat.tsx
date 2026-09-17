"use client";

import {
  Client,
  type ClientAuth,
  type ClientSession,
  type HandleMessageStreamEvent,
  isCurrentTurnBoundaryEvent,
  type SessionState,
} from "eve/client";
import { useEveAgent } from "eve/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { AppIcon } from "@/components/app-icon";
import { Add01Icon, AlertCircleIcon, Logout01Icon } from "@hugeicons/core-free-icons";
import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Beam } from "@/components/ui/beam";
import { saveConversation } from "@/lib/dashboard-store";
import { dailyGreeting } from "@/lib/chat-greeting";
import { AgentMessage, type AgentInputResponse } from "./agent-message";
import {
  ModelPicker,
  ProviderStatusBadge,
  useModelCatalog,
} from "@/components/ai-elements/model-picker";
import { SuggestionChip } from "@/components/ui/suggestion-chip";
import { AgentLoading, type AgentLoadingMode } from "./chat/agent-loading";
import { ChatInput, type ChatInputSubmitPayload } from "./chat/chat-input";
import { restoreEveChat, type SavedEveChat } from "@/lib/eve-chat-restore";
import { loadSessionAnswers, saveSessionAnswers, type SessionAnswers } from "@/lib/chat-input-answers";
import { conversationMovedOn, inputRequestPhase, type InputAnswer } from "@/lib/chat-input-request";
import type { EveDynamicToolPart, EveMessage } from "eve/react";

const AGENT_NAME = "senka";
/** How long a tab keeps following a turn it lost the stream of. A step can take
 *  minutes (a long report, a slow subagent); a turn that is still silent after
 *  this is better retried by hand than listened to forever. */
const FOLLOW_BUDGET_MS = 10 * 60 * 1000;
const MONITORING_HREF = process.env.NEXT_PUBLIC_MONITORING_URL;
const CHAT_STORAGE_KEY = "senka:eve-chat:v1";

const PROMPT_TABS: readonly { id: string; label: string; prompts: readonly string[] }[] = [
  {
    id: "chat",
    label: "chat.tabChat",
    prompts: ["chat.promptChat1", "chat.promptChat2", "chat.promptChat3"],
  },
  {
    id: "automate",
    label: "chat.tabAutomate",
    prompts: ["chat.promptAutomate1", "chat.promptAutomate2", "chat.promptAutomate3"],
  },
  {
    id: "analyze",
    label: "chat.tabAnalyze",
    prompts: ["chat.promptAnalyze1", "chat.promptAnalyze2", "chat.promptAnalyze3"],
  },
];

type AgentStatus = ReturnType<typeof useEveAgent>["status"];
export type AgentAuthMode = "basic" | "local" | "session" | "misconfigured";

type BasicCredentials = {
  readonly password: string;
  readonly username: string;
};

type MessageLike = {
  readonly role: string;
  readonly parts: readonly { readonly type: string; readonly text?: string }[];
};

function deriveTitle(messages: readonly MessageLike[]): string {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "Nueva conversación";
  const textPart = firstUser.parts.find((p) => p.type === "text");
  const text = textPart?.text ?? "Nueva conversación";
  return text.length > 50 ? `${text.slice(0, 50)}…` : text;
}

function deriveLastMessage(messages: readonly MessageLike[]): string {
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  if (!lastAssistant) return "";
  const textPart = lastAssistant.parts.find((p) => p.type === "text");
  const text = textPart?.text ?? "";
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

function Pill({
  children,
  href,
  title,
}: {
  readonly children: ReactNode;
  readonly href?: string;
  readonly title?: string;
}) {
  const className =
    "inline-flex items-center rounded-full border border-border bg-card/50 px-2.5 py-0.5 font-medium text-muted-foreground text-xs shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:text-foreground";
  if (href) {
    return (
      <a
        className={cn(className, "hover:bg-accent")}
        href={href}
        rel="noreferrer"
        target="_blank"
        title={title}
      >
        {children}
      </a>
    );
  }
  return (
    <span className={className} title={title}>
      {children}
    </span>
  );
}

export function AgentChat({ authMode }: { readonly authMode: AgentAuthMode }) {
  const [credentials, setCredentials] = useState<BasicCredentials>();

  if (authMode === "misconfigured") {
    return <AuthConfigurationError />;
  }

  if (authMode === "basic" && !credentials) {
    return <BasicAuthForm onAuthenticated={setCredentials} />;
  }

  const auth: ClientAuth | undefined = credentials
    ? { basic: { username: credentials.username, password: credentials.password } }
    : undefined;

  return (
    <AgentSession
      auth={auth}
      onSignOut={credentials ? () => setCredentials(undefined) : undefined}
    />
  );
}

function AgentSession({
  auth,
  onSignOut,
}: {
  readonly auth?: ClientAuth;
  readonly onSignOut?: () => void;
}) {
  const [saved, setSaved] = useState<SavedEveChat>();
  const [resetKey, setResetKey] = useState(0);
  // Start with "connecting" on both server and client to avoid hydration mismatch.
  // After hydration, check localStorage to see if we're restoring a saved session.
  const [loadingMode, setLoadingMode] = useState<AgentLoadingMode>("connecting");

  useEffect(() => {
    const saved = loadSavedChat();
    if (saved.session?.sessionId) {
      setLoadingMode("restoring");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void restoreSavedChat(auth, controller.signal).then((restored) => {
      // A cancelled restore still resolves, and in development it resolves
      // *second*: React mounts every effect, tears it down and mounts it
      // again, so the aborted first pass finishes after the real one and hands
      // the UI its empty result last. That is what emptied the chat when a
      // conversation was opened from the history list — the events were in
      // storage the whole time, and a manual reload brought them back.
      if (controller.signal.aborted) return;
      setSaved(restored);
    });
    return () => controller.abort();
  }, [auth, resetKey]);

  // Stable, because the follow effect in ConnectedAgentSession depends on it
  // and a new identity per render would restart the stream it is reading.
  const handleReattach = useCallback((restored: SavedEveChat) => {
    setSaved(restored);
    setResetKey((k) => k + 1);
  }, []);

  if (!saved) {
    return <AgentLoading mode={loadingMode} />;
  }

  return (
    <ConnectedAgentSession
      auth={auth}
      key={resetKey}
      onReattach={handleReattach}
      onSignOut={onSignOut}
      onReset={() => {
        clearSavedChat();
        setSaved({});
        setResetKey((k) => k + 1);
      }}
      saved={saved}
    />
  );
}

function ConnectedAgentSession({
  auth,
  onReattach,
  onReset,
  onSignOut,
  saved,
}: {
  readonly auth?: ClientAuth;
  /** Remount on a transcript that caught up with the server. */
  readonly onReattach: (restored: SavedEveChat) => void;
  readonly onReset: () => void;
  readonly onSignOut?: () => void;
  readonly saved: SavedEveChat;
}) {
  const t = useT();
  const [clientSession] = useState(() => {
    const client = new Client({
      host: window.location.origin,
      auth,
      maxReconnectAttempts: 20,
      preserveCompletedSessions: true,
      redirect: "error",
    });
    return client.session(saved.session);
  });
  const eventsRef = useRef<HandleMessageStreamEvent[]>([...(saved.events ?? [])]);
  const sessionRef = useRef<SessionState>(clientSession.state);
  const knownSessionRef = useRef<SessionState | undefined>(
    clientSession.state.sessionId ? clientSession.state : undefined,
  );
  /**
   * eve's client resets the session to empty when a stream ends without a
   * turn boundary — which is exactly what a dropped stream is. Saving that
   * threw the conversation's id away: the tab could not follow the turn still
   * running on the server, a reload came back to half a transcript, and the
   * next message opened a brand-new session. While the transcript is mid-turn,
   * keep the last id this tab knew.
   */
  const rememberSession = (next: SessionState): SessionState => {
    if (next.sessionId) {
      knownSessionRef.current = next;
      return next;
    }
    const last = eventsRef.current.at(-1);
    const known = knownSessionRef.current;
    if (known && last !== undefined && !isCurrentTurnBoundaryEvent(last)) {
      return { ...known, streamIndex: eventsRef.current.length };
    }
    return next;
  };
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persist = (immediately = false) => {
    if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    const write = () =>
      saveChat({ events: eventsRef.current, session: sessionRef.current });
    if (immediately) {
      write();
    } else {
      persistTimerRef.current = setTimeout(write, 100);
    }
  };

  useEffect(
    () => () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current);
    },
    [],
  );

  const agent = useEveAgent({
    initialEvents: saved.events ?? [],
    session: clientSession,
    onEvent(event) {
      eventsRef.current.push(event);
      sessionRef.current = rememberSession(clientSession.state);
      persist();
    },
    onFinish(snapshot) {
      eventsRef.current = [...snapshot.events];
      sessionRef.current = rememberSession(snapshot.session);
      persist(true);
    },
    onSessionChange(session) {
      sessionRef.current = rememberSession(session);
      persist(true);
    },
  });
  const agentBusy = agent.status === "submitted" || agent.status === "streaming";

  // ── Following a turn the browser lost ───────────────────────────────────
  // The turn runs on the server whether or not this tab is listening. Two
  // ways the tab stops listening while it is still going: the stream is cut
  // mid-turn (a proxy timeout, a laptop waking up — Chrome reports it as
  // "network error", which eve's client does not treat as a disconnect and
  // does not retry), or the page is reloaded mid-turn and the restore gives
  // up after a second and a half. Either way the chat used to sit on a dead
  // spinner or a red "La solicitud falló" over a reply that had in fact been
  // written. So: read the session stream from where this transcript stops
  // until the turn ends, then remount on the caught-up transcript.
  const [resumeOnMount] = useState(() => isTurnInFlight(saved));
  const streamDropped = agent.error !== undefined && isStreamDrop(agent.error);
  // "unavailable": nothing to follow — the drop happened before the server
  // ever named a session, so the ordinary error is the honest message.
  const [followEnded, setFollowEnded] = useState<"failed" | "unavailable" | null>(null);
  const [followNonce, setFollowNonce] = useState(0);
  const following = !agentBusy && (resumeOnMount || streamDropped) && followEnded === null;
  const offerFollowRetry = (streamDropped || resumeOnMount) && followEnded === "failed";
  const isBusy = agentBusy || following;

  useEffect(() => {
    if (!following) return;
    const session = { ...clientSession.state, ...sessionRef.current };
    if (!session.sessionId) {
      void Promise.resolve().then(() => setFollowEnded("unavailable"));
      return;
    }
    const controller = new AbortController();
    const before = eventsRef.current.length;
    const client = new Client({
      host: window.location.origin,
      auth,
      redirect: "error",
      preserveCompletedSessions: true,
    });
    void restoreEveChat(
      { events: [...eventsRef.current], session },
      client.session(session),
      AbortSignal.any([controller.signal, AbortSignal.timeout(FOLLOW_BUDGET_MS)]),
      saveChat,
    ).then((restored) => {
      if (controller.signal.aborted) return;
      if ((restored.events?.length ?? 0) > before) onReattach(restored);
      else setFollowEnded("failed");
    });
    return () => controller.abort();
    // `followNonce` is the retry button; the rest is stable for this mount.
  }, [following, followNonce, auth, clientSession, onReattach]);

  // ── Answers to the agent's questions ────────────────────────────────────
  // Eve keeps a button answer only in its in-memory projection, so a reload or
  // a conversation reopened from Historial forgot it. Kept here per session;
  // see lib/chat-input-request.ts.
  const [answers, setAnswers] = useState<SessionAnswers>(() =>
    loadSessionAnswers(saved.session?.sessionId),
  );
  const pendingQuestion = findPendingQuestion(agent.data.messages, answers);

  // ── Model choice ────────────────────────────────────────────────────────
  const { data: catalog, loading: catalogLoading } = useModelCatalog();
  const [chatModel, setChatModel] = useState<string | null>(null);

  const registerModel = useCallback(
    (model: string | null) => {
      setChatModel(model);
      const sessionId = sessionRef.current.sessionId;
      if (model === null) {
        if (!sessionId) return;
        void fetch(`/api/chat-model?sessionId=${encodeURIComponent(sessionId)}`, {
          method: "DELETE",
        }).catch(() => {});
        return;
      }
      void fetch("/api/chat-model", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model, sessionId }),
      }).catch(() => {});
    },
    [],
  );

  useEffect(() => {
    const sessionId = sessionRef.current.sessionId;
    if (!chatModel || !sessionId) return;
    void fetch("/api/chat-model", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: chatModel, sessionId }),
    }).catch(() => {});
  }, [chatModel, agent.status]);

  const modelPicker = (
    <ModelPicker
      models={catalog?.models ?? []}
      value={chatModel}
      onChange={registerModel}
      autoLabel={catalog?.tasks?.chat}
      loading={catalogLoading}
      disabled={isBusy}
    />
  );

  const isEmpty = agent.data.messages.length === 0;

  const [promptTab, setPromptTab] = useState(PROMPT_TABS[0].id);
  const activePromptTab = PROMPT_TABS.find((t) => t.id === promptTab) ?? PROMPT_TABS[0];

  // Save conversation summary to dashboard store
  const prevStatusRef = useRef(agent.status);
  useEffect(() => {
    const wasBusy = prevStatusRef.current === "submitted" || prevStatusRef.current === "streaming";
    const isReady = agent.status === "ready";
    if (wasBusy && isReady && agent.data.messages.length > 0) {
      try {
        const summary = {
          title: deriveTitle(agent.data.messages),
          channel: "web" as const,
          lastMessage: deriveLastMessage(agent.data.messages),
          lastMessageAt: new Date().toISOString(),
          messageCount: agent.data.messages.length,
          sessionId: sessionRef.current.sessionId,
        };
        saveConversation(summary);
      } catch {
        // Best-effort
      }
    }
    prevStatusRef.current = agent.status;
  }, [agent.status, agent.data.messages]);

  const sendTurn = agent.send;
  const send = useCallback(async (input: Parameters<typeof sendTurn>[0]) => {
    const result = sendTurn(input);
    void persistSessionWhenAccepted(clientSession, eventsRef, sessionRef);
    await result;
  }, [clientSession, sendTurn]);
  const recordAnswers = useCallback((responses: readonly AgentInputResponse[]) => {
    const recorded: Record<string, InputAnswer> = {};
    for (const response of responses) {
      recorded[response.requestId] = {
        ...(response.optionId ? { optionId: response.optionId } : {}),
        ...(response.text ? { text: response.text } : {}),
      };
    }
    setAnswers((current) => ({ ...current, ...recorded }));
    const sessionId = sessionRef.current.sessionId;
    if (sessionId) saveSessionAnswers(sessionId, recorded);
  }, []);
  const handleInputResponses = useCallback(
    async (inputResponses: readonly AgentInputResponse[]) => {
      recordAnswers(inputResponses);
      await send({ inputResponses });
    },
    [recordAnswers, send],
  );

  const handleInputSubmit = async (payload: ChatInputSubmitPayload) => {
    const text = payload.text.trim();
    if ((!text && payload.files.length === 0) || isBusy) return;

    // Convert any attached files to base64 Data URLs
    const fileParts = await Promise.all(
      payload.files.map(async (file) => {
        const dataUrl = await fileToDataUrl(file);
        return {
          type: "file" as const,
          mediaType: file.type || "application/octet-stream",
          data: dataUrl,
          filename: file.name,
        };
      }),
    );

    const clientContext = payload.mentionedAgent
      ? `[Instrucción de Agente]: El usuario solicita la intervención de @${payload.mentionedAgent.name}. Especialidad: ${payload.mentionedAgent.description}. Si cuentas con la herramienta agent o el subagente ${payload.mentionedAgent.handle}, delega esta tarea al subagente ${payload.mentionedAgent.handle}. En su defecto, asume plenamente este rol para responder.`
      : undefined;

    // Typing the answer to an open question instead of clicking it: eve resolves
    // a reply that names an option on its own, but only the click used to be
    // remembered, so the card forgot what was chosen. Record the match too.
    if (pendingQuestion && fileParts.length === 0) {
      const optionId = matchOption(pendingQuestion.request.options, text);
      if (optionId) recordAnswers([{ requestId: pendingQuestion.request.requestId, optionId }]);
    }

    if (fileParts.length === 0) {
      await send({
        message: text,
        ...(clientContext ? { clientContext } : {}),
      });
    } else {
      const parts = [
        ...(text ? [{ type: "text" as const, text }] : []),
        ...fileParts,
      ];
      await send({
        message: parts,
        ...(clientContext ? { clientContext } : {}),
      });
    }
  };

  const handleStop = async () => {
    if (!(await waitForSessionId(clientSession, 1_000))) {
      agent.stop();
      return;
    }

    try {
      await clientSession.cancel();
    } catch {
      agent.stop();
    }
  };

  const handleNewChat = async () => {
    if (isBusy) await handleStop();
    agent.stop();
    agent.reset();
    clearSavedChat();
    eventsRef.current = [];
    setChatModel(null);
    onReset();
  };

  const handleSignOut = async () => {
    if (isBusy) await handleStop();
    agent.stop();
    agent.reset();
    clearSavedChat();
    onSignOut?.();
  };

  const composer = (
    <ChatInput
      onSubmit={handleInputSubmit}
      onStop={handleStop}
      isBusy={isBusy}
      placeholder={
        pendingQuestion ? t("chat.inputAnswerPlaceholder") : t("chat.sendPlaceholder") || "Ask anything..."
      }
      isEmpty={isEmpty}
    />
  );

  return (
    <div className="page-enter relative flex h-full flex-col overflow-hidden">
      {/* Dense 48px grid — lines only (no baked fill: an opaque tile would
          sheet over the greeting, since this positioned overlay paints above
          in-flow content). Faded toward the edges by .bg-pattern-fade. */}
      {isEmpty ? (
        <div className="pointer-events-none absolute inset-0 bg-pattern bg-pattern-grid bg-pattern-fade" />
      ) : null}
      {isEmpty ? null : (
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
          <span className="flex min-w-0 items-center gap-2.5">
            <StatusDot status={agent.status} />
            <span className="truncate font-medium text-sm">{AGENT_NAME}</span>
          </span>
          <span className="flex items-center gap-2">
            <ProviderStatusBadge data={catalog} />
            {modelPicker}
            <Button
              onClick={() => void handleNewChat()}
              size="sm"
              title={t("chat.newConversation")}
              variant="ghost"
            >
              <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
              <span className="hidden sm:inline">{t("chat.newChat")}</span>
            </Button>
            {onSignOut ? (
              <Button
                onClick={() => void handleSignOut()}
                size="icon-sm"
                title={t("chat.signOut")}
                variant="ghost"
              >
                <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.75} />
                <span className="sr-only">{t("chat.signOut")}</span>
              </Button>
            ) : null}
          </span>
        </header>
      )}

      {(agent.error && !following) || offerFollowRetry ? (
        <div className="mx-auto w-full max-w-3xl shrink-0 px-4 pt-2 sm:px-6">
          <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm shadow-[var(--shadow-soft)]">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-destructive"
            />
            <div className="min-w-0 flex-1">
              <p className="font-medium">
                {offerFollowRetry ? t("chat.connectionLost") : t("chat.requestFailed")}
              </p>
              <p className="mt-0.5 text-muted-foreground">
                {offerFollowRetry ? t("chat.connectionLostDesc") : agent.error?.message}
              </p>
            </div>
            {offerFollowRetry ? (
              <Button
                onClick={() => {
                  setFollowEnded(null);
                  setFollowNonce((n) => n + 1);
                }}
                size="sm"
                variant="outline"
              >
                {t("apiError.retry")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {isEmpty ? null : (
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="mx-auto w-full max-w-3xl gap-6 px-4 py-6 sm:px-6">
            {agent.data.messages.map((message, index) => (
              <AgentMessage
                answers={answers}
                canRespond={!isBusy}
                isLast={index === agent.data.messages.length - 1}
                isStreaming={
                  (agent.status === "streaming" || following) &&
                  index === agent.data.messages.length - 1
                }
                key={message.id}
                message={message}
                onInputResponses={handleInputResponses}
              />
            ))}
            {following && agent.data.messages.at(-1)?.role !== "assistant" ? (
              <p className="flex items-center gap-2 pl-1 text-muted-foreground text-xs">
                <span className="size-1.5 rounded-full bg-muted-foreground motion-safe:animate-pulse" />
                {t("chat.reconnecting")}
              </p>
            ) : null}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
      )}

      <div
        className={cn(
          // `relative` paints this (logo, greeting, composer, suggestions)
          // above the absolutely positioned pattern overlay: both are
          // positioned at z-index auto, so tree order decides.
          "relative mx-auto w-full px-4 sm:px-6",
          isEmpty
            ? "flex max-w-xl flex-1 flex-col items-center justify-center gap-8 pb-[10vh]"
            : "max-w-3xl shrink-0 pb-6",
        )}
      >
        {isEmpty ? (
          <div className="flex flex-col items-center gap-6 text-center">
            {/* Daily rotating greeting with the agent mark beside it —
                Claude-style short question, new one every day, no repeats
                within a 7-day cycle (see lib/chat-greeting.ts). */}
            {/* The logo and greeting stand bare — no tile, border or
                background containing them (see lib/chat-greeting.ts). */}
            <div className="flex items-center justify-center gap-3">
              <AppIcon size={32} className="shrink-0 text-foreground" />
              <h1 className="font-cooper text-3xl font-semibold text-foreground sm:text-4xl">
                {dailyGreeting()}
              </h1>
            </div>
            <p className="max-w-sm text-balance text-sm leading-relaxed text-muted-foreground">
              {t("chat.tagline")}
            </p>
            {MONITORING_HREF ? (
              <Pill href={MONITORING_HREF} title={t("chat.hostMetrics")}>
                {t("chat.liveMetrics")}
              </Pill>
            ) : null}
            {onSignOut ? (
              <Button onClick={() => void handleSignOut()} size="sm" variant="ghost">
                <HugeiconsIcon icon={Logout01Icon} size={16} strokeWidth={1.75} />
                {t("chat.signOut")}
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="w-full">{composer}</div>
        {isEmpty ? (
          <div className="flex w-full flex-col items-center gap-5">
            <div className="flex items-center gap-2">
              <ProviderStatusBadge data={catalog} />
              {modelPicker}
            </div>
            <SlidingTabs
              onValueChange={setPromptTab}
              tabs={PROMPT_TABS.map(({ id, label }) => ({ id, label: t(label) }))}
              value={promptTab}
            />
            <div className="flex flex-wrap items-center justify-center gap-2">
              {activePromptTab.prompts.map((promptKey) => (
                <Beam active={!isBusy} colorVariant="mono" key={promptKey} strength={0.4}>
                  <SuggestionChip
                    disabled={isBusy}
                    onClick={() => void send({ message: t(promptKey) })}
                  >
                    {t(promptKey)}
                  </SuggestionChip>
                </Beam>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function BasicAuthForm({
  onAuthenticated,
}: {
  readonly onAuthenticated: (credentials: BasicCredentials) => void;
}) {
  const t = useT();
  const [error, setError] = useState<string>();
  const [isSafeOrigin, setIsSafeOrigin] = useState<boolean>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsSafeOrigin(
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]",
    );
  }, []);

  if (isSafeOrigin === undefined) {
    return <AgentLoading />;
  }

  if (!isSafeOrigin) {
    return <SecureConnectionRequired />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = {
      username: String(form.get("username") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    };
    if (!credentials.username || !credentials.password) return;

    setError(undefined);
    setIsSubmitting(true);
    try {
      const client = new Client({
        host: window.location.origin,
        auth: { basic: credentials },
        redirect: "error",
      });
      await client.info();
      onAuthenticated(credentials);
    } catch {
      setError(t("auth.incorrectCredentials"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-card p-7 shadow-[var(--shadow-elevated)]">
        <p className="text-xs font-medium text-muted-foreground">senka</p>
        <h1 className="mt-3 text-2xl font-semibold">{t("auth.signIn")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("auth.signInDescription")}
        </p>
        <form className="mt-7 space-y-5" onSubmit={handleSubmit}>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("auth.username")}</span>
            <Input autoComplete="username" name="username" required />
          </label>
          <label className="block space-y-2 text-sm">
            <span className="font-medium">{t("auth.password")}</span>
            <Input autoComplete="current-password" name="password" required type="password" />
          </label>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting} type="submit">
            {isSubmitting ? t("auth.checking") : t("auth.continue")}
          </Button>
        </form>
        <p className="mt-5 text-xs leading-relaxed text-muted-foreground">
          {t("auth.credentialsNote")}
        </p>
      </section>
    </div>
  );
}

function SecureConnectionRequired() {
  const t = useT();
  return (
    <div className="flex h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-7 shadow-[var(--shadow-elevated)]">
        <div className="flex items-start gap-3.5">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 shrink-0 text-destructive"
          />
          <div>
            <h1 className="text-lg font-semibold">{t("auth.httpsRequired")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("auth.httpsRequiredDesc")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function AuthConfigurationError() {
  const t = useT();
  return (
    <div className="flex h-dvh items-center justify-center bg-background px-4 text-foreground">
      <section className="w-full max-w-lg rounded-2xl border border-destructive/20 bg-destructive/5 p-7 shadow-[var(--shadow-elevated)]">
        <div className="flex items-start gap-3.5">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={20}
            strokeWidth={1.75}
            className="mt-0.5 size-5 shrink-0 text-destructive"
          />
          <div>
            <h1 className="text-lg font-semibold">{t("auth.notConfigured")}</h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {t("auth.notConfiguredDesc")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

function loadSavedChat(): SavedEveChat {
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedEveChat) : {};
  } catch {
    return {};
  }
}

async function restoreSavedChat(
  auth: ClientAuth | undefined,
  abortSignal: AbortSignal,
): Promise<SavedEveChat> {
  const saved = loadSavedChat();
  const events = [...(saved.events ?? [])];
  const lastEvent = events.at(-1);

  if (
    !saved.session?.sessionId ||
    (lastEvent !== undefined && isCurrentTurnBoundaryEvent(lastEvent))
  ) {
    return saved;
  }

  // Two shapes of restore share this path, and they want different budgets.
  // Reattaching after a reload picks up a turn that was in flight, so a stale
  // session id has to fail fast. Replaying a conversation opened from the
  // history list starts at index zero and reads every event the session ever
  // produced, which is a lot of small writes and worth waiting for — the
  // person just clicked it.
  const replaying = events.length === 0;
  const signal = AbortSignal.any([
    abortSignal,
    AbortSignal.timeout(replaying ? 8_000 : 1_500),
  ]);

  const client = new Client({
    host: window.location.origin, auth, redirect: "error", preserveCompletedSessions: true,
  });
  return restoreEveChat(saved, client.session(saved.session), signal, saveChat);
}

async function persistSessionWhenAccepted(
  session: ClientSession,
  eventsRef: { readonly current: readonly HandleMessageStreamEvent[] },
  sessionRef: { current: SessionState },
) {
  if (!(await waitForSessionId(session, 5_000))) return;
  sessionRef.current = session.state;
  saveChat({ events: eventsRef.current, session: session.state });
}

async function waitForSessionId(session: ClientSession, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (!session.state.sessionId && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return Boolean(session.state.sessionId);
}

function saveChat(chat: SavedEveChat) {
  try {
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(chat));
  } catch {
    // Best-effort
  }
}

function clearSavedChat() {
  try {
    localStorage.removeItem(CHAT_STORAGE_KEY);
  } catch {
    // Best-effort
  }
}

function StatusDot({ status }: { readonly status: AgentStatus }) {
  const isLive = status === "submitted" || status === "streaming";
  const tone =
    status === "error"
      ? "bg-destructive"
      : isLive
        ? "bg-foreground"
        : status === "ready"
          ? "bg-muted-foreground"
          : "bg-muted-foreground/40";

  return (
    <span className="relative flex size-1.5">
      {isLive ? (
        <span
          className={cn(
            "absolute inline-flex size-full animate-ping rounded-full opacity-40",
            tone,
          )}
        />
      ) : null}
      <span className={cn("relative inline-flex size-1.5 rounded-full transition-colors", tone)} />
    </span>
  );
}

/** A saved transcript whose last event is not a turn boundary: the tab stopped
 *  listening while the server was still working. */
function isTurnInFlight(saved: SavedEveChat): boolean {
  const last = saved.events?.at(-1);
  return Boolean(saved.session?.sessionId) && last !== undefined && !isCurrentTurnBoundaryEvent(last);
}

/** A stream the browser lost, as opposed to a turn the server failed. Chrome
 *  says "network error" for a body cut mid-chunk, Safari "Load failed",
 *  Firefox "NetworkError when attempting to fetch resource". */
function isStreamDrop(error: Error): boolean {
  return /network ?error|failed to fetch|fetch failed|load failed|terminated|incomplete/i.test(error.message);
}

type PendingQuestion = {
  readonly part: EveDynamicToolPart;
  readonly request: NonNullable<NonNullable<NonNullable<EveDynamicToolPart["toolMetadata"]>["eve"]>["inputRequest"]>;
};

/** The question in the newest message still waiting on the person, if any. */
function findPendingQuestion(
  messages: readonly EveMessage[],
  answers: SessionAnswers,
): PendingQuestion | undefined {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") return undefined;
  for (const part of last.parts) {
    if (part.type !== "dynamic-tool") continue;
    const request = part.toolMetadata?.eve?.inputRequest;
    if (!request) continue;
    const phase = inputRequestPhase({
      state: part.state,
      answer: part.toolMetadata?.eve?.inputResponse ?? answers[request.requestId],
      movedOn: conversationMovedOn(last, true, part),
    });
    if (phase === "pending") return { part, request };
  }
  return undefined;
}

/** The option a typed reply names — by id, label, or 1-based position — the
 *  same three ways eve itself resolves a text reply to a pending request. */
function matchOption(options: PendingQuestion["request"]["options"], text: string): string | undefined {
  const value = text.trim().toLowerCase();
  if (!value || !options?.length) return undefined;
  const byName = options.find(
    (option) => option.id.toLowerCase() === value || option.label.trim().toLowerCase() === value,
  );
  if (byName) return byName.id;
  const position = /^\d+$/.test(value) ? Number(value) : Number.NaN;
  return options[position - 1]?.id;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
