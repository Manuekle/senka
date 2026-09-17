"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AiImagineIcon,
  Add01Icon,
  SearchIcon,
  Delete01Icon,
  PencilEdit01Icon,
  PauseIcon,
  PlayIcon,
  BubbleChatIcon,
  Call02Icon,
} from "@hugeicons/core-free-icons";
import { ProviderStatusBadge, useModelCatalog } from "@/components/ai-elements/model-picker";
import { AgentTemplates } from "./_components/agent-templates";
import { ChannelRouting } from "./_components/channel-routing";
import { AgentCreateDialog, type NewAgentInput } from "./_components/agent-create-dialog";
import { seedKey } from "./_components/agent-assistant";
import { PageContainer } from "../../_components/page-container";
import { Card } from "../../_components/dashboard-card";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import { useT } from "@/lib/i18n/provider";
import { useToast } from "@/components/toast-provider";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useCelebrate } from "@/components/use-celebrate";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/types";
import { CAPABILITY_HUES, toCapabilityIds } from "@/lib/agent-capabilities";
import { getAgentTemplate } from "@/lib/agent-templates";

// The team, as a list of who you have hired.
//
// It used to be the whole product: an accordion create form, an inline editor
// per row, and a wall of fields either way. All of that now lives in the
// workspace at /agents/[id] — the same move the automations made when the flow
// canvas got its own page — and what is left here is the three things a list
// is for: see who exists, decide who answers what, and open one.
//
// Creating is two fields and a redirect. An agent lands as a draft, and the
// workspace is where it becomes something worth turning on.

/** Skeleton for the Agents page — header + search, routing bar, then rows. */
function AgentsSkeleton() {
  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBar className="h-7 w-28" />
          <SkeletonBar className="h-4 w-56" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonBar className="h-6 w-24 rounded-full" />
          <SkeletonBar className="h-9 w-9 rounded-lg sm:w-28" />
        </div>
      </header>
      <SkeletonBar className="h-9 w-full rounded-lg" />
      <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <SkeletonBar className="mb-3 h-3.5 w-40" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonBar key={i} className="h-7 w-28 rounded-full" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <SkeletonBar className="size-10 rounded-xl" />
            <SkeletonBar className="h-4 w-32" />
            <SkeletonBar className="h-3 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AgentsPage() {
  const t = useT();
  const router = useRouter();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const celebrate = useCelebrate();
  // Only models the configured provider actually serves can be assigned; the
  // badge is here so a broken provider is visible before anyone builds on it.
  const { data: catalog } = useModelCatalog();

  const [agents, setAgents] = useState<Agent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ agents?: Agent[] }>("/api/agents", t);
    if (result.ok) {
      setAgents(result.data.agents ?? []);
      setError(null);
      return true;
    }
    setError(result.error);
    return false;
  }, [t]);

  useEffect(() => {
    void load().finally(() => setIsLoading(false));
  }, [load]);

  const filtered = useMemo(() => {
    if (!search.trim()) return agents;
    const query = search.toLowerCase();
    return agents.filter(
      (agent) =>
        agent.name.toLowerCase().includes(query) ||
        agent.description.toLowerCase().includes(query) ||
        agent.tools.some((tool) => tool.toLowerCase().includes(query)),
    );
  }, [agents, search]);

  // Lowercased so a template counts as hired however the name was cased.
  const hiredNames = useMemo(
    () => new Set(agents.map((agent) => agent.name.trim().toLowerCase())),
    [agents],
  );

  /** Create the draft and go straight to its workspace. The sentence from the
   *  dialog rides along in sessionStorage and opens the interview there. */
  const create = async (input: NewAgentInput) => {
    setCreating(true);
    const result = await fetchJson<{ agent?: Agent }>("/api/agents", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        description: input.goal,
        tools: input.tools,
        status: "draft",
        model: null,
      }),
    });
    setCreating(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const created = result.data.agent;
    if (!created) {
      void load();
      setCreateOpen(false);
      return;
    }
    if (input.goal.trim()) {
      try {
        sessionStorage.setItem(seedKey(created.id), input.goal.trim());
      } catch {
        // Private mode — the workspace just opens with an empty interview.
      }
    }
    setCreateOpen(false);
    router.push(`/agents/${created.id}`);
  };

  const toggleStatus = async (agent: Agent, from: HTMLElement | null) => {
    const result = await fetchJson<{ agent?: Agent }>("/api/agents", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: agent.id, toggleStatus: true }),
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
    if (result.data.agent?.status === "active") celebrate(from ? { from } : undefined);
  };

  const remove = async (agent: Agent) => {
    if (!(await confirm({ title: t("agents.deleteConfirm"), description: agent.name }))) return;
    const result = await fetchJson(`/api/agents?agentId=${encodeURIComponent(agent.id)}`, t, {
      method: "DELETE",
    });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await load();
    toast({
      title: t("common.deleted"),
      description: t("common.deletedDescription"),
      status: "success",
    });
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <Skeleton className="min-h-[400px]" isLoading={isLoading} skeleton={<AgentsSkeleton />}>
        <div className="content-enter">
          <ErrorBanner
            className="mb-6"
            error={error}
            onRetry={() => void load()}
            onDismiss={() => setError(null)}
          />

          <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("agents.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("agents.subtitle")}</p>
            </div>
            <span className="flex items-center gap-2 self-start sm:self-auto">
              <ProviderStatusBadge data={catalog} />
              <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogTrigger asChild>
                  <button className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent">
                    <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
                    {t("agents.new")}
                  </button>
                </DialogTrigger>
                <AgentCreateDialog creating={creating} onCreate={(input) => void create(input)} />
              </Dialog>
            </span>
          </header>

          {agents.length > 0 ? (
            <div className="relative mb-4">
              <HugeiconsIcon
                icon={SearchIcon}
                size={16}
                strokeWidth={1.75}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("agents.search")}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("agents.search")}
                className="pl-9"
              />
            </div>
          ) : null}

          {/* Which agent answers what. Above the list because it is the
              decision that gives every agent's capability list its meaning. */}
          {agents.length > 0 ? (
            <div className="mb-6">
              <ChannelRouting agents={agents} onSaved={() => void load()} />
            </div>
          ) : null}

          {filtered.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-3 px-5 py-16 text-center">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                  <HugeiconsIcon icon={AiImagineIcon} size={20} strokeWidth={1.75} />
                </div>
                <p className="text-sm font-medium">{t("agents.empty")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("agents.emptyHint")}</p>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {filtered.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  onToggle={(from) => void toggleStatus(agent, from)}
                  onDelete={() => void remove(agent)}
                />
              ))}
            </div>
          )}

          <AgentTemplates
            hiredNames={hiredNames}
            onError={setError}
            onCustom={() => setCreateOpen(true)}
            onHired={(name, agentId) => {
              // The first agent is the moment the product starts working for
              // you. The fourth is staffing, and staffing does not need
              // confetti — after this the toast carries it alone.
              celebrate({ once: "agent-hired" });
              toast({
                title: t("agents.templatesHiredToast", { name }),
                description: t("agents.templatesHiredToastDesc"),
                status: "success",
              });
              // Straight into the workspace: a hired template is a starting
              // point for this business, and the next thing anybody wants is
              // to make it theirs.
              router.push(`/agents/${agentId}`);
            }}
          />
        </div>
      </Skeleton>
      {confirmDialog}
    </PageContainer>
  );
}

