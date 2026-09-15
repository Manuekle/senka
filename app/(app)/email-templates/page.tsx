"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  AiMail01Icon,
  Copy01Icon,
  Mail02Icon,
  PanelLeftIcon,
  SquareLock02Icon,
} from "@hugeicons/core-free-icons";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { Beam } from "@/components/ui/beam";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CodeEditor } from "@/components/email-editor/code-editor";
import { PreviewPane } from "@/components/email-editor/preview-pane";
import { TemplateRail, type TemplateItem } from "@/components/email-editor/template-rail";
import { TestSend, type EmailProvider } from "@/components/email-editor/test-send";
import { VariableInspector } from "@/components/email-editor/variable-inspector";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { useCelebrate } from "@/components/use-celebrate";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { DockReopenButton } from "@/app/_components/dock-reopen-button";

const DOCK_MIN = 320;
const DOCK_MAX = 560;
const DOCK_WIDTH_KEY = "senka:email-dock-width";
const DOCK_OPEN_KEY = "senka:email-dock-open";
const PREVIEW_DEBOUNCE_MS = 350;

type TemplateMeta = TemplateItem & {
  readonly subject: string;
  readonly sample: Record<string, unknown>;
};

type DockTab = "preview" | "variables" | "test";
type SaveStatus = "idle" | "saving" | "saved";

type PreviewState = {
  readonly html: string | null;
  readonly subject: string | null;
  readonly error: string | null;
  readonly loading: boolean;
};

const NO_PREVIEW: PreviewState = { html: null, subject: null, error: null, loading: false };

/**
 * The email template workspace.
 *
 * Same shape as the automation canvas: a toolbar across the top, the thing
 * you're editing filling the middle, and a resizable dock on the right holding
 * everything you look at rather than type into. Templates get their own rail
 * on the left, because picking one is the first thing you do here.
 */
