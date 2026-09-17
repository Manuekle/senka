"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import {
  ConversationProvider,
  useConversationControls,
  useConversationMode,
  useConversationStatus,
} from "@elevenlabs/react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AlertCircleIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  CallOutgoing01Icon,
  TelephoneIcon,
  VolumeHighIcon,
} from "@hugeicons/core-free-icons";
import { ConversationBar } from "@/components/elevenlabs/conversation-bar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/ui/status-badge";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Skeleton } from "@/components/ai-elements/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useI18n, useT } from "@/lib/i18n/provider";
import { countryOptions } from "@/lib/countries";
import { fetchJson, isApiError, type UiError } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import type { Agent, AgentVoice } from "@/lib/types";
import { PageContainer } from "../../../../_components/page-container";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../_components/dashboard-card";
import { StreamingResponse } from "@/components/agents/streaming-response";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Spinner } from "@/components/ui/spinner";

/* The ElevenLabs orb is WebGL: three.js, react-three-fiber and drei, which is
 * the heaviest thing in this app by an order of magnitude. Loading it only on
 * this route, only in the browser, keeps it out of every other page's bundle
 * and off the server, where a WebGL canvas has nothing to render into. */
const Orb = dynamic(() => import("@/components/elevenlabs/orb").then((m) => m.Orb), {
  ssr: false,
  loading: () => <div className="bg-muted/40 h-full w-full animate-pulse rounded-full" />,
});

type VoiceOption = { readonly voiceId: string; readonly name: string; readonly category?: string };
type PhoneNumber = {
  readonly phoneNumberId: string;
  readonly phoneNumber: string;
  readonly label?: string;
  readonly assignedAgentId?: string;
};
type TranscriptLine = { readonly id: number; readonly source: "user" | "ai"; readonly text: string };
const LANGUAGES = ["es", "en", "pt", "fr", "it", "de"] as const;

