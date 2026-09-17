"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Add01Icon,
  AiImagineIcon,
  ArrowDown01Icon,
  BubbleChatIcon,
  Call02Icon,
  Delete01Icon,
  Globe02Icon,
  InstagramIcon,
  PauseIcon,
  PencilEdit01Icon,
  PlayIcon,
  SearchIcon,
  WhatsappIcon,
} from "@hugeicons/core-free-icons";
import { Card, CardDescription, CardHeader, CardTitle } from "@/app/_components/dashboard-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { CategoryBadge } from "@/components/ui/category-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CAPABILITY_HUES, toCapabilityIds, type CapabilityId } from "@/lib/agent-capabilities";
import { getAgentTemplate } from "@/lib/agent-templates";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { AppChrome } from "./screen-chrome";

/**
 * The agents page, as `app/(app)/agents/page.tsx` renders it today.
 *
 * It used to be a stack of full-width rows that expanded into a system prompt
 * and a list of raw tool names — which was an accurate drawing of the page
 * right up until the page changed. The inline editor moved to the workspace at
 * `/agents/[id]`, and what is left in the list is a two-column grid of cards:
 * who the agent is, what it is allowed to do in words a business owner uses,
 * and the four things you do to it. This screen is that page.
 *
 * Above the grid is the routing card, and it is here for the same reason it is
 * there: "an agent for every job" is a claim about a list until something says
 * which one picks up WhatsApp.
 */

// ── Data ────────────────────────────────────────────────────────────

type MockAgent = {
  /** `CapabilityId`, so the chips read out of the app's own dictionary rather
   *  than printing tool slugs the picker has not shown since it was written.
   *  Read through `toCapabilityIds` at render, like the real card reads
   *  `agent.tools`, so unknown entries drop instead of printing. */
  readonly capabilities: readonly CapabilityId[];
  readonly descriptionKey: string;
  readonly iconKey?: string;
  readonly id: string;
  readonly name?: string;
  readonly nameKey?: string;
  readonly status: "active" | "paused" | "draft";
};

const AGENTS: readonly MockAgent[] = [
  {
    capabilities: ["knowledge", "contacts", "reminders", "handoff"],
    descriptionKey: "landing.demo.agents.senkaDescription",
    iconKey: "receptionist",
    id: "senka",
    name: "senka",
    status: "active",
  },
  {
    capabilities: ["deals", "calendar", "contacts"],
    descriptionKey: "landing.demo.agents.ventasDescription",
    iconKey: "salesFollowUp",
    id: "ventas",
    nameKey: "landing.demo.agents.ventasName",
    status: "active",
  },
  {
    capabilities: ["knowledge", "media", "shopify"],
    descriptionKey: "landing.demo.agents.catalogoDescription",
    iconKey: "onboarding",
    id: "catalogo",
    nameKey: "landing.demo.agents.catalogoName",
    status: "active",
  },
  {
    capabilities: ["contacts", "payments", "handoff"],
    descriptionKey: "landing.demo.agents.postventaDescription",
    iconKey: "support",
    id: "postventa",
    nameKey: "landing.demo.agents.postventaName",
    status: "paused",
  },
  {
    capabilities: ["automations", "reminders"],
    descriptionKey: "landing.demo.agents.campanasDescription",
    iconKey: "leadQualifier",
    id: "campanas",
    nameKey: "landing.demo.agents.campanasName",
    status: "draft",
  },
];

/** Who answers where. The three channels the real card lists, with the two
 *  that are connected everywhere else on this page — the dashboard's split and
 *  the inbox both show WhatsApp and Instagram — assigned, and the web widget
 *  left unassigned so the state the card exists to name is on screen. */
const ROUTING: readonly {
  readonly agent: string;
  readonly icon: Parameters<typeof HugeiconsIcon>[0]["icon"];
  readonly id: string;
  readonly label: string;
}[] = [
  { agent: "senka", icon: WhatsappIcon, id: "whatsapp", label: "WhatsApp" },
  { agent: "Ventas", icon: InstagramIcon, id: "instagram", label: "Instagram" },
  { agent: "", icon: Globe02Icon, id: "web", label: "Web" },
];

// ── Screen ──────────────────────────────────────────────────────────