export default function EmailTemplatesPage() {
  const t = useT();
  const { cue } = useSound();
  const celebrate = useCelebrate();

  const [templates, setTemplates] = useState<TemplateMeta[]>([]);
  const [provider, setProvider] = useState<EmailProvider | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [source, setSource] = useState("");
  const [variables, setVariables] = useState<Record<string, unknown>>({});
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [preview, setPreview] = useState<PreviewState>(NO_PREVIEW);

  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiError, setAiError] = useState<UiError | null>(null);

  // Below `md` the rail has no room beside the editor, so it opens as a
  // drawer from the toolbar instead of disappearing with no way to switch.
  const [railOpen, setRailOpen] = useState(false);
  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(400);
  const [dockTab, setDockTab] = useState<DockTab>("preview");
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const selected = useMemo(
    () => templates.find((item) => item.id === selectedId) ?? null,
    [templates, selectedId],
  );
  const readOnly = selected?.source === "builtin";

  // ── Dock geometry ────────────────────────────────────────────────

  useEffect(() => {
    try {
      const width = Number(localStorage.getItem(DOCK_WIDTH_KEY));
      if (Number.isFinite(width) && width >= DOCK_MIN) {
        setDockWidth(Math.min(width, DOCK_MAX));
      }
      const open = localStorage.getItem(DOCK_OPEN_KEY);
      if (open !== null) setDockOpen(open === "1");
    } catch {
      // Private mode, or storage disabled — the defaults are fine.
    }
  }, []);

  const setDockOpenPersisted = useCallback((open: boolean) => {
    setDockOpen(open);
    try {
      localStorage.setItem(DOCK_OPEN_KEY, open ? "1" : "0");
    } catch {
      // Best-effort.
    }
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    const onMove = (event: PointerEvent) => {
      const start = resizeRef.current;
      if (!start) return;
      // Dragging left widens the dock: it's anchored to the right edge.
      const next = start.startWidth - (event.clientX - start.startX);
      setDockWidth(Math.max(DOCK_MIN, Math.min(DOCK_MAX, next)));
    };
    const onUp = () => {
      setIsResizing(false);
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      try {
        localStorage.setItem(DOCK_WIDTH_KEY, String(dockWidth));
      } catch {
        // Best-effort.
      }
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [isResizing, dockWidth]);

  // ── Loading ──────────────────────────────────────────────────────

  const loadList = useCallback(async () => {
    const result = await fetchJson<{ templates: TemplateMeta[]; provider: EmailProvider }>(
      "/api/email-templates",
      t,
    );
    if (!result.ok) {
      setError(result.error);
      return [];
    }
    setError(null);
    setTemplates(result.data.templates);
    setProvider(result.data.provider);
    return result.data.templates;
  }, [t]);

  const openTemplate = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setDirty(false);
      // The email that's already on screen stays there until the new one is
      // rendered. Blanking it here tore the whole phone out of the DOM and
      // rebuilt it — a flash of nothing on every template you clicked.
      setPreview((prev) => ({ ...prev, error: null, loading: true }));
      const result = await fetchJson<{
        template: TemplateMeta;
        source: string | null;
      }>(`/api/email-templates/${id}`, t);
      if (!result.ok) {
        setError(result.error);
        setPreview(NO_PREVIEW);
        return;
      }
      setError(null);
      setSource(result.data.source ?? "");
      setVariables({ ...result.data.template.sample });
      setTemplates((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...result.data.template } : item)),
      );
    },
    [t],
  );

  // First paint: load the list, then open the first template. An empty pane
  // gives no sense of what this page is.
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void loadList().then((list) => {
      setLoading(false);
      if (list.length > 0) void openTemplate(list[0].id);
    });
  }, [loadList, openTemplate]);

  // ── Live preview ─────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedId) {
      setPreview(NO_PREVIEW);
      return;
    }
    let live = true;
    setPreview((prev) => ({ ...prev, loading: true }));

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/email-templates/${selectedId}/preview`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ source: readOnly ? undefined : source, variables }),
        });
        const data = await response.json();
        if (!live) return;
        setPreview({
          html: data.html ?? null,
          subject: data.subject ?? null,
          error: data.renderError ?? (response.ok ? null : (data.message ?? data.error ?? null)),
          loading: false,
        });
      } catch (cause) {
        if (!live) return;
        setPreview({
          html: null,
          subject: null,
          error: cause instanceof Error ? cause.message : String(cause),
          loading: false,
        });
      }
    }, PREVIEW_DEBOUNCE_MS);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [selectedId, source, variables, readOnly]);

  // ── Mutations ────────────────────────────────────────────────────

  const handleCreate = useCallback(async () => {
    setCreating(true);
    const result = await fetchJson<{ template: TemplateMeta }>("/api/email-templates", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadList();
    await openTemplate(result.data.template.id);
    setDockTab("preview");
    cue("success");
  }, [t, loadList, openTemplate, cue]);

  /** Built-ins are read-only, so editing one means taking a copy first. */
  const handleDuplicate = useCallback(async () => {
    if (!selected) return;
    setCreating(true);
    const result = await fetchJson<{ template: TemplateMeta }>("/api/email-templates", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: t("emailTemplates.copyOf", { label: selected.label }),
        description: selected.description,
        subject: selected.subject,
        source,
        sample: variables,
      }),
    });
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await loadList();
    await openTemplate(result.data.template.id);
    cue("success");
  }, [selected, source, variables, t, loadList, openTemplate, cue]);

  /** Turns a plain-language description into a whole new custom template —
   *  label, subject, sample data and source — then opens it the same way a
   *  hand-created one opens, so reviewing the AI's work is just editing. */
  const handleGenerateWithAI = useCallback(async () => {
    const prompt = aiPrompt.trim();
    if (!prompt) return;
    setAiGenerating(true);
    setAiError(null);

    const draft = await fetchJson<{
      label: string;
      description: string;
      subject: string;
      source: string;
      sample: Record<string, unknown>;
    }>("/api/email-templates/generate", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    });
    if (!draft.ok) {
      setAiGenerating(false);
      setAiError(draft.error);
      return;
    }

    const created = await fetchJson<{ template: TemplateMeta }>("/api/email-templates", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        label: draft.data.label,
        description: draft.data.description,
        subject: draft.data.subject,
        source: draft.data.source,
        sample: draft.data.sample,
      }),
    });
    setAiGenerating(false);
    if (!created.ok) {
      setAiError(created.error);
      return;
    }

    setAiPrompt("");
    setAiDialogOpen(false);
    await loadList();
    await openTemplate(created.data.template.id);
    setDockTab("preview");
    // Watching a sentence become a finished template is the first-time wow
    // here. It is also something you might do five times in one sitting, so
    // only the first one bursts — after that `success` says it landed.
    celebrate({ once: "ai-email-template" });
    cue("success");
  }, [aiPrompt, t, loadList, openTemplate, cue, celebrate]);

  const handleSave = useCallback(async () => {
    if (!selectedId || readOnly || !dirty) return;
    setSaveStatus("saving");
    const result = await fetchJson<{ template: TemplateMeta }>(
      `/api/email-templates/${selectedId}`,
      t,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, sample: variables }),
      },
    );
    if (!result.ok) {
      setSaveStatus("idle");
      setError(result.error);
      return;
    }
    setError(null);
    setDirty(false);
    setSaveStatus("saved");
    setTemplates((prev) =>
      prev.map((item) => (item.id === selectedId ? { ...item, ...result.data.template } : item)),
    );
    // The variable list can change with the source, so the inspector follows
    // what the server just parsed rather than what it had before the save.
    setVariables((prev) => {
      const next: Record<string, unknown> = {};
      for (const name of result.data.template.variables) next[name] = prev[name] ?? "";
      return next;
    });
    cue("success");
  }, [selectedId, readOnly, dirty, source, variables, t, cue]);

  useEffect(() => {
    if (saveStatus !== "saved") return;
    const timer = setTimeout(() => setSaveStatus("idle"), 2000);
    return () => clearTimeout(timer);
  }, [saveStatus]);

  const handleDelete = useCallback(
    async (id: string) => {
      const result = await fetchJson(`/api/email-templates/${id}`, t, { method: "DELETE" });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const list = await loadList();
      if (selectedId === id) {
        const next = list.find((item) => item.id !== id);
        if (next) {
          await openTemplate(next.id);
        } else {
          setSelectedId(null);
          setSource("");
          setVariables({});
        }
      }
    },
    [t, loadList, openTemplate, selectedId],
  );

  // Cmd/Ctrl+S saves, because this is a code editor and that is what the
  // muscle memory does.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleSave]);

  const handleSourceChange = useCallback((next: string) => {
    setSource(next);
    setDirty(true);
  }, []);

  const handleVariableChange = useCallback((key: string, value: unknown) => {
    setVariables((prev) => ({ ...prev, [key]: value }));
  }, []);

  // ── Render ───────────────────────────────────────────────────────

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
          <button
            type="button"
            onClick={() => setRailOpen(true)}
            aria-label={t("emailTemplates.railTitle")}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground md:hidden"
          >
            <HugeiconsIcon icon={PanelLeftIcon} size={16} strokeWidth={1.75} />
          </button>
          <div className="hidden size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)] md:flex">
            <HugeiconsIcon icon={Mail02Icon} size={15} strokeWidth={1.75} />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {selected?.label ?? t("emailTemplates.title")}
            </h1>
            {readOnly ? (
              <span
                title={t("emailTemplates.readOnly")}
                className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-1.5 py-0.5 font-mono text-[10px] tracking-[0.1em] text-muted-foreground uppercase sm:px-2"
              >
                <HugeiconsIcon icon={SquareLock02Icon} size={10} strokeWidth={2} />
                <span className="sr-only sm:not-sr-only">{t("emailTemplates.readOnly")}</span>
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
            <SaveIndicator status={saveStatus} dirty={dirty && !readOnly} />

            {/* Wrapped so the beam's glow hides with the button on a phone,
                where this action lives in the templates drawer instead. */}
            <div className="hidden sm:block">
            <Beam colorVariant="mono" strength={0.55}>
              <button
                type="button"
                onClick={() => setAiDialogOpen(true)}
                className={cn(
                  "hidden items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium sm:inline-flex",
                  "shadow-[var(--shadow-inset)] transition-[background-color,border-color] duration-150 ease-out",
                  "hover:border-input hover:bg-accent active:scale-[0.98]",
                )}
              >
                <HugeiconsIcon icon={AiMail01Icon} size={14} strokeWidth={1.75} />
                {t("emailTemplates.generateWithAI")}
              </button>
            </Beam>
            </div>

            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={creating}
              className={cn(
                "hidden items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium sm:inline-flex",
                "shadow-[var(--shadow-inset)] transition-[background-color,border-color] duration-150 ease-out",
                "hover:border-input hover:bg-accent active:scale-[0.98] disabled:opacity-50",
              )}
            >
              <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} />
              {t("emailTemplates.newTemplate")}
            </button>

            {selected ? (
              readOnly ? (
                <button
                  type="button"
                  onClick={() => void handleDuplicate()}
                  disabled={creating}
                  aria-label={t("emailTemplates.duplicate")}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground sm:px-3",
                    "shadow-[var(--shadow-button)] transition-transform duration-150 active:scale-[0.98] disabled:opacity-60",
                  )}
                >
                  <HugeiconsIcon icon={Copy01Icon} size={14} strokeWidth={1.75} />
                  <span className="hidden sm:inline">{t("emailTemplates.duplicate")}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={!dirty || saveStatus === "saving"}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-medium",
                    "transition-[background-color,box-shadow,opacity] duration-150 ease-out",
                    dirty
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-button)] active:scale-[0.98]"
                      : "cursor-not-allowed border border-border bg-card text-muted-foreground opacity-40 shadow-[var(--shadow-inset)]",
                  )}
                >
                  {t("emailTemplates.save")}
                </button>
              )
            ) : null}

            <span className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDockOpenPersisted(!dockOpen)}
                  aria-label={t("emailTemplates.preview")}
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
              <TooltipContent side="bottom">{t("emailTemplates.preview")}</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {error ? (
          <ErrorBanner
            className="rounded-none border-x-0 border-t shadow-none"
            error={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </header>

      {/* A size container, so the dock can be "its width, or the whole
          workspace if that is narrower" — on a phone a 400px dock inside a
          375px screen clipped its own tabs and preview. */}
      <div
        className="@container relative flex min-h-0 flex-1"
        style={{ ["--dock-max" as string]: `${DOCK_MAX}px` }}
      >
        {/* Rail */}
        <aside className="hidden w-72 shrink-0 flex-col border-r border-border bg-card/30 md:flex xl:w-80">
          <TemplateRail
            templates={templates}
            selectedId={selectedId}
            creating={creating}
            onSelect={(id) => void openTemplate(id)}
            onCreateNew={() => void handleCreate()}
            onDelete={(id) => void handleDelete(id)}
          />
        </aside>

        {/* Editor */}
        <div className="relative min-w-0 flex-1">
          <Skeleton className="h-full" isLoading={loading} skeleton={<EditorSkeleton />}>
            {selectedId ? (
              <div key={selectedId} className="content-enter h-full">
                <CodeEditor value={source} onChange={handleSourceChange} readOnly={readOnly} />
              </div>
            ) : (
              <EmptyState onCreate={() => void handleCreate()} />
            )}
          </Skeleton>

          {!dockOpen && selectedId ? (
            <DockReopenButton
              icon={Mail02Icon}
              label={t("emailTemplates.preview")}
              onClick={() => setDockOpenPersisted(true)}
            />
          ) : null}
        </div>

        {/* Resizer */}
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
          aria-label={t("emailTemplates.resizeDock")}
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
              "absolute top-1/2 left-1/2 flex h-9 w-[5px] -translate-x-1/2 -translate-y-1/2",
              "rounded-full bg-foreground/60 shadow-[var(--shadow-soft)]",
              "origin-center transition-transform duration-200 ease-out",
              isResizing ? "scale-100" : "scale-0 group-hover:scale-100",
            )}
          />
        </div>

        {/* Dock */}
        <aside
          aria-hidden={!dockOpen}
          inert={!dockOpen}
          style={{
            width: dockOpen ? `min(100cqw, ${dockWidth}px)` : 0,
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
            style={
              {
                width: `min(100cqw, ${dockWidth}px)`,
                "--panel-translate-x": "28px",
                "--panel-translate-y": "0px",
              } as CSSProperties
            }
          >
            <div className="shrink-0 p-3 pb-2">
              <SlidingTabs
                value={dockTab}
                onValueChange={(next) => setDockTab(next as DockTab)}
                tabs={[
                  { id: "preview", label: t("emailTemplates.preview") },
                  {
                    id: "variables",
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        {t("emailTemplates.variables")}
                        {selected && selected.variables.length > 0 ? (
                          <span className="font-mono text-[10px] tabular-nums opacity-60">
                            {selected.variables.length}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                  { id: "test", label: t("emailTemplates.sendTest") },
                ]}
              />
            </div>

            {/* All three stay mounted: keying on the active tab would throw
                away a half-typed test address every time you checked the
                preview. */}
            <div className="min-h-0 flex-1">
              <div className={cn("h-full", dockTab === "preview" ? "block" : "hidden")}>
                <PreviewPane
                  html={preview.html}
                  subject={preview.subject ?? selected?.subject ?? null}
                  from={provider?.from ?? null}
                  error={preview.error}
                  empty={!selectedId}
                />
              </div>
              <div
                className={cn(
                  "h-full overflow-y-auto scrollbar-hide",
                  dockTab === "variables" ? "block" : "hidden",
                )}
              >
                {selected ? (
                  <VariableInspector
                    key={selected.id}
                    variables={selected.variables}
                    values={variables}
                    onChange={handleVariableChange}
                  />
                ) : null}
              </div>
              <div
                className={cn(
                  "h-full overflow-y-auto scrollbar-hide",
                  dockTab === "test" ? "block" : "hidden",
                )}
              >
                {selected ? (
                  <TestSend
                    templateId={selected.id}
                    source={readOnly ? null : source}
                    variables={variables}
                    subject={preview.subject ?? selected.subject}
                    provider={provider}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </aside>
      </div>

      <Drawer open={railOpen} onOpenChange={setRailOpen} panelClassName="max-w-sm">
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle icon={<HugeiconsIcon icon={Mail02Icon} size={18} strokeWidth={1.75} />}>
              {t("emailTemplates.title")}
            </DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 flex-1">
            <TemplateRail
              templates={templates}
              selectedId={selectedId}
              creating={creating}
              onSelect={(id) => {
                setRailOpen(false);
                void openTemplate(id);
              }}
              onCreateNew={() => {
                setRailOpen(false);
                void handleCreate();
              }}
              onDelete={(id) => void handleDelete(id)}
            />
          </div>
          <DrawerFooter>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setRailOpen(false);
                setAiDialogOpen(true);
              }}
            >
              <HugeiconsIcon icon={AiMail01Icon} size={14} strokeWidth={1.75} />
              {t("emailTemplates.generateWithAI")}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={aiDialogOpen} onOpenChange={setAiDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle icon={<HugeiconsIcon icon={AiMail01Icon} size={18} strokeWidth={1.75} />}>
              {t("emailTemplates.generateDialogTitle")}
            </DialogTitle>
            <DialogDescription>{t("emailTemplates.generateDialogDescription")}</DialogDescription>
          </DialogHeader>

          <ErrorBanner error={aiError} onDismiss={() => setAiError(null)} />

          <Textarea
            aria-label={t("emailTemplates.generatePlaceholder")}
            value={aiPrompt}
            onChange={(event) => setAiPrompt(event.target.value)}
            placeholder={t("emailTemplates.generatePlaceholder")}
            rows={4}
            autoFocus
          />

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={aiGenerating}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Beam colorVariant="mono" strength={aiGenerating ? 0.9 : 0.55}>
              <Button
                type="button"
                variant="outline"
                className="bg-card"
                disabled={aiGenerating || !aiPrompt.trim()}
                onClick={() => void handleGenerateWithAI()}
              >
                {aiGenerating ? <Spinner size={14} /> : null}
                {aiGenerating ? t("emailTemplates.generating") : t("emailTemplates.generateAction")}
              </Button>
            </Beam>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="h-full space-y-2.5 bg-muted/10 p-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <SkeletonBar key={i} className="h-3" width={`${72 - (i % 5) * 11}%`} />
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { readonly onCreate: () => void }) {
  const t = useT();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
        <HugeiconsIcon icon={Mail02Icon} size={18} strokeWidth={1.5} />
      </div>
      <p className="text-sm font-medium">{t("emailTemplates.noTemplate")}</p>
      <p className="max-w-[38ch] text-[12px] leading-relaxed text-muted-foreground">
        {t("emailTemplates.noTemplateHint")}
      </p>
      <button
        type="button"
        onClick={onCreate}
        className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground shadow-[var(--shadow-button)] transition-transform duration-150 active:scale-[0.98]"
      >
        <HugeiconsIcon icon={Add01Icon} size={14} strokeWidth={1.75} />
        {t("emailTemplates.newTemplate")}
      </button>
    </div>
  );
}

/** A dot and a word, same as the flow canvas: quiet at rest, and the only
 *  thing on the toolbar that says whether your edit is safe. */
function SaveIndicator({
  status,
  dirty,
}: {
  readonly status: SaveStatus;
  readonly dirty: boolean;
}) {
  const t = useT();
  if (status === "idle" && !dirty) return null;
  const saving = status === "saving";
  return (
    <span className="list-fade-in mr-1 hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase sm:flex">
      {saving ? (
        <Spinner size={11} strokeWidth={2} />
      ) : (
        <span
          className={cn(
            "size-1.5 rounded-full",
            status === "saved" ? "bg-foreground/60" : "animate-pulse bg-amber-500",
          )}
        />
      )}
      {saving
        ? t("emailTemplates.saving")
        : status === "saved"
          ? t("emailTemplates.saved")
          : t("emailTemplates.unsaved")}
    </span>
  );
}