export default function AgentVoicePage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id;
  const t = useT();
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  // Stacked below `lg`, the settings column buried the orb and the call
  // controls entirely — so a phone shows the call or the settings, not both.
  const [mobilePane, setMobilePane] = useState<"call" | "settings">("call");
  const lineId = useRef(0);

  const load = useCallback(async () => {
    const result = await fetchJson<{ agents?: Agent[] }>("/api/agents", t);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setAgent(result.data.agents?.find((a) => a.id === agentId) ?? null);
    setLoading(false);
  }, [agentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const appendLine = useCallback((source: "user" | "ai", text: string) => {
    lineId.current += 1;
    setTranscript((lines) => [...lines, { id: lineId.current, source, text }]);
  }, []);

  if (loading) {
    return (
      <PageContainer maxWidth="max-w-6xl">
        <Skeleton
          isLoading
          skeleton={
            <div className="flex flex-col gap-6">
              <div className="bg-muted h-9 w-56 rounded-lg" />
              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="bg-muted h-[420px] rounded-xl" />
                <div className="bg-muted h-[420px] rounded-xl" />
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
        {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}
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

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      {/* Toolbar — same pattern as /automations/[id] */}
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
              status={agent.voice?.elevenlabsAgentId ? "active" : "paused"}
              label={agent.voice?.elevenlabsAgentId ? t("voice.badgeLive") : t("voice.badgeOff")}
            />
          </div>

          <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
            {t("voice.eyebrow")}
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
          onValueChange={(id) => setMobilePane(id as "call" | "settings")}
          tabs={[
            { id: "call", label: t("voice.paneCall") },
            { id: "settings", label: t("voice.paneSettings") },
          ]}
        />
      </div>

      <ConversationProvider
        onMessage={({ message, source }) => appendLine(source, message)}
        onDisconnect={() => appendLine("ai", t("voice.transcriptEnded"))}
        onError={(message: string) =>
          setError({ code: "upstream_failed", message, status: 0 })
        }
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Call + live transcript. Hidden with CSS rather than unmounted:
              switching tabs mid-call must not tear the call down. */}
          <div
            className={cn(
              "min-h-0 flex-1 flex-col overflow-hidden",
              mobilePane === "call" ? "flex" : "hidden lg:flex",
            )}
          >
            <CallStage
              agent={agent}
              transcript={transcript}
              onClear={() => setTranscript([])}
              onError={setError}
            />
          </div>

          {/* Config column — scrolls independently */}
          <div
            className={cn(
              "min-h-0 w-full flex-1 flex-col gap-4 overflow-y-auto bg-muted/20 p-4 lg:w-[440px] lg:flex-none lg:shrink-0 lg:border-l lg:border-border",
              mobilePane === "settings" ? "flex" : "hidden lg:flex",
            )}
          >
            <VoiceSettings agent={agent} onSaved={setAgent} onError={setError} />
            <PhonePanel agent={agent} onSaved={setAgent} onError={setError} />
            <SavedCallsLink agentId={agent.id} />
          </div>
        </div>
      </ConversationProvider>
    </div>
  );
}

/**
 * The playground half: orb, connect bar, live transcript.
 *
 * Transcript lives here, attached to the call — always visible while talking,
 * auto-scrolls, labels who said what (tú / agent).
 */
function CallStage({
  agent,
  transcript,
  onClear,
  onError,
}: {
  readonly agent: Agent;
  readonly transcript: TranscriptLine[];
  readonly onClear: () => void;
  readonly onError: (error: UiError) => void;
}) {
  const t = useT();
  const { status } = useConversationStatus();
  const { isSpeaking } = useConversationMode();
  const { getInputVolume, getOutputVolume, getId } = useConversationControls();
  const scrollRef = useRef<HTMLDivElement>(null);
  const taggedCallRef = useRef<string | null>(null);
  const reduced = useReducedMotion();

  const ready = Boolean(agent.voice?.enabled && agent.voice?.elevenlabsAgentId);

  const agentState = useMemo(() => {
    if (status !== "connected") return null;
    return isSpeaking ? ("talking" as const) : ("listening" as const);
  }, [status, isSpeaking]);

  const getToken = useCallback(async () => {
    const response = await fetch(`/api/agents/${agent.id}/voice/token`, { method: "POST" });
    if (!response.ok) throw new Error(`token request failed: ${response.status}`);
    const data = (await response.json()) as { token: string };
    return data.token;
  }, [agent.id]);

  // A denied or missing microphone is the common way a call fails to start,
  // and it fails before the session exists — so `ConversationProvider`'s
  // `onError` never sees it. Without this the button simply did nothing.
  const onStartError = useCallback(
    (error: unknown) => {
      const denied =
        error instanceof DOMException &&
        (error.name === "NotAllowedError" || error.name === "NotFoundError");
      onError({ messageKey: denied ? "voice.micDenied" : "voice.startFailed" });
    },
    [onError],
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [transcript]);

  // livekit-client (the WebRTC transport under @elevenlabs/react) logs
  // "error reading from signal stream" through console.error every time a
  // call ends — its signaling socket closing mid-read is expected teardown
  // (see startReadingLoop in livekit-client's dist bundle: caught, logged,
  // then closes cleanly), not an actual failure. Next's dev overlay treats
  // any console.error as a crash, though, so it paints this as one on every
  // hangup. Filtered narrowly, by exact message, only for this component's
  // lifetime — every other console.error still gets through untouched.
  useEffect(() => {
    const original = console.error;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].includes("error reading from signal stream")) {
        return;
      }
      original(...args);
    };
    return () => {
      console.error = original;
    };
  }, []);

  // Tags this conversation "test" the moment it connects — before the
  // post_call_transcription webhook can arrive — same reason the "Llamada de
  // prueba" button tags its own outbound call server-side. Without this, a
  // call placed from inside the browser defaults to "real" once the webhook
  // shows up with no matching pending row.
  useEffect(() => {
    if (status !== "connected") return;
    const conversationId = getId();
    if (!conversationId || taggedCallRef.current === conversationId) return;
    taggedCallRef.current = conversationId;
    void fetch(`/api/agents/${agent.id}/voice/calls`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ conversationId }),
    }).catch(() => {
      // Best-effort — worst case this call falls back to "real" once the
      // webhook lands with no matching pending row.
    });
  }, [status, getId, agent.id]);

  const statusLabel =
    status === "connected"
      ? isSpeaking
        ? t("voice.stateTalking")
        : t("voice.stateListening")
      : status === "connecting"
        ? t("voice.stateConnecting")
        : t("voice.stateIdle");

  const isLive = status === "connected" || status === "connecting";

  const [isDark, setIsDark] = useState(false);
  useEffect(() => {
    const update = () => setIsDark(document.documentElement.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const orbColors = useMemo<[string, string]>(
    () => (isDark ? (["#FAFAFA", "#E5E5E5"] as const) : (["#0A0A0A", "#262626"] as const)),
    [isDark],
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {/* Orb + controls */}
      <div className="flex flex-col items-center px-5 py-6">
        <div className="bg-muted/30 relative h-44 w-44 overflow-hidden rounded-full p-1">
          <div className="bg-card h-full w-full overflow-hidden rounded-full">
            <Orb
              key="voice-orb"
              colors={orbColors}
              agentState={agentState}
              volumeMode={isLive ? "manual" : "auto"}
              getInputVolume={getInputVolume}
              getOutputVolume={getOutputVolume}
            />
          </div>
        </div>
        <p className="mt-3 inline-flex items-center gap-2 text-[13px] text-muted-foreground">
          {isLive ? (
            <span
              className={cn(
                "size-2 rounded-full",
                status === "connected" && isSpeaking ? "animate-pulse bg-emerald-500" : "bg-amber-500",
              )}
            />
          ) : null}
          {statusLabel}
        </p>

        {ready ? (
          <ConversationBar
            className="p-0 pt-4"
            getConversationToken={getToken}
            label={agent.name}
            onStartError={onStartError}
          />
        ) : (
          <p className="text-muted-foreground mt-4 max-w-[36ch] text-center text-[13px]">
            {t("voice.stageBlocked")}
          </p>
        )}
      </div>

      {/* Live transcript — always visible, scrolls */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden border-t border-border bg-card">
        <div className="flex shrink-0 items-center justify-between px-5 py-3">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "size-1.5 rounded-full",
                isLive ? "animate-pulse bg-emerald-500" : "bg-muted-foreground/30",
              )}
            />
            <p className="font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
              {t("voice.transcript")}
            </p>
            {isLive ? (
              <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] leading-none tracking-wide text-emerald-700 dark:text-emerald-400">
                LIVE
              </span>
            ) : null}
          </div>
          {transcript.length > 0 ? (
            <Button onClick={onClear} size="sm" variant="ghost" className="h-7 text-xs">
              {t("voice.transcriptClear")}
            </Button>
          ) : null}
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">
          {transcript.length === 0 ? (
            <div className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/30 px-6 py-8 text-center">
              <p className="text-[13px] text-muted-foreground">{t("voice.transcriptEmpty")}</p>
              <p className="mt-1 max-w-[32ch] text-[12px] leading-relaxed text-muted-foreground">
                {isLive ? t("voice.transcriptLiveHint") : t("voice.transcriptIdleHint")}
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-3">
              <AnimatePresence initial={false}>
                {transcript.map((line) => (
                  <motion.li
                    key={line.id}
                    // A live transcript appends a line every few seconds. The
                    // slide-in is the one piece of motion on this page that
                    // repeats indefinitely, so it is also the one that has to
                    // stop for `prefers-reduced-motion` (WCAG 2.3.3).
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                    animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                    className={cn(
                      "flex flex-col gap-1",
                      line.source === "user" ? "items-end" : "items-start",
                    )}
                  >
                    <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                      {line.source === "user" ? "Tú" : agent.name}
                    </span>
                    {line.source === "user" ? (
                      <span className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-[13px] leading-relaxed text-primary-foreground shadow-sm">
                        {line.text}
                      </span>
                    ) : (
                      <StreamingResponse
                        status="complete"
                        showActions={false}
                        announce={false}
                        className="max-w-[85%]"
                        contentClassName="text-[13px] leading-relaxed"
                      >
                        {line.text}
                      </StreamingResponse>
                    )}
                  </motion.li>
                ))}
              </AnimatePresence>
              {isLive && isSpeaking ? (
                <motion.li
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col gap-1 items-start"
                >
                  <span className="font-mono text-[10px] tracking-wide text-muted-foreground">
                    {agent.name}
                  </span>
                  <StreamingResponse status="streaming" showActions={false} announce={false} className="max-w-[85%]">
                    <span className="inline-flex gap-1 py-1">
                      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.3s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40 [animation-delay:-0.15s]" />
                      <span className="size-1.5 animate-bounce rounded-full bg-foreground/40" />
                    </span>
                  </StreamingResponse>
                </motion.li>
              ) : null}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

/** Voice, first message and language — the three things the mirror agent needs
 *  that this app's agent record does not already carry. */
function VoiceSettings({
  agent,
  onSaved,
  onError,
}: {
  readonly agent: Agent;
  readonly onSaved: (agent: Agent) => void;
  readonly onError: (error: UiError | null) => void;
}) {
  const t = useT();
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [configured, setConfigured] = useState(true);
  const [voicesPermissionError, setVoicesPermissionError] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState(agent.voice?.voiceId ?? "");
  const [firstMessage, setFirstMessage] = useState(agent.voice?.firstMessage ?? "");
  const [language, setLanguage] = useState(agent.voice?.language ?? "es");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchJson<{ configured: boolean; voices: VoiceOption[] }>(
        "/api/elevenlabs/voices",
        t,
      );
      if (cancelled) return;
      if (!result.ok) {
        const detail = (isApiError(result.error) ? result.error.detail : undefined) ?? "";
        const perm = detail.match(/permission (\w+)/)?.[1];
        const isPermission =
          !!perm || detail.includes("missing_permissions") || (isApiError(result.error) && result.error.code === "forbidden");
        if (isPermission) {
          const label = perm ? ` ${perm}` : "";
          setVoicesPermissionError(
            `La API key de ElevenLabs no tiene el permiso${label}. Actívalo en elevenlabs.io/app/settings/api-keys → Voces: Leído y ElevenAgents: Escribir, y luego recargá.`,
          );
          return;
        }
        onError(result.error);
        return;
      }
      setConfigured(result.data.configured);
      setVoices(result.data.voices);
      if (!result.data.voices.some((v) => v.voiceId === voiceId)) {
        setVoiceId(result.data.voices[0]?.voiceId ?? "");
      }
    })();
    return () => {
      cancelled = true;
    };
    // Runs once: the list is an account-level catalogue, not per-render state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    onError(null);
    const body: Partial<AgentVoice> = { enabled: true, voiceId, firstMessage, language };
    const result = await fetchJson<{ agent: Agent }>(`/api/agents/${agent.id}/voice`, t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    onSaved(result.data.agent);
  }, [agent.id, firstMessage, language, onError, onSaved, t, voiceId]);

  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("voice.configTitle")}</CardTitle>
        <CardDescription>{t("voice.configDesc")}</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-4 p-5 pt-0">
        {voicesPermissionError ? (
          <div className="flex gap-3 rounded-xl border border-border bg-muted/40 px-3.5 py-3">
            <HugeiconsIcon
              icon={AlertCircleIcon}
              size={16}
              strokeWidth={1.75}
              className="mt-0.5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium leading-snug">{voicesPermissionError}</p>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                Sin este permiso el selector queda vacío. Podés pegar un Voice ID manual en{" "}
                <Link href="/settings" className="underline underline-offset-2">
                  Configuración
                </Link>{" "}
                o{" "}
                <a
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noreferrer"
                  className="underline underline-offset-2"
                >
                  abrir ElevenLabs
                </a>
                .
              </p>
            </div>
          </div>
        ) : null}
        {!configured ? (
          <p className="text-muted-foreground text-[13px]">
            {t("voice.needsKey")}{" "}
            <Link className="underline underline-offset-2" href="/settings">
              {t("voice.needsKeyLink")}
            </Link>
          </p>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-[13px]">{t("voice.fieldVoice")}</span>
          <Select onValueChange={setVoiceId} value={voiceId} disabled={!!voicesPermissionError}>
            <SelectTrigger
              aria-label={t("voice.fieldVoice")} className="w-full">
              <SelectValue placeholder={t("voice.fieldVoicePlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {voices.map((voice) => (
                <SelectItem key={voice.voiceId} value={voice.voiceId}>
                  {voice.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-[13px]">
            {t("voice.fieldFirstMessage")}{" "}
            <span className="font-normal text-muted-foreground">(opcional)</span>
          </span>
          <Textarea
            className="min-h-[76px]"
            onChange={(event) => setFirstMessage(event.target.value)}
            placeholder={t("voice.fieldFirstMessagePlaceholder")}
            value={firstMessage}
          />
          <span className="text-muted-foreground text-[12px]">
            {t("voice.fieldFirstMessageHelp")} Dejalo vacío y el agente empieza escuchando sin saludo.
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-medium text-[13px]">{t("voice.fieldLanguage")}</span>
          <Select onValueChange={setLanguage} value={language}>
            <SelectTrigger
              aria-label={t("voice.fieldLanguage")} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((code) => (
                <SelectItem key={code} value={code}>
                  {t(`voice.lang.${code}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>

        <div className="flex items-center gap-3">
          <Button disabled={saving || !configured} onClick={() => void save()}>
            {saving ? (
              <Spinner />
            ) : (
              <HugeiconsIcon icon={VolumeHighIcon} size={16} strokeWidth={1.75} />
            )}
            {agent.voice?.elevenlabsAgentId ? t("voice.resync") : t("voice.enable")}
          </Button>
          {agent.voice?.syncedAt ? (
            <span className="text-muted-foreground text-[12px]">
              {t("voice.syncedAt")} {new Date(agent.voice.syncedAt).toLocaleString()}
            </span>
          ) : null}
        </div>

        {agent.voice?.toolsWarning ? (
          // The one failure that is invisible on a call: the agent still
          // answers, still sounds right, and books nothing. Said here rather
          // than left to be discovered by a customer who was promised a turno.
          <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[12px] leading-relaxed text-amber-900 dark:text-amber-200">
            {agent.voice.toolsWarning}
          </p>
        ) : null}

        <p className="text-muted-foreground text-[12px] leading-relaxed">
          {t("voice.mirrorNote")}
        </p>
      </div>
    </Card>
  );
}

/** The phone half: import the Twilio number, route it here, place a test call. */
function PhonePanel({
  agent,
  onSaved,
  onError,
}: {
  readonly agent: Agent;
  readonly onSaved: (agent: Agent) => void;
  readonly onError: (error: UiError | null) => void;
}) {
  const t = useT();
  const { locale } = useI18n();
  const [numbers, setNumbers] = useState<PhoneNumber[]>([]);
  const [busy, setBusy] = useState<"import" | "assign" | "call" | null>(null);
  const [toNumber, setToNumber] = useState("");
  const [callResult, setCallResult] = useState<string | null>(null);
  const [countryIso, setCountryIso] = useState("ar");
  const countries = useMemo(() => countryOptions(locale), [locale]);
  const dialCode = countries.find((c) => c.iso2 === countryIso)?.dial ?? "+54";

  const assigned = numbers.find((n) => n.phoneNumberId === agent.voice?.phoneNumberId);
  const mirrorId = agent.voice?.elevenlabsAgentId;

  const loadNumbers = useCallback(async () => {
    const result = await fetchJson<{ numbers: PhoneNumber[] }>(
      "/api/elevenlabs/phone-numbers",
      t,
    );
    // A failure here is not worth a banner on load — the panel already reads
    // as "no number yet", and the import button surfaces the real error the
    // moment someone tries.
    if (result.ok) setNumbers(result.data.numbers);
  }, [t]);

  useEffect(() => {
    void loadNumbers();
  }, [loadNumbers]);


  const importNumber = useCallback(async () => {
    setBusy("import");
    onError(null);
    const result = await fetchJson<{ phoneNumberId: string }>("/api/elevenlabs/phone-numbers", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ elevenlabsAgentId: mirrorId }),
    });
    if (!result.ok) {
      setBusy(null);
      onError(result.error);
      return;
    }
    const saved = await fetchJson<{ agent: Agent }>(`/api/agents/${agent.id}/voice`, t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumberId: result.data.phoneNumberId }),
    });
    setBusy(null);
    if (!saved.ok) {
      onError(saved.error);
      return;
    }
    onSaved(saved.data.agent);
    void loadNumbers();
  }, [agent.id, loadNumbers, mirrorId, onError, onSaved, t]);

  const assign = useCallback(
    async (phoneNumberId: string) => {
      setBusy("assign");
      onError(null);
      const saved = await fetchJson<{ agent: Agent }>(`/api/agents/${agent.id}/voice`, t, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phoneNumberId }),
      });
      setBusy(null);
      if (!saved.ok) {
        onError(saved.error);
        return;
      }
      onSaved(saved.data.agent);
      void loadNumbers();
    },
    [agent.id, loadNumbers, onError, onSaved, t],
  );

  const call = useCallback(async () => {
    setBusy("call");
    setCallResult(null);
    onError(null);
    const fullNumber = toNumber.trim() ? (toNumber.trim().startsWith("+") ? toNumber.trim() : `${dialCode}${toNumber.trim().replace(/^0+/, "")}`) : "";
    const result = await fetchJson<{ ok: boolean; message: string }>(
      `/api/agents/${agent.id}/voice/call`,
      t,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toNumber: fullNumber }),
      },
    );
    setBusy(null);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    setCallResult(result.data.ok ? t("voice.callPlaced") : result.data.message);
  }, [agent.id, dialCode, onError, t, toNumber]);

  return (
    <Card>
      <CardHeader className="flex-col gap-1">
        <CardTitle>{t("voice.phoneTitle")}</CardTitle>
        <CardDescription>{t("voice.phoneDesc")}</CardDescription>
      </CardHeader>

      <div className="flex flex-col gap-4 p-5 pt-0">
        {assigned ? (
          <div className="border-border flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div className="min-w-0">
              <p className="font-medium text-[14px]">{assigned.phoneNumber}</p>
              <p className="text-muted-foreground text-[12px]">{t("voice.phoneRouted")}</p>
            </div>
            <StatusBadge status="connected" label={t("voice.phoneActive")} />
          </div>
        ) : numbers.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-[13px]">{t("voice.phonePick")}</p>
            {numbers.map((number) => (
              <div
                className="border-border flex items-center justify-between rounded-lg border px-3 py-2"
                key={number.phoneNumberId}
              >
                <span className="text-[14px]">{number.phoneNumber}</span>
                <Button
                  disabled={busy !== null || !mirrorId}
                  onClick={() => void assign(number.phoneNumberId)}
                  size="sm"
                  variant="outline"
                >
                  {t("voice.phoneUse")}
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-[13px]">{t("voice.phoneEmpty")}</p>
        )}

        {!assigned ? (
          <div className="flex flex-col gap-2">
            <Button
              disabled={busy !== null || !mirrorId}
              onClick={() => void importNumber()}
              variant="outline"
            >
              {busy === "import" ? (
                <Spinner />
              ) : null}
              {t("voice.phoneImport")}
            </Button>
            <p className="text-muted-foreground text-[12px] leading-relaxed">
              {t("voice.phoneImportHelp")}{" "}
              <Link className="underline underline-offset-2" href="/settings">
                {t("voice.needsKeyLink")}
              </Link>
            </p>
          </div>
        ) : null}

        <div className="border-border border-t pt-4">
          <p className="mb-2 font-medium text-[13px]">{t("voice.callTitle")}</p>
          <div className="flex flex-wrap gap-2 sm:flex-nowrap">
            <Select value={countryIso} onValueChange={setCountryIso}>
              <SelectTrigger aria-label={t("common.country")} className="w-[4.5rem] shrink-0 justify-center px-2">
                <span className="flex items-center gap-2">
                  {(() => {
                    const selected = countries.find((c) => c.iso2 === countryIso) ?? countries[0];
                    return selected ? (
                      <img
                        src={selected.flag}
                        alt={selected.name}
                        className="h-4 w-6 rounded-[2px] object-cover"
                      />
                    ) : null;
                  })()}
                  <span className="sr-only">
                    <SelectValue />
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent>
                {countries.map((c) => (
                  <SelectItem key={c.iso2} value={c.iso2}>
                    <span className="flex items-center gap-2">
                      <img
                        src={c.flag}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="h-3 w-[18px] rounded-[1px] object-cover"
                      />
                      <span>{c.dial}</span>
                      <span className="text-muted-foreground truncate">{c.name}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              aria-label={t("common.phoneNumber")}
              onChange={(event) => setToNumber(event.target.value)}
              placeholder="11 5555 0000"
              value={toNumber}
              inputMode="tel"
              className="min-w-0 flex-1"
            />
            <Button
              disabled={busy !== null || !assigned || !toNumber.trim()}
              onClick={() => void call()}
              className="w-full sm:w-auto"
            >
              {busy === "call" ? (
                <Spinner />
              ) : (
                <HugeiconsIcon icon={CallOutgoing01Icon} size={16} strokeWidth={1.75} />
              )}
              {t("voice.callAction")}
            </Button>
          </div>
          {callResult ? (
            <p className="text-muted-foreground mt-2 text-[13px]">{callResult}</p>
          ) : (
            <p className="text-muted-foreground mt-2 text-[12px]">{t("voice.callHelp")}</p>
          )}
        </div>
      </div>
    </Card>
  );
}

/**
 * The way into the call history, which lives on its own page now.
 *
 * The config column is where someone sets the agent up; a scrolling list of
 * every call it ever handled competed with that for the same narrow space and
 * won, pushing the settings out of view. One line that says how many calls
 * there are, and a page to read them on, serves both.
 */
function SavedCallsLink({ agentId }: { readonly agentId: string }) {
  const t = useT();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const result = await fetchJson<{ calls: unknown[] }>(`/api/agents/${agentId}/voice/calls`, t);
      if (!cancelled && result.ok) setCount(result.data.calls.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, t]);

  return (
    <Card>
      <Link
        className="flex items-center gap-3 p-5 transition-colors hover:bg-accent/40"
        href={`/agents/${agentId}/voice/history`}
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <HugeiconsIcon icon={TelephoneIcon} size={18} strokeWidth={1.75} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[14px] font-medium">{t("voice.savedCallsTitle")}</span>
          <span className="text-muted-foreground truncate text-[12px]">
            {count === null
              ? t("voice.savedCallsDesc")
              : count === 0
                ? t("voice.savedCallsEmpty")
                : t("voice.savedCallsCount").replace("{count}", String(count))}
          </span>
        </span>
        <HugeiconsIcon
          className="text-muted-foreground shrink-0"
          icon={ArrowRight01Icon}
          size={16}
          strokeWidth={1.75}
        />
      </Link>
    </Card>
  );
}
