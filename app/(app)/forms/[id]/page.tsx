"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
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
  AlertCircleIcon,
  ArrowLeft01Icon,
  SearchAreaIcon,
  FileEditIcon,
  PanelLeftIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { ErrorBanner } from "@/components/ui/error-banner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PublicForm } from "@/app/f/[slug]/public-form";
import { StepRail } from "./_components/step-rail";
import { NoStepSelected, StepEditor } from "./_components/step-editor";
import { SettingsPane } from "./_components/settings-pane";
import { ResponsesPane } from "./_components/responses-pane";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import {
  addChoice,
  addField,
  addStep,
  conditionSources,
  draftChanged,
  draftOf,
  duplicateStep,
  moveChoice,
  moveField,
  moveStep,
  removeChoice,
  removeField,
  removeStep,
  reorderChoices,
  reorderFields,
  updateChoice,
  updateField,
  updateStep,
  type FormDraft,
} from "@/lib/forms/draft";
import { toPublicView } from "@/lib/forms/public-view";
import { validateDraft, type FormIssue } from "@/lib/forms/schema";
import { maxScore } from "@/lib/forms/scoring";
import { useI18n } from "@/lib/i18n/provider";
import type { Form, FormResponse, FormStep } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { DockReopenButton } from "@/app/_components/dock-reopen-button";

/**
 * The form workspace.
 *
 * Built on the same three-part shape as the email templates screen and the
 * automation canvas, because it is the same kind of work: a rail on the left
 * holding the list you pick from, the one thing you are editing filling the
 * middle, and a resizable dock on the right holding everything you look at
 * rather than type into.
 *
 * What this replaced was a single scrolling page with five stacked cards — the
 * link, the QR, the webhook, every step of the builder and the response table,
 * all at once. It worked, and it read like a settings page rather than an
 * editor. The parts have not changed; where they live has.
 */

const DOCK_MIN = 320;
const DOCK_MAX = 560;
const DOCK_WIDTH_KEY = "senka:form-dock-width";
const DOCK_OPEN_KEY = "senka:form-dock-open";

type DockTab = "preview" | "settings" | "responses";
type SaveStatus = "idle" | "saving" | "saved";

