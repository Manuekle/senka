"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { usePolling } from "@/lib/use-polling";
import type { TeamState } from "@/lib/team-types";

type TeamResponse = {
  team: TeamState;
  workspaceId: string;
  agents: { id: string; name: string; description: string }[];
  configured: boolean;
};

export function TeamPanel() {
  const { t, locale } = useI18n();
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

  const save = async (enabled: boolean) => {
    setBusy(true);
    const result = await fetchJson("/api/team", t, {
      method: "PUT", headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled, agentIds: selected, dailyLimit: limit }),
    });
    setBusy(false);
    if (!result.ok) { setError(result.error); return; }
    setDirty(false);
    await load();
  };

  if (!data) return <div className="rounded-xl border border-border bg-card p-5"><ErrorBanner error={error} onRetry={() => void load()} /><p className="text-sm text-muted-foreground">{t("agentTeam.loading")}</p></div>;
  const enabled = data.team.enabled;
  const calls = data.team.day === new Date().toISOString().slice(0, 10) ? data.team.calls : 0;
  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-xl border border-border bg-card p-5" aria-labelledby="team-title">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="team-title" className="font-medium">{t("agentTeam.title")}</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("agentTeam.description")}</p></div>
          <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">{t(enabled ? "agentTeam.enabled" : "agentTeam.paused")}</span>
        </div>
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
        {!data.configured && <p className="text-sm text-muted-foreground">{t("agentTeam.needsDatabase")}</p>}
        {data.agents.length < 2 && <p className="text-sm text-muted-foreground">{t("agentTeam.needsAgents")} <Link className="underline underline-offset-4" href="/agents">{t("agentTeam.manageAgents")}</Link></p>}
        <fieldset disabled={busy || !data.configured} className="space-y-2">
          <legend className="mb-2 text-sm font-medium">{t("agentTeam.participants")}</legend>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.agents.map((agent) => <label key={agent.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm has-checked:bg-muted">
              <input type="checkbox" className="mt-1 size-4 accent-primary" checked={selected.includes(agent.id)} disabled={!selected.includes(agent.id) && selected.length >= 6}
                onChange={(event) => { setDirty(true); setSelected((ids) => event.target.checked ? [...ids, agent.id] : ids.filter((id) => id !== agent.id)); }} />
              <span className="min-w-0"><span className="font-medium">{agent.name}</span><span className="mt-0.5 block text-xs text-muted-foreground">{agent.description}</span></span>
            </label>)}
          </div>
        </fieldset>
        <div className="flex flex-wrap items-end gap-3">
          <label className="space-y-1 text-sm"><span className="block">{t("agentTeam.dailyLimit")}</span><Input className="w-28" type="number" min={1} max={100} value={limit} disabled={busy}
            onChange={(event) => { setDirty(true); setLimit(Number(event.target.value)); }} /></label>
          <Button disabled={busy || !data.configured || selected.length < 2 || !Number.isInteger(limit) || limit < 1 || limit > 100} onClick={() => void save(true)}>{t(busy ? "agentTeam.saving" : enabled ? "agentTeam.save" : "agentTeam.start")}</Button>
          {enabled && <Button variant="outline" disabled={busy} onClick={() => void save(false)}>{t("agentTeam.pause")}</Button>}
          <span className="py-2 text-xs tabular-nums text-muted-foreground">{t("agentTeam.usage", { used: calls, limit: data.team.dailyLimit })}</span>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">{t("agentTeam.scope")}</p>
        {calls >= data.team.dailyLimit && <p role="status" className="text-sm">{t("agentTeam.budgetReached")}</p>}
        {data.team.droppedEvents > 0 && <p role="status" className="text-sm text-destructive">{t("agentTeam.overflow", { count: data.team.droppedEvents })}</p>}
      </section>

      <section aria-labelledby="team-feed" className="space-y-3">
        <h2 id="team-feed" className="text-sm font-medium">{t("agentTeam.feed")}</h2>
        {!data.team.events.length && <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">{t("agentTeam.empty")}</p>}
        <ol className="space-y-4">
          {data.team.events.map((event) => <li key={event.id} className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-3 text-xs">
              <span>{t("agentTeam.changes", { count: event.changes.length })} · <time dateTime={event.at}>{new Date(event.at).toLocaleString(locale)}</time></span>
              <span>{t(`agentTeam.status.${event.status}`)}</span>
            </div>
            <div className="space-y-4 p-4">
              <p className="text-xs text-muted-foreground">{event.changes.map((change) => `${t(`agentTeam.kind.${change.kind}`)}: ${change.id}`).join(" · ")}</p>
              {event.messages.map((message) => <article key={message.id} className="border-l-2 border-border pl-4">
                <h3 className="text-sm font-medium">{message.agentName}</h3>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
              </article>)}
              {event.error && <p role="status" className="text-sm text-destructive">{t(`agentTeam.error.${event.error}`)}</p>}
              {!event.messages.length && !event.error && <p className="text-sm text-muted-foreground">{t("agentTeam.waiting")}</p>}
            </div>
          </li>)}
        </ol>
      </section>
    </div>
  );
}