/** One agent: who it is, what it can do, and the four things you do to it. */
function AgentCard({
  agent,
  onToggle,
  onDelete,
}: {
  readonly agent: Agent;
  readonly onToggle: (from: HTMLElement | null) => void;
  readonly onDelete: () => void;
}) {
  const t = useT();
  const isActive = agent.status === "active";
  const capabilities = toCapabilityIds(agent.tools);
  const template = getAgentTemplate(agent.iconKey);

  return (
    <Card className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-[14px] border border-border/50 bg-card p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
                template?.accent ?? (isActive ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"),
              )}
            >
              <HugeiconsIcon icon={template?.icon ?? AiImagineIcon} size={20} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <Link href={`/agents/${agent.id}`} className="min-w-0 truncate text-sm font-medium hover:underline">
                  {agent.name}
                </Link>
                <StatusBadge
                  status={isActive ? "active" : agent.status === "draft" ? "draft" : "paused"}
                />
              </div>
              <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                {agent.description || t("agents.emptyHint")}
              </p>
            </div>
          </div>

          {capabilities.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {capabilities.slice(0, 5).map((id) => (
                <CategoryBadge key={id} hue={CAPABILITY_HUES[id]} className="text-[10px]">
                  {t(`capability.${id}`)}
                </CategoryBadge>
              ))}
              {capabilities.length > 5 ? (
                <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  +{capabilities.length - 5}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-1 px-2 pt-2 pb-0.5">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/agents/${agent.id}`}>
              <HugeiconsIcon icon={PencilEdit01Icon} size={14} strokeWidth={1.75} />
              {t("builder.open")}
            </Link>
          </Button>
          <span className="ml-auto flex items-center gap-0.5">
            <IconAction
              label={t("agents.chatAction")}
              href={`/agents/${agent.id}/chat`}
              icon={BubbleChatIcon}
            />
            <IconAction label={t("agents.callAction")} href={`/agents/${agent.id}/voice`} icon={Call02Icon} />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={isActive ? t("agents.deactivate") : t("agents.activate")}
                  size="icon-sm"
                  variant="ghost"
                  onClick={(event) => onToggle(event.currentTarget)}
                >
                  <HugeiconsIcon icon={isActive ? PauseIcon : PlayIcon} size={14} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isActive ? t("agents.deactivate") : t("agents.activate")}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={t("agents.delete")}
                  size="icon-sm"
                  variant="ghost"
                  className="hover:bg-destructive/10 hover:text-destructive focus-visible:text-destructive"
                  onClick={onDelete}
                >
                  <HugeiconsIcon icon={Delete01Icon} size={14} strokeWidth={1.75} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("agents.delete")}</TooltipContent>
            </Tooltip>
          </span>
        </div>
      </div>
    </Card>
  );
}

function IconAction({
  label,
  href,
  icon,
}: {
  readonly label: string;
  readonly href: string;
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button asChild aria-label={label} size="icon-sm" variant="ghost">
          <Link href={href}>
            <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} />
          </Link>
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