export default function FormWorkspacePage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { t } = useI18n();

  const [form, setForm] = useState<Form | null>(null);
  const [responses, setResponses] = useState<FormResponse[]>([]);
  const [draft, setDraft] = useState<FormDraft | null>(null);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [previewNonce, setPreviewNonce] = useState(0);

  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(360);
  const [dockTab, setDockTab] = useState<DockTab>("preview");
  const [isResizing, setIsResizing] = useState(false);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // ── Loading ──────────────────────────────────────────────────────

  const load = useCallback(async () => {
    const result = await fetchJson<{ form: Form; responses: FormResponse[] }>(
      `/api/forms/${id}`,
      t,
    );
    setIsLoading(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setError(null);
    setForm(result.data.form);
    setResponses(result.data.responses);
    setDraft((current) => current ?? draftOf(result.data.form));
    setSelectedStepId((current) => current ?? result.data.form.steps[0]?.id ?? null);
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Dock geometry ────────────────────────────────────────────────

  useEffect(() => {
    try {
      const width = Number(localStorage.getItem(DOCK_WIDTH_KEY));
      if (Number.isFinite(width) && width >= DOCK_MIN) setDockWidth(Math.min(width, DOCK_MAX));
      if (localStorage.getItem(DOCK_OPEN_KEY) === "0") setDockOpen(false);
    } catch {
      // Private mode, blocked storage — the defaults are fine.
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
    const move = (event: PointerEvent) => {
      const start = resizeRef.current;
      if (!start) return;
      // Dragging left widens: the handle is on the dock's left edge.
      const next = start.startWidth - (event.clientX - start.startX);
      setDockWidth(Math.min(DOCK_MAX, Math.max(DOCK_MIN, next)));
    };
    const stop = () => {
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
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
  }, [isResizing, dockWidth]);

  // ── Draft ────────────────────────────────────────────────────────

  const saved = useMemo(() => (form ? draftOf(form) : null), [form]);
  const dirty = Boolean(draft && saved && draftChanged(draft, saved));
  const issues = useMemo(() => (draft ? validateDraft(draft) : []), [draft]);
  const ceiling = useMemo(
    () => (form && draft ? maxScore({ ...form, steps: draft.steps }) : 0),
    [form, draft],
  );
  /** Points only matter once something is worth points. An unscored form gets
   *  a simpler editor rather than a column of zeroes. */
  const scores = ceiling > 0;

  /** Issues, filed where they can be acted on: a step's problems next to that
   *  step, scoring problems in the settings pane, and a dot in the rail so the
   *  ones on a step you aren't looking at are still findable. */
  const { brokenSteps, issuesByStep, scoringIssues } = useMemo(() => {
    const broken = new Set<number>();
    const byStep = new Map<number, FormIssue[]>();
    const scoring: FormIssue[] = [];
    for (const issue of issues) {
      if (issue.path.startsWith("scoring")) {
        scoring.push(issue);
        continue;
      }
      const index = Number(issue.path.split(".")[1]);
      if (!Number.isInteger(index)) continue;
      broken.add(index);
      byStep.set(index, [...(byStep.get(index) ?? []), issue]);
    }
    return { brokenSteps: broken, issuesByStep: byStep, scoringIssues: scoring };
  }, [issues]);

  const steps = draft?.steps ?? [];
  const selectedIndex = steps.findIndex((step) => step.id === selectedStepId);
  const selectedStep = selectedIndex >= 0 ? steps[selectedIndex] : null;

  const setSteps = useCallback((next: readonly FormStep[]) => {
    setDraft((current) => (current ? { ...current, steps: next } : current));
    setSaveStatus("idle");
  }, []);

  const patchDraft = useCallback((patch: Partial<FormDraft>) => {
    setDraft((current) => (current ? { ...current, ...patch } : current));
    setSaveStatus("idle");
  }, []);

  /** Keep a step selected across edits that remove the current one. */
  useEffect(() => {
    if (steps.length === 0) return;
    if (steps.some((step) => step.id === selectedStepId)) return;
    setSelectedStepId(steps[Math.min(selectedIndex < 0 ? 0 : selectedIndex, steps.length - 1)].id);
  }, [steps, selectedStepId, selectedIndex]);

  // ── Saving ───────────────────────────────────────────────────────

  const save = async () => {
    if (!form || !draft) return;
    setSaveStatus("saving");
    const result = await fetchJson<{ form: Form }>(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim() || form.name,
        description: draft.description,
        steps: draft.steps,
        scoring: draft.scoring,
        // "" clears it, the same convention the webhook field uses.
        thankYou: draft.thankYou ?? "",
      }),
    });
    if (!result.ok) {
      setSaveStatus("idle");
      setError(result.error);
      return;
    }
    setForm(result.data.form);
    setDraft(draftOf(result.data.form));
    setSaveStatus("saved");
  };

  /** The three settings that save on their own — each is one decision with
   *  nothing to batch it with. Returns whether it stuck, so the pane can
   *  close its own inline editor. */
  const patchForm = async (body: Record<string, unknown>): Promise<boolean> => {
    if (!form) return false;
    const result = await fetchJson<{ form: Form }>(`/api/forms/${form.id}`, t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      setError(result.error);
      return false;
    }
    setError(null);
    setForm(result.data.form);
    return true;
  };

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const blocked = issues.length > 0;

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
        <div className="flex items-center gap-2.5 px-3 py-2.5 sm:px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/forms"
                aria-label={t("forms.detail.back")}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("forms.detail.back")}</TooltipContent>
          </Tooltip>

          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={FileEditIcon} size={15} strokeWidth={1.75} />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">
              {draft?.name || form?.name || t("forms.title")}
            </h1>
            {form ? (
              <button
                type="button"
                className="shrink-0"
                onClick={() =>
                  void patchForm({
                    status: form.status === "published" ? "draft" : "published",
                  })
                }
              >
                <StatusBadge
                  status={form.status === "published" ? "active" : "draft"}
                  label={t(`forms.status.${form.status}`)}
                  title={t(form.status === "published" ? "forms.unpublish" : "forms.publish")}
                />
              </button>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SaveIndicator status={saveStatus} dirty={dirty} blocked={blocked} count={issues.length} />

            <button
              type="button"
              onClick={() => void save()}
              disabled={!dirty || blocked || saveStatus === "saving"}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                "transition-[background-color,box-shadow,opacity] duration-150 ease-out",
                dirty && !blocked
                  ? "bg-primary text-primary-foreground shadow-[var(--shadow-button)] active:scale-[0.98]"
                  : "cursor-not-allowed border border-border bg-card text-muted-foreground opacity-40 shadow-[var(--shadow-inset)]",
              )}
            >
              {t("forms.builder.save")}
            </button>

            {dirty ? (
              <button
                type="button"
                onClick={() => saved && setDraft(saved)}
                disabled={saveStatus === "saving"}
                className="hidden rounded-lg px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground sm:inline-flex"
              >
                {t("forms.builder.discard")}
              </button>
            ) : null}

            <span className="mx-0.5 h-5 w-px bg-border" />
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setDockOpenPersisted(!dockOpen)}
                  aria-label={t("forms.builder.previewTitle")}
                  aria-pressed={dockOpen}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-lg transition-colors duration-150",
                    dockOpen
                      ? "bg-muted text-foreground shadow-[var(--shadow-inset)]"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon
                    icon={PanelLeftIcon}
                    size={16}
                    strokeWidth={1.75}
                    className="rotate-180"
                  />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("forms.builder.previewTitle")}</TooltipContent>
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

      <div
        className="relative flex min-h-0 flex-1"
        style={{ ["--dock-max" as string]: `${DOCK_MAX}px` }}
      >
        {/* Rail */}
        <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-card/30 md:flex xl:w-72">
          <Skeleton className="h-full" isLoading={isLoading} skeleton={<RailSkeleton />}>
            <StepRail
              steps={steps}
              selectedId={selectedStepId}
              issuePaths={brokenSteps}
              onSelect={setSelectedStepId}
              onAdd={() => {
                const next = addStep(steps);
                setSteps(next);
                setSelectedStepId(next[next.length - 1].id);
              }}
              onMove={(stepId, direction) => setSteps(moveStep(steps, stepId, direction))}
              onReorder={setSteps}
              onDuplicate={(stepId) => setSteps(duplicateStep(steps, stepId))}
              onRemove={(stepId) => setSteps(removeStep(steps, stepId))}
            />
          </Skeleton>
        </aside>

        {/* Editor */}
        <div className="relative min-w-0 flex-1">
          <Skeleton className="h-full" isLoading={isLoading} skeleton={<EditorSkeleton />}>
            {selectedStep ? (
              <div key={selectedStep.id} className="content-enter h-full">
                <StepEditor
                  step={selectedStep}
                  index={selectedIndex}
                  total={steps.length}
                  sources={conditionSources(steps, selectedIndex)}
                  showPoints={scores}
                  issues={issuesByStep.get(selectedIndex) ?? []}
                  onChange={(patch) => setSteps(updateStep(steps, selectedStep.id, patch))}
                  onAddField={() => setSteps(addField(steps, selectedStep.id))}
                  onFieldChange={(fieldId, patch) => setSteps(updateField(steps, fieldId, patch))}
                  onFieldMove={(fieldId, direction) =>
                    setSteps(moveField(steps, selectedStep.id, fieldId, direction))
                  }
                  onFieldRemove={(fieldId) => setSteps(removeField(steps, fieldId))}
                  onChoiceAdd={(fieldId) => setSteps(addChoice(steps, fieldId))}
                  onChoiceChange={(fieldId, choiceId, patch) =>
                    setSteps(updateChoice(steps, fieldId, choiceId, patch))
                  }
                  onChoiceMove={(fieldId, choiceId, direction) =>
                    setSteps(moveChoice(steps, fieldId, choiceId, direction))
                  }
                  onChoiceRemove={(fieldId, choiceId) =>
                    setSteps(removeChoice(steps, fieldId, choiceId))
                  }
                  onChoiceReorder={(fieldId, choiceIds) =>
                    setSteps(reorderChoices(steps, fieldId, choiceIds))
                  }
                  onFieldReorder={(fieldIds) =>
                    setSteps(reorderFields(steps, selectedStep.id, fieldIds))
                  }
                />
              </div>
            ) : (
              <NoStepSelected />
            )}
          </Skeleton>

          {!dockOpen ? (
            <DockReopenButton
              icon={SearchAreaIcon}
              label={t("forms.builder.previewTitle")}
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
          aria-label={t("forms.builder.resizeDock")}
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
              "origin-center transition-[transform,opacity] duration-200 ease-out",
              isResizing ? "scale-100" : "scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100",
            )}
          />
        </div>

        {/* Dock */}
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
            style={
              {
                width: dockWidth,
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
                  { id: "preview", label: t("forms.builder.previewTitle") },
                  { id: "settings", label: t("forms.builder.settingsTab") },
                  {
                    id: "responses",
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        {t("forms.detail.responses")}
                        {responses.length > 0 ? (
                          <span className="font-mono text-[10px] tabular-nums opacity-60">
                            {responses.length}
                          </span>
                        ) : null}
                      </span>
                    ),
                  },
                ]}
                trailing={
                  dockTab === "preview" ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setPreviewNonce((n) => n + 1)}
                          aria-label={t("forms.builder.previewReset")}
                          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground"
                        >
                          <HugeiconsIcon icon={RefreshIcon} size={14} strokeWidth={1.75} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">
                        {t("forms.builder.previewReset")}
                      </TooltipContent>
                    </Tooltip>
                  ) : undefined
                }
              />
            </div>

            {/* All three stay mounted: keying on the active tab would throw
                away a half-typed webhook URL every time you checked the
                preview. */}
            <div className="min-h-0 flex-1">
              <div
                className={cn(
                  "h-full overflow-y-auto scrollbar-hide",
                  dockTab === "preview" ? "block" : "hidden",
                )}
              >
                {form && draft ? (
                  <div className="p-4">
                    <PublicForm
                      key={previewNonce}
                      preview
                      bare
                      form={toPublicView({ ...draft, slug: form.slug })}
                    />
                  </div>
                ) : null}
              </div>

              <div className={cn("h-full", dockTab === "settings" ? "block" : "hidden")}>
                {form && draft ? (
                  <SettingsPane
                    active={dockOpen && dockTab === "settings"}
                    form={form}
                    draft={draft}
                    ceiling={ceiling}
                    origin={origin}
                    issues={scoringIssues}
                    onDraftChange={patchDraft}
                    onSlugSave={(slug) => patchForm({ slug })}
                    onWebhookSave={(webhookUrl) => patchForm({ webhookUrl })}
                  />
                ) : null}
              </div>

              <div className={cn("h-full", dockTab === "responses" ? "block" : "hidden")}>
                <ResponsesPane responses={responses} ceiling={ceiling} />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