export function AgentsScreen() {
  const t = useT();

  return (
    <AppChrome
      active="/agents"
      title={t("agents.title")}
      subtitle={t("agents.subtitle")}
      actions={
        <span className="flex items-center gap-2">
          {/* `ProviderStatusBadge`'s own output: the status word, then the
              balance, in one pill. Static here — the demo has no catalogue to
              read — but the pill is the same component the real header renders. */}
          <StatusBadge
            status="connected"
            label={`${t("models.status.ok")} · ${t("models.balance", { amount: "18.40" })}`}
          />
          <button
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)] transition duration-150 hover:border-input hover:bg-accent"
            type="button"
          >
            <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
            <span className="hidden sm:inline">{t("agents.new")}</span>
          </button>
        </span>
      }
    >
      <div className="relative mb-4">
        <HugeiconsIcon
          icon={SearchIcon}
          size={16}
          strokeWidth={1.75}
          className="-translate-y-1/2 absolute top-1/2 left-3 text-muted-foreground"
        />
        <Input placeholder={t("agents.search")} className="pl-9" readOnly />
      </div>

      {/* `ChannelRouting`, statically. The real card reads its assignments from
          /api/channels/agents and opens a command palette on each row; this is
          the same card with the fetch and the dialog taken out. */}
      <Card className="mb-6">
        <CardHeader className="flex-col gap-1">
          <CardTitle>{t("agents.routingTitle")}</CardTitle>
          <CardDescription>{t("agents.routingDesc")}</CardDescription>
        </CardHeader>
        <div className="grid gap-2 p-5 pt-0 sm:grid-cols-2">
          {ROUTING.map((row) => (
            <button
              className={cn(
                "border-border bg-card flex items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors",
                "hover:border-input hover:bg-accent/40",
              )}
              key={row.id}
              type="button"
            >
              <HugeiconsIcon
                className="shrink-0 text-muted-foreground"
                icon={row.icon}
                size={16}
                strokeWidth={1.75}
              />
              <span className="w-20 shrink-0 font-medium text-[13px]">{row.label}</span>
              {/* The real row has a third state this static copy cannot
                  produce: assigned to an agent that no longer exists, which
                  renders amber (`text-amber-600 dark:text-amber-500`) via
                  `agents.routingMissing` instead of muted. Static names are
                  either found or empty, so here it is assigned or muted. */}
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-[13px]",
                  row.agent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {row.agent || t("agents.routingNone")}
              </span>
              <HugeiconsIcon
                className="shrink-0 text-muted-foreground"
                icon={ArrowDown01Icon}
                size={14}
                strokeWidth={1.75}
              />
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2">
        {AGENTS.map((agent) => (
          <AgentCard agent={agent} key={agent.id} />
        ))}
      </div>

      {/* The real page renders `AgentTemplates` under this grid. Deliberately
          omitted here: hiring a template is an interactive flow — POST
          /api/agents, confetti, `router.push` into the new workspace — and a
          static copy would promise a button the demo cannot honour. The grid
          above is the product claim this screen exists to make; the template
          catalogue is a picker, not a picture. */}
    </AppChrome>
  );
}

/** One agent: who it is, what it can do, and the four things you do to it. */
function AgentCard({ agent }: { readonly agent: MockAgent }) {
  const t = useT();
  const isActive = agent.status === "active";
  const capabilities = toCapabilityIds(agent.capabilities);
  const template = getAgentTemplate(agent.iconKey);

  return (
    <Card className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col gap-3 overflow-hidden rounded-[14px] border border-border/50 bg-card p-5 shadow-xs">
          <div className="flex items-start gap-3">
            <div
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
                template?.accent ??
                  (isActive ? "bg-muted text-foreground" : "bg-muted/50 text-muted-foreground"),
              )}
            >
              <HugeiconsIcon icon={template?.icon ?? AiImagineIcon} size={20} strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                {/* `min-w-0 flex-1` and a `shrink-0` pill: at card width a
                    truncating name resolves its own min-width to 0 and gives
                    every pixel to the badge beside it. */}
                <span className="min-w-0 flex-1 truncate font-medium text-sm">
                  {agent.name ?? t(agent.nameKey ?? "")}
                </span>
                <StatusBadge className="shrink-0" status={agent.status} />
              </div>
              <p className="mt-0.5 line-clamp-2 text-muted-foreground text-xs leading-relaxed">
                {t(agent.descriptionKey)}
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
            <IconAction
              label={t("agents.callAction")}
              href={`/agents/${agent.id}/voice`}
              icon={Call02Icon}
            />
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  aria-label={isActive ? t("agents.deactivate") : t("agents.activate")}
                  size="icon-sm"
                  variant="ghost"
                >
                  <HugeiconsIcon
                    icon={isActive ? PauseIcon : PlayIcon}
                    size={14}
                    strokeWidth={1.75}
                  />
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
