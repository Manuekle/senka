"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  CheckmarkCircle02Icon,
  GlobalEducationIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Card } from "../../../_components/dashboard-card";
import { CardCarousel } from "../../../_components/card-carousel";
import { AGENT_TEMPLATES, TEMPLATE_BULLETS, type AgentTemplate } from "@/lib/agent-templates";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";

/**
 * The hiring board: every ready-made agent as a card you can put to work in
 * one click, plus a card for the from-scratch path.
 *
 * Hiring is a plain POST to the same endpoint the create form uses — a
 * template is a filled-in form, not a second kind of agent — so a hired agent
 * is editable, pausable and deletable like any other from the moment it
 * lands.
 */
export function AgentTemplates({
  hiredNames,
  onHired,
  onCustom,
  onError,
}: {
  /** Names already on the team, lowercased. Drives the "hired" marker so the
   *  board reflects the list right above it. */
  readonly hiredNames: ReadonlySet<string>;
  /** The workspace is where a hired template becomes this business's agent,
   *  so the id travels with the name — the list opens it. */
  readonly onHired: (name: string, agentId: string) => void;
  readonly onCustom: () => void;
  readonly onError: (error: UiError) => void;
}) {
  const t = useT();
  const [hiringId, setHiringId] = useState<string | null>(null);

  const hire = async (template: AgentTemplate) => {
    setHiringId(template.id);
    const name = t(`agentTemplates.${template.id}.name`);
    const result = await fetchJson<{ agent?: { id: string } }>("/api/agents", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name,
        description: t(`agentTemplates.${template.id}.description`),
        systemPrompt: t(`agentTemplates.${template.id}.prompt`),
        tools: [...template.tools],
        iconKey: template.id,
        model: null,
      }),
    });
    setHiringId(null);
    if (!result.ok) {
      onError(result.error);
      return;
    }
    const id = result.data.agent?.id;
    if (!id) {
      onError({ messageKey: "errors.generation_failed" });
      return;
    }
    onHired(name, id);
  };

  return (
    <section className="mt-10">
      <header className="mb-4">
        <h2 className="text-lg font-semibold">{t("agents.templatesTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("agents.templatesSubtitle")}</p>
      </header>

      {/* Same horizontal rail as the KPI tiles: a board of hireable agents is
          something you browse, and a wall of cards pushed the team list off
          the first screen on every visit. */}
      <CardCarousel label={t("agents.templatesTitle")}>
        <div className="flex items-stretch gap-3 pb-1" style={{ paddingInline: "2px" }}>
        {AGENT_TEMPLATES.map((template) => {
          const name = t(`agentTemplates.${template.id}.name`);
          const isHired = hiredNames.has(name.toLowerCase());
          const isHiring = hiringId === template.id;
          return (
            <Card key={template.id} interactive className="flex w-[min(300px,80vw)] shrink-0 flex-col">
              <div className="flex flex-1 flex-col gap-4 p-5">
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex size-10 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
                      template.accent,
                    )}
                  >
                    <HugeiconsIcon icon={template.icon} size={20} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-sm font-medium">{name}</p>
                      {isHired && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={10} strokeWidth={2} />
                          {t("agents.templatesHired")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`agentTemplates.${template.id}.description`)}
                    </p>
                  </div>
                </div>

                <ul className="flex-1 space-y-1.5">
                  {TEMPLATE_BULLETS.map((n) => (
                    <li key={n} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size={12}
                        strokeWidth={2}
                        className="mt-0.5 shrink-0 text-primary"
                      />
                      <span>{t(`agentTemplates.${template.id}.bullet${n}`)}</span>
                    </li>
                  ))}
                </ul>

                <Button
                  size="sm"
                  variant={isHired ? "outline" : "default"}
                  className="w-full"
                  disabled={isHiring}
                  onClick={() => void hire(template)}
                >
                  {isHiring ? (
                    <>
                      <Spinner size={14} />
                      {t("agents.templatesHiring")}
                    </>
                  ) : (
                    t("agents.templatesHire")
                  )}
                </Button>
              </div>
            </Card>
          );
        })}

        {/* From scratch — same board, so "none of these fits" is one click
            away instead of a hunt for the button at the top of the page. */}
        <Card className="flex w-[min(300px,80vw)] shrink-0 flex-col border-dashed bg-muted/20">
          <div className="flex flex-1 flex-col gap-4 p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={GlobalEducationIcon} size={20} strokeWidth={1.75} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{t("agents.templatesCustomTitle")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("agents.templatesCustomDesc")}
                </p>
              </div>
            </div>
            <div className="flex-1" />
            <Button size="sm" variant="outline" className="w-full" onClick={onCustom}>
              {t("agents.templatesCustomAction")}
            </Button>
          </div>
        </Card>
        </div>
      </CardCarousel>
    </section>
  );
}