/** A dot and a word, same as the email and flow toolbars: quiet at rest, and
 *  the only thing up here that says whether your edit is safe. Blocked is its
 *  own state — "unsaved" next to a disabled Save button explains nothing. */
function SaveIndicator({
  status,
  dirty,
  blocked,
  count,
}: {
  readonly status: SaveStatus;
  readonly dirty: boolean;
  readonly blocked: boolean;
  readonly count: number;
}) {
  const { t } = useI18n();
  if (blocked) {
    return (
      <span className="list-fade-in mr-1 hidden items-center gap-1.5 font-mono text-[10px] tracking-[0.12em] text-destructive uppercase sm:flex">
        <HugeiconsIcon icon={AlertCircleIcon} size={11} strokeWidth={2} />
        {t("forms.builder.issueCount", { count })}
      </span>
    );
  }
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
            status === "saved" && !dirty ? "bg-foreground/60" : "animate-pulse bg-amber-500",
          )}
        />
      )}
      {saving
        ? t("forms.builder.saving")
        : status === "saved" && !dirty
          ? t("forms.builder.saved")
          : t("forms.builder.unsaved")}
    </span>
  );
}

function RailSkeleton() {
  return (
    <div className="space-y-1.5 p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5 rounded-lg px-2.5 py-2">
          <SkeletonBar className="h-3.5" width={`${80 - (i % 3) * 15}%`} />
          <SkeletonBar className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

function EditorSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-3 px-8 py-6">
      <SkeletonBar className="h-3 w-16" />
      <SkeletonBar className="h-7 w-64" />
      <SkeletonBar className="h-4 w-80" />
      <div className="space-y-3 pt-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border/60 p-3">
            <SkeletonBar className="h-8 w-full rounded-lg" />
            <SkeletonBar className="h-8 w-2/3 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}
