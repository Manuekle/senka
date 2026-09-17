"use client";

import {
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowLeft01Icon,
  ZapIcon,
  PanelLeftIcon,
  AiElementsIcon,
} from "@hugeicons/core-free-icons";
import { StatusBadge } from "../../../_components/channel-badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AutomationDialog } from "@/components/ai-elements/automation-dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { FlowCanvas } from "@/components/ai-elements/flow-canvas";
import { FlowAssistant } from "@/components/ai-elements/flow-assistant";
import { StepPanel } from "@/components/ai-elements/step-panel";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useCelebrate } from "@/components/use-celebrate";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Orb } from "@/components/ui/orb";
import { useT } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { cn } from "@/lib/utils";
import { planToInput, toWorkflowSteps, type WorkflowPlan } from "@/lib/workflow-schema";
import type { StepOutcome } from "@/lib/automation-runner";
import { STEP_LABEL_KEYS } from "@/lib/workflow-step-meta";
import type { XY } from "@/lib/workflow-layout";
import {
  getStepAt,
  insertStepAt,
  moveStepAt,
  connectWorkflowSteps,
  newStep,
  pathsEqual,
  removeStepAt,
  stripPositions,
  updateStepAt,
  type StepPath,
} from "@/lib/workflow-tree";
import type { Automation, WorkflowConnection, WorkflowStep, WorkflowStepType } from "@/lib/types";
import { DockReopenButton } from "@/app/_components/dock-reopen-button";

const DOCK_MIN = 340;
const DOCK_MAX = 620;
const DOCK_WIDTH_KEY = "senka:flow-dock-width";
const DOCK_OPEN_KEY = "senka:flow-dock-open";

type SaveStatus = "idle" | "saving" | "saved";
type DockTab = "assistant" | "step";

