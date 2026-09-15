"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";
import type { TeamState } from "@/lib/team-types";
import { cn } from "@/lib/utils";
import { TeamFeed, type FeedAgent } from "./team-feed";

type TeamResponse = {
  team: TeamState;
  workspaceId: string;
  agents: FeedAgent[];
  configured: boolean;
  /** The team follows the active agents on its own. */
  auto: boolean;
};

type Mode = "auto" | "manual";

function TeamSkeleton({ label }: { readonly label: string }) {
  return (
    <div className="space-y-5" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <SkeletonBar className="h-4 w-40" />
        <SkeletonBar className="h-3 w-full max-w-lg" />
        <SkeletonBar className="h-14 w-full rounded-lg" />
        <div className="grid gap-2 sm:grid-cols-3">
          {[0, 1, 2].map((i) => <SkeletonBar key={i} className="h-14 rounded-lg" />)}
        </div>
      </div>
      <SkeletonBar className="h-[28rem] w-full rounded-2xl" />
    </div>
  );
}

export function TeamPanel() {
  const { t } = useI18n();
  const [data, setData] = useState<TeamResponse | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [limit, setLimit] = useState(20);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const update = () => setVisible(document.visibilityState === "visible");
    update(); document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);
  const load = useCallback(async () => {
    const result = await fetchJson<TeamResponse>("/api/team", t);
    if (!result.ok) { setError(result.error); return; }
    setData(result.data); setError(null);
    if (!dirty) { setSelected(result.data.team.agentIds); setLimit(result.data.team.dailyLimit); }
  }, [t, dirty]);
  usePolling(load, 4000, visible && !busy);

  const save = async (next: { enabled: boolean; mode: Mode }) => {
    setBusy(true);
    const result = await fetchJson("/api/team", t, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...next, agentIds: selected, dailyLimit: limit }),
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDirty(false);
    await load();
  };

  if (!data) {
    return (
      <div className="space-y-4">
        <ErrorBanner error={error} onRetry={() => void load()} />
        {!error ? <TeamSkeleton label={t("agentTeam.loading")} /> : null}
      </div>
    );
  }

  const { auto, configured } = data;
  const enabled = data.team.enabled;
  const calls = data.team.day === new Date().toISOString().slice(0, 10) ? data.team.calls : 0;
  const validLimit = Number.isInteger(limit) && limit >= 1 && limit <= 100;

  return (
    <div className="content-enter space-y-5">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="team-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="team-title" className="font-medium">{t("agentTeam.title")}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("agentTeam.description")}</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium">
            <span aria-hidden="true" className={cn("size-1.5 rounded-full transition-colors duration-300", enabled ? "bg-emerald-500" : "bg-muted-foreground/50")} />
            {t(enabled ? "agentTeam.enabled" : "agentTeam.paused")}
          </span>
        </div>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {!configured && <p className="text-sm text-muted-foreground">{t("agentTeam.needsDatabase")}</p>}
        {data.agents.length < 2 && <p className="text-sm text-muted-foreground">{t("agentTeam.needsAgents")} <Link className="underline underline-offset-4" href="/agents">{t("agentTeam.manageAgents")}</Link></p>}

        <div className="flex items-start justify-between gap-4 rounded-lg border border-border bg-muted/30 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">{t("agentTeam.mode.auto")}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{t("agentTeam.mode.autoHint")}</p>
          </div>
          <Switch
            checked={auto}
            label={t("agentTeam.mode.auto")}
            disabled={busy || !configured}
            onCheckedChange={(on) => void save({ mode: on ? "auto" : "manual", enabled })}
          />
        </div>

        <fieldset disabled={busy || !configured || auto} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("agentTeam.participants")}</legend>
          <div className={cn("grid gap-2 transition-opacity duration-200 sm:grid-cols-2 lg:grid-cols-3", auto && "opacity-70")}>
            {data.agents.map((agent) => <label key={agent.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm transition-colors duration-150 has-checked:bg-muted has-disabled:cursor-default">
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={selected.includes(agent.id)} disabled={!selected.includes(agent.id) && selected.length >= 6}
                onChange={(event) => { setDirty(true); setSelected((ids) => event.target.checked ? [...ids, agent.id] : ids.filter((id) => id !== agent.id)); }} />
              <span className="min-w-0"><span className="font-medium">{agent.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{agent.description}</span></span>
            </label>)}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="block">{t("agentTeam.dailyLimit")}</span><Input className="w-28" type="number" min={1} max={100} value={limit} disabled={busy}
            onChange={(event) => { setDirty(true); setLimit(Number(event.target.value)); }} /></label>
          {auto ? (
            <Button disabled={busy || !configured || !validLimit || !dirty} onClick={() => void save({ enabled, mode: "auto" })}>
              {t(busy ? "agentTeam.saving" : "agentTeam.save")}
            </Button>
          ) : (
            <Button disabled={busy || !configured || selected.length < 2 || !validLimit} onClick={() => void save({ enabled: true, mode: "manual" })}>
              {t(busy ? "agentTeam.saving" : enabled ? "agentTeam.save" : "agentTeam.start")}
            </Button>
          )}
          {enabled && <Button variant="outline" disabled={busy} onClick={() => void save({ enabled: false, mode: "manual" })}>{t("agentTeam.pause")}</Button>}
          <span className="py-2 text-xs tabular-nums text-muted-foreground">{t("agentTeam.usage", { used: calls, limit: data.team.dailyLimit })}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("agentTeam.scope")}</p>
        {calls >= data.team.dailyLimit && <p role="status" className="text-sm">{t("agentTeam.budgetReached")}</p>}
        {data.team.droppedEvents > 0 && <p role="status" className="text-sm text-destructive">{t("agentTeam.overflow", { count: data.team.droppedEvents })}</p>}
      </section>

      <section aria-labelledby="team-feed" className="space-y-3">
        <h2 id="team-feed" className="text-sm font-medium">{t("agentTeam.feed")}</h2>
        <TeamFeed team={data.team} agents={data.agents} />
      </section>
    </div>
  );
}
