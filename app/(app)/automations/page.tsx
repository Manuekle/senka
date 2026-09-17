"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  ZapIcon,
  Add01Icon,
  PlayIcon,
  PauseIcon,
  Delete01Icon,
  CopyIcon,
  Clock01Icon,
  MessageCircleIcon,
  Calendar03Icon,
  HashIcon,
  AlertCircleIcon,
  WebhookIcon,
  GitBranchIcon,
  PencilEdit01Icon,
} from "@hugeicons/core-free-icons";
import { PageContainer } from "../../_components/page-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "../../_components/dashboard-card";
import { KpiBars, KpiCard } from "../../_components/kpi-card";
import { CardCarousel } from "../../_components/card-carousel";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton, AutomationsSkeleton } from "@/components/ai-elements/skeleton";
import { AutomationDialog } from "@/components/ai-elements/automation-dialog";
import { ChannelBadge, StatusBadge } from "../../_components/channel-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import { useT } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { STEP_HUES, STEP_ICONS, STEP_LABEL_KEYS } from "@/lib/workflow-step-meta";
import { useCelebrate } from "@/components/use-celebrate";
import type { Automation, AutomationTrigger } from "@/lib/types";

const TRIGGER_ICONS: Record<AutomationTrigger, IconSvgElement> = {
  keyword: HashIcon,
  schedule: Calendar03Icon,
  new_chat: MessageCircleIcon,
  no_reply: AlertCircleIcon,
  webhook: WebhookIcon,
};

const TRIGGER_LABELS: Record<AutomationTrigger, string> = {
  keyword: "automations.triggerKeyword",
  schedule: "automations.triggerSchedule",
  new_chat: "automations.triggerNewChat",
  no_reply: "automations.triggerNoReply",
  webhook: "automations.triggerWebhook",
};

