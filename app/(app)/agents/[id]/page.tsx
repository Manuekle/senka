"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  AiImagineIcon,
  PanelLeftIcon,
  AiPaintbrushIcon,
  BubbleChatIcon,
  Call02Icon,
} from "@hugeicons/core-free-icons";
import { StatusBadge } from "@/components/ui/status-badge";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useModelCatalog } from "@/components/ai-elements/model-picker";
import { useCelebrate } from "@/components/use-celebrate";
import { useT, useAppLocale } from "@/lib/i18n/provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { cn } from "@/lib/utils";
import {
  emptyBrief,
  normalizeBrief,
  readiness,
  type ReadinessCheck,
} from "@/lib/agent-brief";
import { toCapabilityIds } from "@/lib/agent-capabilities";
import type { Agent, AgentBrief, ChannelId } from "@/lib/types";
import { AgentBlueprint, type BlueprintSection, type SectionId } from "../_components/agent-blueprint";
import {
  AgentSectionPanel,
  type AgentDraft,
  type BusinessContext,
} from "../_components/agent-section-panel";
import { AgentAssistant, type AssistantPatch } from "../_components/agent-assistant";
import type { CapabilityOption } from "../_components/capability-picker";
import { DockReopenButton } from "@/app/_components/dock-reopen-button";

// The agent workspace: the same shape as an automation's flow page, because
// the two are the same job — take something the owner described in a sentence
// and turn it into a thing that runs.
//
// Two panes, and the split is deliberate:
//
//   Blueprint   what the agent is, as nine decisions with a state each. The
//               map. Nothing is edited here.
//   Dock        the interview on one tab, the editor for the selected section
//               on the other. The workshop.
//
// Everything autosaves. There is no Save button in this workspace at all: an
// agent exists from the moment it is created (as a draft), and every keystroke
// after that is debounced into one PUT.

const DOCK_MIN = 340;
const DOCK_MAX = 620;
const DOCK_WIDTH_KEY = "senka:agent-dock-width";
const DOCK_OPEN_KEY = "senka:agent-dock-open";

type SaveStatus = "idle" | "saving" | "saved";
type DockTab = "assistant" | "section";

const SECTION_ORDER: readonly SectionId[] = [
  "identity",
  "brief",
  "rules",
  "capabilities",
  "prompt",
  "channels",
  "model",
  "voice",
  "business",
];

