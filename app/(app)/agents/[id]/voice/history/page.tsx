"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Skeleton } from "@/components/ai-elements/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/lib/i18n/provider";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import type { Agent } from "@/lib/types";
import { PageContainer } from "../../../../../_components/page-container";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../../../_components/dashboard-card";
import { SavedCalls } from "../_components/saved-calls";

// Every call this agent handled, on a page of its own.
//
// It used to be the third card in the voice page's config column, where a
// transcript is read four lines at a time through a 440px slot. The calls are
// the record of what the agent actually did — the thing you open to find out
// why someone hung up — so they get the width, and the voice page keeps a
// link where the list used to be.

export default function AgentCallHistoryPage() {
  const params = useParams<{ id: string }>();
  const agentId = params?.id;
  const t = useT();
  const router = useRouter();

  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ agents?: Agent[] }>("/api/agents", t);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    setAgent(result.data.agents?.find((a) => a.id === agentId) ?? null);
    setLoading(false);
  }, [agentId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <PageContainer maxWidth="max-w-4xl">
        <Skeleton
          isLoading
          skeleton={
            <div className="flex flex-col gap-6">
              <div className="bg-muted h-9 w-56 rounded-lg" />
              <div className="bg-muted h-[420px] rounded-xl" />
            </div>
          }
        >
          <div />
        </Skeleton>
      </PageContainer>
    );
  }

  if (!agent) {
    return (
      <PageContainer maxWidth="max-w-4xl">
        {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}
        <Card>
          <CardHeader>
            <CardTitle>{t("voice.notFound")}</CardTitle>
            <CardDescription>{t("voice.notFoundDesc")}</CardDescription>
          </CardHeader>
          <div className="p-5 pt-0">
            <Button asChild variant="outline">
              <Link href="/agents">{t("voice.backToAgents")}</Link>
            </Button>
          </div>
        </Card>
      </PageContainer>
    );
  }

  return (
    <div className="content-enter flex h-full min-h-0 flex-col overflow-hidden">
      {/* Same toolbar as the voice page it came from, so the back arrow lands
          where the eye already expects it. */}
      <header className="border-border bg-card/40 shrink-0 border-b backdrop-blur-sm">
        <div className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => router.push(`/agents/${agent.id}/voice`)}
                aria-label={t("voice.backToVoice")}
                className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors"
              >
                <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{t("voice.backToVoice")}</TooltipContent>
          </Tooltip>

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <h1 className="truncate text-sm font-semibold tracking-tight">{agent.name}</h1>
          </div>

          <span className="text-muted-foreground hidden shrink-0 text-xs sm:block">
            {t("voice.savedCallsTitle")}
          </span>
        </div>

        {error ? (
          <ErrorBanner
            className="rounded-none border-x-0 border-t shadow-none"
            error={error}
            onDismiss={() => setError(null)}
          />
        ) : null}
      </header>

      <SavedCalls agent={agent} />
    </div>
  );
}