export default function AutomationFlowPage() {
  const t = useT();
  const { cue } = useSound();
  const celebrate = useCelebrate();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [automation, setAutomation] = useState<Automation | null>(null);
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [selectedPath, setSelectedPath] = useState<StepPath | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [dockTab, setDockTab] = useState<DockTab>("assistant");
  const [dockOpen, setDockOpen] = useState(true);
  const [dockWidth, setDockWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  // Running one step is a real action, not a preview, so it goes through a
  // confirmation first — see the dialog at the bottom of this component.
  const [runTarget, setRunTarget] = useState<StepPath | null>(null);
  const [runState, setRunState] = useState<"idle" | "running">("idle");
  const [runResult, setRunResult] = useState<{ path: StepPath; outcome: StepOutcome } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resizeRef = useRef<{ startX: number; startWidth: number } | null>(null);
  // True when the dock was opened by picking a step, not by the user.
  const dockAutoOpenedRef = useRef(false);

  useEffect(() => {
    try {
      const storedWidth = Number(localStorage.getItem(DOCK_WIDTH_KEY));
      if (storedWidth >= DOCK_MIN && storedWidth <= DOCK_MAX) setDockWidth(storedWidth);
      const storedOpen = localStorage.getItem(DOCK_OPEN_KEY);
      // Below lg the dock floats over the canvas, so opening it by default
      // would hide the flow someone came here to see.
      if (storedOpen === "0" || (storedOpen === null && window.innerWidth < 1024)) setDockOpen(false);
    } catch {
      // Private mode / blocked storage — defaults are fine.
    }
  }, []);

  const load = useCallback(async () => {
    const result = await fetchJson<{ automations?: Automation[] }>("/api/automations", t);
    if (!result.ok) {
      // A load that failed is not the same as an automation that isn't there.
      // Showing "not found" for an unreachable server told people their work
      // had been deleted.
      setError(result.error);
      setIsLoading(false);
      return;
    }
    const found = result.data.automations?.find((a) => a.id === id);
    if (!found) {
      setNotFound(true);
    } else {
      setError(null);
      setAutomation(found);
      setSteps(found.steps ?? []);
    }
    setIsLoading(false);
  }, [id, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Debounced autosave, triggered explicitly by each mutation below (not a
  // useEffect on `steps` — that would also fire for the initial load from
  // the fetch above, which isn't an edit).
  const scheduleSave = (nextSteps: WorkflowStep[]) => {
    setSaveStatus("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void (async () => {
        const result = await fetchJson<{ automations?: Automation[] }>("/api/automations", t, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, steps: nextSteps }),
        });
        if (!result.ok) {
          // An autosave that quietly gave up left the canvas looking saved.
          setSaveStatus("idle");
          setError(result.error);
          return;
        }
        const updated = result.data.automations?.find((a) => a.id === id);
        if (updated) setAutomation(updated);
        setError(null);
        setSaveStatus("saved");
      })();
    }, 600);
  };
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  /**
   * Selecting a step opens the dock on its panel. Clicking empty canvas has to
   * undo that: leaving the dock parked on an empty "step" pane — telling you
   * to click a step, next to the canvas you just clicked away from — is the
   * one state it should never rest in. A dock the selection opened closes
   * again; one the user opened themselves only falls back to the assistant.
   */
  const handleSelect = (path: StepPath | null) => {
    setSelectedPath(path);
    if (path) {
      setDockTab("step");
      if (!dockOpen) {
        dockAutoOpenedRef.current = true;
        setDockOpenPersisted(true);
      }
      return;
    }
    setDockTab("assistant");
    if (dockAutoOpenedRef.current) {
      dockAutoOpenedRef.current = false;
      setDockOpenPersisted(false);
    }
  };

  const handleAddStep = (parentPath: StepPath, index: number, type: WorkflowStepType) => {
    const step = newStep(type);
    setSteps((prev) => {
      const next = insertStepAt(prev, parentPath, index, step);
      scheduleSave(next);
      return next;
    });
    handleSelect([...parentPath, index]);
  };
  const handleRemoveStep = (path: StepPath) => {
    setSteps((prev) => {
      const next = removeStepAt(prev, path);
      scheduleSave(next);
      return next;
    });
    setSelectedPath((prev) => (prev && pathsEqual(prev, path) ? null : prev));
  };
  const handleMoveStep = (path: StepPath, dir: "up" | "down") => {
    setSteps((prev) => {
      const next = moveStepAt(prev, path, dir);
      scheduleSave(next);
      return next;
    });
  };
  const handleMoveNode = useCallback(
    (path: StepPath, position: XY) => {
      setSteps((prev) => {
        const next = updateStepAt(prev, path, (s) => ({ ...s, position }));
        scheduleSave(next);
        return next;
      });
    },
    // scheduleSave closes over `id` only, which is stable for the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const handleResetLayout = useCallback(() => {
    setSteps((prev) => {
      const next = stripPositions(prev);
      scheduleSave(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  /**
   * Wire `target` to run right after `source`. In a tree model that's a move,
   * not a new pointer: the step leaves wherever it was and is re-inserted as
   * the source's next sibling, dropping its isolated flag on the way.
   * Selection is cleared because every path after the move can have shifted.
   */
  const handleConnectSteps = useCallback((source: StepPath, target: StepPath, connection?: WorkflowConnection) => {
    setSteps((prev) => {
      const next = connectWorkflowSteps(prev, source, target, connection);
      if (next === prev) return prev;
      scheduleSave(next);
      return next;
    });
    setSelectedPath(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const handleUpdateConnection = useCallback((path: StepPath, connection: WorkflowConnection | undefined) => {
    setSteps(prev => {
      const next = updateStepAt(prev, path, step => ({ ...step, connection }));
      scheduleSave(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  /** Drop a standalone step on the canvas — right-click on empty space, or
   *  the quick-add menu. It lands isolated so it reads as its own flow rather
   *  than silently extending whatever the last step happened to be. */
  const handleAddStepAt = useCallback((type: WorkflowStepType, position: XY) => {
    setSteps((prev) => {
      const step: WorkflowStep = { ...newStep(type), position, ...(prev.length > 0 ? { isolated: true } : {}) };
      const next = insertStepAt(prev, [], prev.length, step);
      scheduleSave(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const handleToggleDisabled = useCallback((path: StepPath, disabled: boolean) => {
    setSteps((prev) => {
      const next = updateStepAt(prev, path, (s) => ({ ...s, disabled }));
      scheduleSave(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const handleSetConnector = useCallback((path: StepPath, connector: "solid" | "dashed") => {
    setSteps((prev) => {
      const next = updateStepAt(prev, path, (s) => ({ ...s, connector }));
      scheduleSave(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  const handleIsolateStep = useCallback(
    (path: StepPath, isolated: boolean) => {
      setSteps((prev) => {
        const next = updateStepAt(prev, path, (s) => ({ ...s, isolated }));
        scheduleSave(next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id],
  );
  const updateSelectedStepConfig = (key: string, value: string) => {
    if (!selectedPath) return;
    setSteps((prev) => {
      const next = updateStepAt(prev, selectedPath, (s) => ({ ...s, config: { ...s.config, [key]: value } }));
      scheduleSave(next);
      return next;
    });
  };
  const handleApplyPlan = (plan: WorkflowPlan) => {
    const next = toWorkflowSteps(planToInput(plan.steps));
    setSteps(next);
    setSelectedPath(null);
    scheduleSave(next);
  };
  const selectedStep = selectedPath ? getStepAt(steps, selectedPath) : undefined;

  /** PUT and re-read this automation from the list the route answers with.
   *  Returns null (and shows the banner) when the call failed, so callers
   *  never celebrate a change the server refused. */
  const putAutomation = async (body: Record<string, unknown>): Promise<Automation | null> => {
    const result = await fetchJson<{ automations?: Automation[] }>("/api/automations", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!result.ok) {
      setError(result.error);
      return null;
    }
    setError(null);
    const updated = result.data.automations?.find((a) => a.id === id);
    if (updated) setAutomation(updated);
    return updated ?? null;
  };

  const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!automation) return;
    const status = automation.status === "active" ? "paused" : "active";
    const button = event.currentTarget;
    void (async () => {
      const updated = await putAutomation({ id, status });
      if (!updated) return;
      // Going live is the one moment on this page worth celebrating —
      // pausing is not, and neither is saving a step.
      if (status === "active") celebrate({ from: button });
    })();
  };

  const handleUpdateBasics = (updates: Partial<Omit<Automation, "id" | "steps">>) => {
    void putAutomation({ id, ...updates });
  };

  const setDockOpenPersisted = (open: boolean) => {
    setDockOpen(open);
    try {
      localStorage.setItem(DOCK_OPEN_KEY, open ? "1" : "0");
    } catch {
      // Best-effort.
    }
  };

  // ── Dock resize ──────────────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!resizeRef.current) return;
      const delta = resizeRef.current.startX - e.clientX;
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


  if (notFound) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-card px-10 py-14 text-center shadow-[var(--shadow-soft)]">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={ZapIcon} size={20} strokeWidth={1.75} />
          </div>
          <p className="text-sm font-medium">{t("automations.notFound")}</p>
          <button
            onClick={() => router.push("/automations")}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.75} />
            {t("automations.backToList")}
          </button>
        </div>
      </div>
    );
  }

  // The load failed before anything arrived. Without this the page falls into
  // the skeleton below and spins for ever on a server that isn't answering.
  if (!isLoading && !automation && error) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="w-full max-w-md">
          <ErrorBanner error={error} onRetry={() => void load()} />
          <button
            onClick={() => router.push("/automations")}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium transition-colors hover:bg-accent"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={1.75} />
            {t("automations.backToList")}
          </button>
        </div>
      </div>
    );
  }

  if (isLoading || !automation) {
    return (
      <div className="flex h-full flex-col">
        <div className="h-14 shrink-0 border-b border-border" />
        <div className="min-h-0 flex-1 bg-[radial-gradient(circle,var(--border)_1px,transparent_1px)] [background-size:20px_20px]" />
      </div>
    );
  }

  return (
    <>
      <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
        {/* Workspace toolbar */}
        <header className="shrink-0 border-b border-border bg-card/40 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => router.push("/automations")}
                  aria-label={t("automations.backToList")}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">{t("automations.backToList")}</TooltipContent>
            </Tooltip>

            <div className="flex min-w-0 flex-1 items-center gap-2">
              <h1 className="truncate text-sm font-semibold tracking-tight">{automation.name}</h1>
              <StatusBadge status={automation.status} />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <SaveIndicator status={saveStatus} />
              <button
                onClick={() => setEditDialogOpen(true)}
                className={cn(
                  "rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium shadow-[var(--shadow-inset)]",
                  "transition-[background-color,border-color,box-shadow] duration-150 ease-out",
                  "hover:border-input hover:bg-accent active:scale-[0.98]",
                )}
              >
                {t("automations.edit")}
              </button>
              {editDialogOpen ? (
                <AutomationDialog
                  // Remounted per open: the panel seeds its fields from
                  // `editing` with useState. Without this, a save left the
                  // fields on the values handleSubmit resets them to — an empty
                  // name, trigger "keyword", channel "all" — and the next save
                  // wrote those defaults over the real automation.
                  key={editDialogOpen ? "open" : "closed"}
                  open={editDialogOpen}
                  editing={automation}
                  onUpdate={(_id, updates) => handleUpdateBasics(updates)}
                  onClose={() => setEditDialogOpen(false)}
                />
              ) : null}
              <button
                onClick={handleToggle}
                disabled={steps.length === 0}
                title={steps.length === 0 ? t("automations.needsSteps") : undefined}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-medium",
                  "transition-[background-color,box-shadow,opacity] duration-150 ease-out",
                  steps.length === 0
                    ? "cursor-not-allowed border border-border bg-card text-muted-foreground opacity-40 shadow-[var(--shadow-inset)]"
                    : "bg-primary text-primary-foreground shadow-[var(--shadow-button)] active:scale-[0.98]",
                )}
              >
                {automation.status === "active" ? t("automations.pause") : t("automations.activate")}
              </button>
              <span className="mx-0.5 h-5 w-px bg-border" />
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setDockOpenPersisted(!dockOpen)}
                    aria-label={t("assistant.tab")}
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
                <TooltipContent side="bottom">{t("assistant.tab")}</TooltipContent>
              </Tooltip>
            </div>
          </div>

          {automation.status === "draft" ? (
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-border bg-muted/30 px-4 py-1.5">
              <MicroLabel className="text-muted-foreground">{t("automations.draftLabel")}</MicroLabel>
              <span className="h-3 w-px bg-border" />
              <span className="text-[11px] text-muted-foreground">{t("automations.draftHint")}</span>
            </div>
          ) : null}

          {/* Inside the toolbar rather than over the canvas: a failed autosave
              has to be visible without covering the flow it refers to. */}
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
          <div className="relative min-w-0 flex-1">
            <FlowCanvas
              steps={steps}
              selectedPath={selectedPath}
              onSelect={handleSelect}
              onAddStep={handleAddStep}
              onRemoveStep={handleRemoveStep}
              onMoveNode={handleMoveNode}
              onResetLayout={handleResetLayout}
              onIsolateStep={handleIsolateStep}
              onConnectSteps={handleConnectSteps}
              onUpdateConnection={handleUpdateConnection}
              onAddStepAt={handleAddStepAt}
              onToggleDisabled={handleToggleDisabled}
              onSetConnector={handleSetConnector}
              onRunStep={(path) => setRunTarget(path)}
              heightClassName="h-full"
              containerClassName="h-full rounded-none border-0"
            />
            <p className="pointer-events-none absolute top-4 left-4 hidden max-w-[46%] font-mono text-[10px] leading-relaxed tracking-wide text-muted-foreground xl:block">
              {t("automations.canvasHint")}
            </p>
            {!dockOpen ? (
              <DockReopenButton
                icon={AiElementsIcon}
                label={t("assistant.tab")}
                onClick={() => setDockOpenPersisted(true)}
              />
            ) : null}
          </div>

          {/* The dock stays mounted whether or not it's open. Unmounting it on
              close skipped the exit animation entirely — the open read fine and
              the close was a jump cut. */}
          <>
              <div
                onPointerDown={(e) => {
                  resizeRef.current = { startX: e.clientX, startWidth: dockWidth };
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
                {/* Hairline — brightens on hover/drag, otherwise invisible
                    against the panel seam. */}
                <span
                  className={cn(
                    "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/[0.08]",
                    "transition-[background-color] duration-200 ease-out",
                    isResizing ? "bg-foreground/50" : "group-hover:bg-foreground/30",
                  )}
                />
                {/* Grip — a small pill that grows in from nothing, centered
                    on the seam, so the handle reads as grabbable without
                    sitting there as visual noise at rest. */}
                <span
                  className={cn(
                    "absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center",
                    "h-9 w-[5px] rounded-full bg-foreground/60 shadow-[var(--shadow-soft)]",
                    "origin-center transition-[transform,opacity] duration-200 ease-out",
                    isResizing ? "scale-100" : "scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100",
                  )}
                />
              </div>
              {/* Below lg the dock floats over the canvas instead of squeezing
                  it into a strip. */}
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
              {/* Fixed inner width, so the contents don't reflow while the
                  aside's own width animates shut. */}
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
                      { id: "assistant", label: t("assistant.tab") },
                      {
                        id: "step",
                        label: (
                          <span className="inline-flex items-center gap-1.5">
                            {t("automations.stepTab")}
                            {selectedStep ? <span className="size-1 rounded-full bg-current opacity-50" /> : null}
                          </span>
                        ),
                      },
                    ]}
                  />
                </div>

                {/* Both panes stay mounted: keying this on the active tab would
                    throw away the assistant's conversation every time someone
                    opened a step. */}
                <div className="min-h-0 flex-1">
                  <div className={cn("h-full", dockTab === "assistant" ? "block" : "hidden")}>
                    <FlowAssistant automation={automation} steps={steps} onApplyPlan={handleApplyPlan} />
                  </div>
                  <div className={cn("h-full", dockTab === "step" ? "block" : "hidden")}>
                    {selectedStep && selectedPath ? (
                      <div key={selectedPath.join("/")} className="content-enter h-full">
                        <StepPanel
                          step={selectedStep}
                          onConfigChange={updateSelectedStepConfig}
                          onMove={(dir) => handleMoveStep(selectedPath, dir)}
                          onRemove={() => {
                            handleRemoveStep(selectedPath);
                            setDockTab("assistant");
                          }}
                           onClose={() => {
                             const nodeId = selectedStep.id;
                             setSelectedPath(null);
                             setDockTab("assistant");
                             requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(`[data-node-id="${CSS.escape(nodeId)}"]`)?.focus());
                          }}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
                        <MicroLabel>{t("automations.stepTab")}</MicroLabel>
                        <p className="text-xs leading-relaxed text-muted-foreground">
                          {t("automations.noStepSelected")}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              </aside>
          </>
        </div>
      </div>

      <RunStepDialog
        step={runTarget ? getStepAt(steps, runTarget) : undefined}
        running={runState === "running"}
        onCancel={() => setRunTarget(null)}
        onConfirm={async () => {
          if (!runTarget) return;
          const step = getStepAt(steps, runTarget);
          if (!step) return;
          setRunState("running");
          // The runner lives on the server: it reaches storage and fires real
          // requests, so the canvas asks the route to run a step it can name
          // rather than shipping the step itself over the wire.
          const run = await fetchJson<{ outcome?: StepOutcome }>(
            "/api/automations/run-step",
            t,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id, path: runTarget }),
            },
          );
          const outcome: StepOutcome = run.ok
            ? (run.data.outcome ?? {
                type: step.type,
                status: "failed" as const,
                detail: t("automations.requestFailed"),
              })
            : { type: step.type, status: "failed" as const, detail: uiErrorMessage(t, run.error) };
          setRunState("idle");
          setRunTarget(null);
          cue(outcome.status === "failed" ? "error" : "success");
          setRunResult({ path: runTarget, outcome });
        }}
      />

      {runResult ? (
        <RunOutcomeToast outcome={runResult.outcome} onDismiss={() => setRunResult(null)} />
      ) : null}
    </>
  );
}

/**
 * Steps that leave the app when they run — a message actually goes out, a
 * webhook actually fires. Running one of these from the canvas is not a
 * rehearsal, so the confirm dialog says so out loud.
 */
const OUTWARD_STEPS = new Set<WorkflowStepType>([
  "message",
  "send_audio",
  "send_image",
  "send_video",
  "http_request",
  "notify_whatsapp",
  "notify_team",
  "update_contact",
  "log_sheet",
  "send_payment_link",
]);

function RunStepDialog({
  step,
  running,
  onCancel,
  onConfirm,
}: {
  readonly step: WorkflowStep | undefined;
  readonly running: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const t = useT();
  return (
    <Dialog open={!!step} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={ZapIcon} size={18} strokeWidth={1.75} />}>
            {t("automations.runStepConfirm")}
          </DialogTitle>
          <DialogDescription>
            {step ? t(STEP_LABEL_KEYS[step.type]) : ""}
            {step && OUTWARD_STEPS.has(step.type) ? ` — ${t("automations.runStepOutward")}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" type="button">
              {t("automations.runStepCancel")}
            </Button>
          </DialogClose>
          <Button
            type="button"
            disabled={running}
            onClick={onConfirm}
          >
            {running ? (
              <span className="flex items-center gap-2">
                <Orb state="working" />
                {t("automations.runStepRunning")}
              </span>
            ) : (
              t("automations.runStepGo")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** What one step actually did, reported verbatim from the runner. */
function RunOutcomeToast({
  outcome,
  onDismiss,
}: {
  readonly outcome: StepOutcome;
  readonly onDismiss: () => void;
}) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 6000);
    return () => clearTimeout(timer);
  }, [onDismiss]);
  return (
    <div className="pointer-events-auto fixed bottom-6 left-1/2 z-50 max-w-sm -translate-x-1/2">
      <button
        type="button"
        onClick={onDismiss}
        className="flex w-full items-start gap-2.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-left shadow-[var(--shadow-float)]"
      >
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            outcome.status === "done"
              ? "bg-emerald-500"
              : outcome.status === "failed"
                ? "bg-destructive"
                : "bg-muted-foreground/50",
          )}
        />
        <span className="min-w-0">
          <span className="block font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            {outcome.status}
          </span>
          {outcome.detail ? (
            <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{outcome.detail}</span>
          ) : null}
        </span>
      </button>
    </div>
  );
}

function MicroLabel({ children, className }: { readonly children: ReactNode; readonly className?: string }) {
  return (
    <span className={cn("font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase", className)}>
      {children}
    </span>
  );
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