export default function AgentBuilderPage() {
  const t = useT();
  const { locale } = useAppLocale();
  const router = useRouter();
  const celebrate = useCelebrate();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const { data: catalog, loading: catalogLoading } = useModelCatalog();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  const [dockTab, setDockTab] = useState<DockTab>("assistant");
  const [section, setSection] = useState<SectionId>("identity");
  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);

  const [capabilities, setCapabilities] = useState<CapabilityOption[]>([]);
  const [channels, setChannels] = useState<ChannelId[]>([]);
  const [assignments, setAssignments] = useState<Partial<Record<ChannelId, string>>>({});
  const [business, setBusiness] = useState<BusinessContext>({
    name: "",
    description: "",
    knowledgeDocuments: 0,
    hasProfile: false,
  });

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    try {
      const storedWidth = Number(localStorage.getItem(DOCK_WIDTH_KEY));
      if (storedWidth >= DOCK_MIN && storedWidth <= DOCK_MAX) setDockWidth(storedWidth);
      const storedOpen = localStorage.getItem(DOCK_OPEN_KEY);
      // Below lg the dock floats over the canvas, so opening it by default
      // would hide the blueprint someone came here to read.
      if (storedOpen === "0" || (storedOpen === null && window.innerWidth < 1024)) setDockOpen(false);
    } catch {
      // Private mode / blocked storage — defaults are fine.
    }
  }, []);

  const setDockOpenPersisted = (open: boolean) => {
    setDockOpen(open);
    try {
      localStorage.setItem(DOCK_OPEN_KEY, open ? "1" : "0");
    } catch {
      // Best-effort.
    }
  };

  // ── Loading ────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const result = await fetchJson<{ agents?: Agent[] }>("/api/agents", t);
    if (!result.ok) {
      // A load that failed is not the same as an agent that isn't there.
      setError(result.error);
      setIsLoading(false);
      return;
    }
    const found = result.data.agents?.find((a) => a.id === id);
    if (!found) {
      setNotFound(true);
      setIsLoading(false);
      return;
    }
    setError(null);
    setAgent(found);
    setDraft((current) =>
      // A refresh must never overwrite what is being typed — only the first
      // load seeds the draft.
      current ?? {
        name: found.name,
        description: found.description,
        systemPrompt: found.systemPrompt,
        brief: found.brief ? normalizeBrief(found.brief) : emptyBrief(),
        tools: toCapabilityIds(found.tools),
        model: found.model ?? null,
      },
    );
    setIsLoading(false);
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [caps, routing, profile, knowledge] = await Promise.all([
        fetchJson<{ capabilities: CapabilityOption[] }>("/api/agents/capabilities", t),
        fetchJson<{ channels: ChannelId[]; assignments: Partial<Record<ChannelId, string>> }>(
          "/api/channels/agents",
          t,
        ),
        fetchJson<{
          identity?: { name?: string; description?: string };
          record?: { profile?: { name?: string; description?: string } } | null;
        }>("/api/business-profile", t),
        fetchJson<{ documents?: unknown[] }>("/api/knowledge", t),
      ]);
      if (cancelled) return;
      if (caps.ok) setCapabilities(caps.data.capabilities);
      if (routing.ok) {
        setChannels(routing.data.channels);
        setAssignments(routing.data.assignments);
      }
      setBusiness({
        name: profile.ok ? (profile.data.identity?.name ?? profile.data.record?.profile?.name ?? "") : "",
        description: profile.ok
          ? (profile.data.identity?.description ?? profile.data.record?.profile?.description ?? "")
          : "",
        knowledgeDocuments: knowledge.ok ? (knowledge.data.documents?.length ?? 0) : 0,
        hasProfile: profile.ok ? Boolean(profile.data.record) : false,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  // ── Autosave ───────────────────────────────────────────────────────

  const scheduleSave = useCallback(
    (next: AgentDraft) => {
      setSaveStatus("saving");
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        void (async () => {
          const result = await fetchJson<{ agent?: Agent }>("/api/agents", t, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              agentId: id,
              name: next.name,
              description: next.description,
              tools: next.tools,
              model: next.model,
              brief: next.brief,
              locale,
              // Only sent when the owner took the prompt over; otherwise the
              // server composes it from the brief and this field would pin an
              // already-stale copy.
              ...(next.brief.promptCustomized ? { systemPrompt: next.systemPrompt } : {}),
            }),
          });
          if (!result.ok) {
            // An autosave that quietly gave up left the workspace looking saved.
            setSaveStatus("idle");
            setError(result.error);
            return;
          }
          const saved = result.data.agent;
          if (saved) {
            setAgent(saved);
            // The composed prompt comes back from the server, which is the
            // only place composition happens — mirroring it in the browser
            // would be a second implementation to keep in step.
            setDraft((current) =>
              current && !current.brief.promptCustomized
                ? { ...current, systemPrompt: saved.systemPrompt }
                : current,
            );
          }
          setError(null);
          setSaveStatus("saved");
        })();
      }, 700);
    },
    [id, locale, t],
  );

  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  const update = useCallback(
    (patch: Partial<AgentDraft>) => {
      setDraft((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  /** Apply a proposal from the interview. Capabilities arrive as the complete
   *  list the assistant wants, so they replace rather than merge. */
  const applyPatch = useCallback(
    (patch: AssistantPatch) => {
      setDraft((current) => {
        if (!current) return current;
        const brief: AgentBrief = normalizeBrief({
          ...current.brief,
          ...(patch.brief ?? {}),
          updatedAt: new Date().toISOString(),
        });
        // `normalizeBrief` drops the flag unless it is set, so a customized
        // prompt stays customized across a patch.
        const next: AgentDraft = {
          ...current,
          name: patch.name?.trim() || current.name,
          description: patch.description?.trim() || current.description,
          brief: current.brief.promptCustomized ? { ...brief, promptCustomized: true } : brief,
          tools: patch.capabilities ? [...patch.capabilities] : current.tools,
        };
        scheduleSave(next);
        return next;
      });
    },
    [scheduleSave],
  );

  const assignChannel = async (channel: ChannelId, agentId: string | null) => {
    const result = await fetchJson<{ assignments: Partial<Record<ChannelId, string>> }>(
      "/api/channels/agents",
      t,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ channel, agentId }),
      },
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setAssignments(result.data.assignments);
  };

  const toggleStatus = async (from: HTMLElement | null) => {
    const result = await fetchJson<{ agent?: Agent }>("/api/agents", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: id, toggleStatus: true }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const saved = result.data.agent;
    if (saved) setAgent(saved);
    // Turning an agent on is the moment it starts working for you. Turning it
    // off is not, and neither is saving a field.
    if (saved?.status === "active") celebrate(from ? { from } : undefined);
  };

  // ── Dock resize ────────────────────────────────────────────────────

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - event.clientX;
      setDockWidth(Math.min(DOCK_MAX, Math.max(DOCK_MIN, resizeRef.current.startWidth + delta)));
    };
    const onUp = () => {
      if (!resizeRef.current) return;
      resizeRef.current = null;
      setIsResizing(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setDockWidth((width) => {
        try {
          localStorage.setItem(DOCK_WIDTH_KEY, String(width));
        } catch {
          // Best-effort.
        }
        return width;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, []);

  // ── Render ─────────────────────────────────────────────────────────

  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-10 py-14 text-center shadow-[var(--shadow-soft)]">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={AiImagineIcon} size={20} strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium">{t("builder.notFound")}</p>
          <button
            onClick={() => router.push("/agents")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.75} />
            {t("builder.backToList")}
          </button>
        </div>
      </div>
    );
  }

  if (!isLoading && !agent && error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-md">
          <ErrorBanner error={error} onRetry={() => void load()} />
          <button
            onClick={() => router.push("/agents")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.75} />
            {t("builder.backToList")}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !agent || !draft) {
    return (
      <div className="flex h-full flex-col">
        <div className="h-14 shrink-0 border-b border-border" />
        <div className="min-h-0 flex-1 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px]" />
      </div>
    );
  }

  const channelAssigned = Object.values(assignments).some((assigned) => assigned === id);
  const state = readiness({
    agent: {
      name: draft.name,
      description: draft.description,
      systemPrompt: draft.systemPrompt,
      tools: [...draft.tools],
      brief: draft.brief,
    },
    channelAssigned,
    knowledgeDocuments: business.knowledgeDocuments,
  });

  const sections = buildSections({
    draft,
    capabilities,
    catalogLabel:
      draft.model === null
        ? (catalog?.tasks?.chat ?? "")
        : (catalog?.models.find((model) => model.id === draft.model)?.label ?? draft.model),
    channelAssigned,
    assignments,
    agentId: id,
    voiceEnabled: Boolean(agent.voice?.enabled),
    business,
    t,
  });

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      {/* Workspace toolbar */}
      <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push("/agents")}
                aria-label={t("builder.backToList")}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("builder.backToList")}</TooltipContent>
          </Tooltip>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {draft.name || t("builder.untitled")}
            </h1>
            <StatusBadge status={agent.status === "active" ? "active" : agent.status === "draft" ? "draft" : "paused"} />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SaveIndicator status={saveStatus} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/agents/${id}/voice`}
                  aria-label={t("agents.callAction")}
                  className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
                >
                  <HugeiconsIcon icon={Call02Icon} size={16} strokeWidth={1.75} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("agents.callAction")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Link
                  href={`/agents/${id}/chat`}
                  aria-label={t("builder.openHistory")}
                  className="hidden size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:flex"
                >
                  <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={1.75} />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("builder.openHistory")}</TooltipContent>
            </Tooltip>
            <button
              onClick={(event) => void toggleStatus(event.currentTarget)}
              disabled={!state.ready && agent.status !== "active"}
              title={!state.ready && agent.status !== "active" ? t("builder.activateBlocked") : undefined}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                "transition-[background-color,box-shadow,opacity] duration-150 ease-out",
                !state.ready && agent.status !== "active"
                  ? "cursor-not-allowed border border-border bg-card text-muted-foreground opacity-40 shadow-[var(--shadow-inset)]"
                  : "bg-primary text-primary-foreground shadow-[var(--shadow-button)] active:scale-[0.98]",
              )}
            >
              {agent.status === "active" ? t("builder.pause") : t("builder.activate")}
            </button>
            <span className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setDockOpenPersisted(!dockOpen)}
                  aria-label={t("builder.assistantTab")}
                  aria-pressed={dockOpen}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
                    dockOpen
                      ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon icon={PanelLeftIcon} size={16} strokeWidth={1.75} className="rotate-180" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("builder.assistantTab")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {agent.status === "draft" ? (
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border bg-muted/30 px-4 py-1.5">
            <span className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
              {t("builder.draftLabel")}
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="text-[11px] text-muted-foreground">{t("builder.draftHint")}</span>
          </div>
        ) : null}

        {error ? (
          <ErrorBanner
            className="rounded-none border-x-0 border-t shadow-none"
            error={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </header>

      {/* Canvas + dock */}
      <div className="relative flex min-h-0 flex-1" style={{ ["--dock-max" as string]: `${DOCK_MAX}px` }}>
        <div className="relative flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <AgentBlueprint
              sections={sections}
              checks={state.checks as readonly ReadinessCheck[]}
              selected={dockTab === "section" ? section : null}
              onSelect={(next) => {
                setSection(next);
                setDockTab("section");
                if (!dockOpen) setDockOpenPersisted(true);
              }}
            />
          </div>

          {!dockOpen ? (
            <DockReopenButton
              icon={AiPaintbrushIcon}
              label={t("builder.assistantTab")}
              onClick={() => setDockOpenPersisted(true)}
            />
          ) : null}
        </div>

        <>
          <div
            onPointerDown={(event) => {
              resizeRef.current = { startX: event.clientX, startWidth: dockWidth };
              setIsResizing(true);
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
            className={cn(
              "group relative z-20 w-3 shrink-0 -translate-x-1.5 cursor-col-resize touch-none",
              dockOpen ? "hidden lg:block" : "hidden",
            )}
            role="separator"
            aria-orientation="vertical"
            aria-label={t("automations.resizeDock")}
          >
            <span
              className={cn(
                "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/[0.08]",
                "transition-[background-color] duration-200 ease-out",
                isResizing ? "bg-foreground/50" : "group-hover:bg-foreground/30",
              )}
            />
            <span
              className={cn(
                "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                "h-9 w-[5px] rounded-full bg-foreground/60 shadow-[var(--shadow-soft)]",
                "origin-center transition-[transform,opacity] duration-200 ease-out",
                isResizing ? "scale-100" : "scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100",
              )}
            />
          </div>

          <aside
            aria-hidden={!dockOpen}
            inert={!dockOpen}
            style={{
              width: dockOpen ? dockWidth : 0,
              transition: isResizing ? "none" : "width var(--panel-open-dur) var(--panel-ease)",
            }}
            className={cn(
              "flex min-h-0 flex-col overflow-hidden bg-card",
              "absolute inset-y-0 right-0 z-30 max-w-[min(100%,var(--dock-max))] shadow-[var(--shadow-float)]",
              "lg:static lg:z-auto lg:shrink-0 lg:shadow-none",
              dockOpen ? "border-l border-border lg:border-l-0" : "border-l-0 shadow-none",
            )}
          >
            <div
              className="t-panel-slide flex h-full min-h-0 flex-col"
              data-open={dockOpen}
              style={{ width: dockWidth, "--panel-translate-x": "28px", "--panel-translate-y": "0px" } as CSSProperties}
            >
              <div className="shrink-0 p-3 pb-2">
                <SlidingTabs
                  value={dockTab}
                  onValueChange={(next) => setDockTab(next as DockTab)}
                  tabs={[
                    { id: "assistant", label: t("builder.assistantTab") },
                    { id: "section", label: t("builder.sectionTab") },
                  ]}
                />
              </div>

              {/* Both panes stay mounted: keying this on the active tab would
                  throw away the interview every time someone opened a field. */}
              <div className="min-h-0 flex-1">
                <div className={cn("h-full", dockTab === "assistant" ? "block" : "hidden")}>
                  <AgentAssistant agentId={id} draft={draft} onApply={applyPatch} />
                </div>
                <div className={cn("h-full", dockTab === "section" ? "block" : "hidden")}>
                  <div key={section} className="content-enter h-full">
                    <AgentSectionPanel
                      section={section}
                      agentId={id}
                      status={agent.status}
                      draft={draft}
                      onChange={update}
                      capabilities={capabilities}
                      catalog={catalog}
                      catalogLoading={catalogLoading}
                      channels={channels}
                      assignments={assignments}
                      onAssignChannel={(channel, assignedId) => void assignChannel(channel, assignedId)}
                      business={business}
                      voiceEnabled={Boolean(agent.voice?.enabled)}
                    />
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </>
      </div>
    </div>
  );
}

/** The blueprint's nine cards, each summarised from what is currently saved. */
function buildSections({
  draft,
  capabilities,
  catalogLabel,
  channelAssigned,
  assignments,
  agentId,
  voiceEnabled,
  business,
  t,
}: {
  readonly draft: AgentDraft;
  readonly capabilities: readonly CapabilityOption[];
  readonly catalogLabel: string;
  readonly channelAssigned: boolean;
  readonly assignments: Partial<Record<ChannelId, string>>;
  readonly agentId: string;
  readonly voiceEnabled: boolean;
  readonly business: BusinessContext;
  readonly t: (key: string, vars?: Record<string, string | number>) => string;
}): BlueprintSection[] {
  const chosen = capabilities.filter((capability) => draft.tools.includes(capability.id));
  const unconfigured = chosen.filter((capability) => !capability.configured);
  const mine = (Object.entries(assignments) as [ChannelId, string | undefined][])
    .filter(([, assigned]) => assigned === agentId)
    .map(([channel]) => channel);

  const map: Record<SectionId, BlueprintSection> = {
    identity: {
      id: "identity",
      summary: [draft.name, draft.description].filter(Boolean).join(" — "),
      done: Boolean(draft.name.trim() && draft.description.trim()),
    },
    brief: {
      id: "brief",
      summary: [draft.brief.role, draft.brief.goal].filter(Boolean).join(" — "),
      done: Boolean(draft.brief.role && draft.brief.goal),
    },
    rules: {
      id: "rules",
      summary:
        draft.brief.rules.length + draft.brief.avoid.length > 0
          ? t("builder.rulesSummary", {
              rules: draft.brief.rules.length,
              avoid: draft.brief.avoid.length,
            })
          : "",
      done: draft.brief.rules.length > 0 || Boolean(draft.brief.handoff),
    },
    prompt: {
      id: "prompt",
      summary: draft.systemPrompt.trim().slice(0, 140),
      done: draft.systemPrompt.trim().length >= 40,
    },
    capabilities: {
      id: "capabilities",
      summary: chosen.map((capability) => t(capability.labelKey)).join(", "),
      done: draft.tools.length > 0,
      warning:
        unconfigured.length > 0
          ? t("builder.capabilitiesUnconfigured", { count: unconfigured.length })
          : undefined,
    },
    channels: {
      id: "channels",
      summary: mine.join(", "),
      done: channelAssigned,
    },
    model: { id: "model", summary: catalogLabel, done: true },
    voice: {
      id: "voice",
      summary: voiceEnabled ? t("builder.voiceOn") : "",
      done: voiceEnabled,
    },
    business: {
      id: "business",
      summary: [business.name, t("builder.businessKnowledge", { count: business.knowledgeDocuments })]
        .filter(Boolean)
        .join(" — "),
      done: Boolean(business.name) && business.knowledgeDocuments > 0,
    },
  };

  return SECTION_ORDER.map((id) => map[id]);
}

/** Autosave state, kept as quiet as it should be: a dot and a word. */
function SaveIndicator({ status }: { readonly status: SaveStatus }) {
  const t = useT();
  if (status === "idle") return null;
  return (
    <span className="list-fade-in mr-1 hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase sm:flex">
      <span
        className={cn(
          "size-1.5 rounded-full",
          status === "saving" ? "animate-pulse bg-muted-foreground/60" : "bg-foreground/60",
        )}
      />
      {status === "saving" ? t("automations.saving") : t("automations.saved")}
    </span>
  );
}