export default function AutomationsPage() {
  const t = useT();
  const { cue } = useSound();
  const celebrate = useCelebrate();
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<Automation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  type ListResponse = { readonly automations?: Automation[] };

  const load = useCallback(async () => {
    const result = await fetchJson<ListResponse>("/api/automations", t);
    if (result.ok) {
      setAutomations(result.data.automations ?? []);
      setError(null);
    } else {
      setError(result.error);
    }
    setIsLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Every mutation answers with the whole list. Applying it only on success is
   * the point: a failed call used to be parsed the same way as a good one, so
   * `automations: undefined` emptied the page and made a rejected toggle look
   * like every automation had been deleted.
   */
  const mutate = useCallback(
    async (init: RequestInit & { url?: string }): Promise<Automation[] | null> => {
      const { url = "/api/automations", ...rest } = init;
      const result = await fetchJson<ListResponse>(url, t, rest);
      if (!result.ok) {
        setError(result.error);
        return null;
      }
      setError(null);
      const list = result.data.automations ?? [];
      setAutomations(list);
      return list;
    },
    [t],
  );

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  const handleToggle = (id: string) => {
    const current = automations.find((a) => a.id === id);
    const status = current?.status === "active" ? "paused" : "active";
    cue("toggle");
    void mutate(jsonInit("PUT", { id, status })).then((list) => {
      // Same rule as the flow page: the burst is for going live, and only
      // for going live. No `once` key — an automation going live is a win
      // every time it happens, not a first-run novelty.
      if (list && status === "active") celebrate();
    });
  };
  const handleDelete = async (id: string) => {
    if (!(await confirm({ title: t("automations.confirmDelete") }))) return;
    // `droplet` glides down and away — a deletion is a dismissal, not a win.
    cue("droplet");
    const list = await mutate({ url: `/api/automations?id=${encodeURIComponent(id)}`, method: "DELETE" });
    if (list) toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
  };
  const handleDuplicate = (auto: Automation) => {
    void mutate(
      jsonInit("POST", {
        name: `${auto.name} (copia)`,
        description: auto.description,
        trigger: auto.trigger,
        triggerValue: auto.triggerValue,
        channel: auto.channel,
        steps: auto.steps ?? [],
      }),
      // The copy is confirmed once it exists, not once it was asked for — the
      // cue used to fire ahead of the POST and sounded the same when it failed.
    ).then((list) => {
      if (list) cue("success");
    });
  };
  // Creating only captures the basics — the workflow itself is built on its
  // own page (app/automations/[id]/page.tsx), not in this dialog.
  const handleCreate = (data: Omit<Automation, "id" | "status" | "responseCount" | "createdAt" | "steps">) => {
    void mutate(jsonInit("POST", data)).then((list) => {
      const created = list?.[0];
      if (created) router.push(`/automations/${created.id}`);
    });
  };
  const handleEdit = (auto: Automation) => {
    setEditingAutomation(auto);
    setDialogOpen(true);
  };
  const handleUpdate = (id: string, updates: Partial<Omit<Automation, "id" | "steps">>) => {
    void mutate(jsonInit("PUT", { id, ...updates }));
  };

  const counts = {
    active: automations.filter((a) => a.status === "active").length,
    paused: automations.filter((a) => a.status === "paused").length,
    draft: automations.filter((a) => a.status === "draft").length,
  };

  /** One status's share of every automation, for the meter on its tile. */
  const share = (count: number) => (automations.length > 0 ? count / automations.length : 0);

  const sorted = [...automations].sort((a, b) => {
    const order = { active: 0, paused: 1, draft: 2 };
    if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status];
    return b.responseCount - a.responseCount;
  });

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
        {confirmDialog}
        <Skeleton
          className="min-h-[500px]"
          isLoading={isLoading}
          skeleton={<AutomationsSkeleton />}
        >
        <div className="content-enter">
        <ErrorBanner
          className="mb-6"
          error={error}
          onRetry={() => void load()}
          onDismiss={() => setError(null)}
        />
        {/* Header */}
        <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{t("automations.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("automations.subtitle")}
            </p>
          </div>
          <button
            className="inline-flex items-center gap-2 self-start rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent sm:self-auto"
            onClick={() => {
              setEditingAutomation(null);
              setDialogOpen(true);
            }}
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
            {t("automations.new")}
          </button>
          {dialogOpen ? (
            <AutomationDialog
              key={editingAutomation?.id ?? "new"}
              open={dialogOpen}
              editing={editingAutomation}
              onCreate={handleCreate}
              onUpdate={handleUpdate}
              onClose={() => {
                setDialogOpen(false);
                setEditingAutomation(null);
              }}
            />
          ) : null}
        </header>

        {/* Stats bar */}
        {/* The three counts on their own only name a status. The second line
            says what the status does — a draft never runs, a paused one has
            stopped — which is the question the number actually raises. */}
        {/* The meter under each count is that status's share of the whole
            set, which is the comparison the three numbers are really asking
            for — nine drafts means something different next to two
            automations than next to ninety. */}
        <CardCarousel label="Estadísticas de automatizaciones">
          <div className="mb-6 flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
            <div className="min-w-[220px] flex-1">
              <KpiCard
                icon={PlayIcon}
                label={t("automations.active")}
                sub={t(counts.active > 0 ? "automations.activeSub" : "automations.activeSubNone")}
                value={counts.active}
                visual={<KpiBars ratio={share(counts.active)} tone="positive" />}
              />
            </div>
            <div className="min-w-[220px] flex-1">
              <KpiCard
                icon={PauseIcon}
                label={t("automations.paused")}
                sub={t(counts.paused > 0 ? "automations.pausedSub" : "automations.pausedSubNone")}
                value={counts.paused}
                visual={<KpiBars ratio={share(counts.paused)} tone="warning" />}
              />
            </div>
            <div className="min-w-[220px] flex-1">
              <KpiCard
                icon={AlertCircleIcon}
                label={t("automations.drafts")}
                sub={t(counts.draft > 0 ? "automations.draftsSub" : "automations.draftsSubNone")}
                value={counts.draft}
                visual={<KpiBars ratio={share(counts.draft)} />}
              />
            </div>
          </div>
        </CardCarousel>

        {/* Automation list */}
        <div className="space-y-3">
          {sorted.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={ZapIcon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("automations.noResults")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("automations.noResultsHint")}</p>
              </div>
            </Card>
          ) : (
            sorted.map((auto) => {
            const TriggerIcon = TRIGGER_ICONS[auto.trigger];
            return (
              <Card key={auto.id} className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                <div className="flex flex-col">
                  <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                    <CardHeader>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => router.push(`/automations/${auto.id}`)}
                            aria-label={t("automations.openFlow")}
                            className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)] transition-colors hover:text-foreground"
                          >
                            <HugeiconsIcon icon={TriggerIcon} size={16} strokeWidth={1.75} />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">{t(TRIGGER_LABELS[auto.trigger])}</TooltipContent>
                      </Tooltip>
                      <button
                        onClick={() => router.push(`/automations/${auto.id}`)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="flex items-center gap-2">
                          <CardTitle>{auto.name}</CardTitle>
                          <StatusBadge status={auto.status} />
                        </div>
                        <CardDescription>{auto.description}</CardDescription>
                      </button>
                    </CardHeader>

                    <CardSeparator />

                    {/* Trigger info */}
                    <div className="flex flex-wrap items-center gap-4 px-5 py-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon icon={ZapIcon} size={14} strokeWidth={1.75} />
                        {t(TRIGGER_LABELS[auto.trigger])}
                        {auto.triggerValue ? (
                          <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs shadow-[var(--shadow-inset)]">
                            {auto.triggerValue}
                          </code>
                        ) : null}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <HugeiconsIcon icon={Clock01Icon} size={14} strokeWidth={1.75} />
                        {auto.responseCount} {t("automations.responses")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        {auto.lastTriggeredAt
                          ? t("automations.lastTrigger", { time: relativeTime(auto.lastTriggeredAt) })
                          : t("automations.neverTriggered")}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        {t("automations.channel")}:
                        {auto.channel === "all" ? (
                          <span className="font-medium">{t("automations.allChannels")}</span>
                        ) : (
                          <ChannelBadge channel={auto.channel} />
                        )}
                      </span>
                    </div>

                    {/* Workflow steps preview */}
                    {auto.steps && auto.steps.length > 0 ? (
                      <CardSeparator />
                    ) : null}
                    {auto.steps && auto.steps.length > 0 ? (
                      <div className="px-5 py-3">
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={1.75} />
                          <span className="font-medium">{t("automations.workflow")}</span>
                          <div className="flex flex-wrap items-center gap-1">
                            {auto.steps.map((step, i) => {
                              const StepIcon = STEP_ICONS[step.type];
                              return (
                                <span key={step.id} className="inline-flex items-center gap-1">
                                  {i > 0 ? (
                                    <span className="text-muted-foreground">→</span>
                                  ) : null}
                                   <CategoryBadge hue={STEP_HUES[step.type]}>
                                     <HugeiconsIcon icon={StepIcon} size={12} strokeWidth={1.75} aria-hidden="true" />
                                     {t(STEP_LABEL_KEYS[step.type])}
                                   </CategoryBadge>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {/* Action bar — below inner border, no separator */}
                  <div className="flex items-center justify-end gap-1 px-2 pt-2 pb-0.5">
                    <RowAction
                      icon={GitBranchIcon}
                      label={t("automations.openFlow")}
                      onClick={() => router.push(`/automations/${auto.id}`)}
                    />
                    <RowAction
                      icon={PencilEdit01Icon}
                      label={t("automations.edit")}
                      onClick={() => handleEdit(auto)}
                    />
                    <RowAction
                      icon={auto.status === "active" ? PauseIcon : PlayIcon}
                      label={auto.status === "active" ? t("automations.pause") : t("automations.activate")}
                      disabled={auto.status === "draft"}
                      disabledLabel={t("automations.needsSteps")}
                      onClick={() => handleToggle(auto.id)}
                    />
                    <RowAction
                      icon={CopyIcon}
                      label={t("automations.duplicate")}
                      onClick={() => handleDuplicate(auto)}
                    />
                    <RowAction
                      icon={Delete01Icon}
                      label={t("automations.delete")}
                      destructive
                      onClick={() => void handleDelete(auto.id)}
                    />
                  </div>
                </div>
              </Card>
            );
          })
          )}
        </div>

        {/* Empty state would go here if needed */}
        </div>
        </Skeleton>
    </PageContainer>
  );
}

/** One row action: an icon button that says what it does on hover and on focus. */
function RowAction({
  icon,
  label,
  onClick,
  disabled,
  disabledLabel,
  destructive,
}: {
  readonly icon: IconSvgElement;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  /** Shown instead of `label` when the action is unavailable, so the tooltip
   *  explains the greyed-out button rather than naming an action that won't run. */
  readonly disabledLabel?: string;
  readonly destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A disabled button fires no pointer events, so the tooltip would never
            open. It stays enabled and inert instead, with aria-disabled telling
            assistive tech the truth. */}
        <button
          onClick={disabled ? undefined : onClick}
          aria-disabled={disabled}
          aria-label={disabled ? (disabledLabel ?? label) : label}
          className={cn(
            "flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors",
            disabled
              ? "cursor-not-allowed opacity-30"
              : destructive
                ? "hover:bg-destructive/10 hover:text-destructive"
                : "hover:bg-accent hover:text-foreground",
          )}
        >
          <HugeiconsIcon icon={icon} size={16} strokeWidth={1.75} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{disabled ? (disabledLabel ?? label) : label}</TooltipContent>
    </Tooltip>
  );
}

