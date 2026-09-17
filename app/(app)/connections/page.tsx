"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  Blockchain05Icon,
  AuthorizedIcon,
  CheckmarkCircle02Icon,
  AlertCircleIcon,
  ArrowRight01Icon,
  ExternalLinkIcon,
  Unlink01Icon,
} from "@hugeicons/core-free-icons";
import {
  HubspotBrandIcon,
  SlackBrandIcon,
  TwilioBrandIcon,
  MercadoPagoBrandIcon,
  ShopifyBrandIcon,
  NotionBrandIcon,
  ResendBrandIcon,
  SalesforceBrandIcon,
} from "@/components/icons/connection-icons";
import { AnthropicLogo, ElevenLabsLogo, GeminiLogo, OpenAiLogo, VercelLogo } from "@/components/provider-logo";
import { GoogleMark, StripeMark, MetaMark } from "@/app/landing/_components/brand-marks";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useEnterpriseAllowed } from "@/components/enterprise-gate";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { notifyCredentialsChanged } from "@/lib/credentials-changed";
import { useT } from "@/lib/i18n/provider";
import { useCelebrate } from "@/components/use-celebrate";
import { cn } from "@/lib/utils";
import { PageContainer } from "../../_components/page-container";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../_components/dashboard-card";
import { ManualKeyDialog } from "./_components/manual-key-dialog";
import { McpSection } from "./_components/mcp-section";
import { Spinner } from "@/components/ui/spinner";

// Connections.
//
// One page for the question "what does this install have access to, and who
// said so". The split down the middle is the point: the top half is accounts
// linked by signing in — no key ever leaves the vendor's dashboard — and the
// bottom half is the vendors whose API has no user OAuth at all, named with
// the reason rather than hidden behind a Connect button that would only open
// a form.
//
// What is *not* here: field mapping. Which question fills which HubSpot
// property is a decision per form, so it lives on the form, and this page says
// so instead of growing a second place to configure the same thing.

type ConnectionStatus = "connected" | "disconnected" | "needs_reconnect" | "unavailable";

type OAuthSummary = {
  readonly id: string;
  readonly label: string;
  readonly descriptionKey: string;
  readonly unlockKeys: readonly string[];
  readonly appDocsUrl: string;
  readonly status: ConnectionStatus;
  readonly accountLabel?: string;
  readonly connectedAt?: string;
  /** Names of the two credential keys that register this provider's OAuth app.
   *  Never values — they only tell the dialog which fields to show. */
  readonly oauthAppKeys?: readonly string[];
};

type ManualSummary = {
  readonly id: string;
  readonly label: string;
  readonly descriptionKey: string;
  readonly reasonKey: string;
  readonly settingsGroup: string;
  readonly credentialKeys?: readonly string[];
  readonly configured: boolean;
  /** "env" is configured but not ours to clear — see lib/connection-store. */
  readonly source?: "store" | "env";
  readonly keyPreview?: string;
};

const ICONS: Record<string, IconSvgElement> = {
};

/** The vendors with a real brand mark on hand — everything else falls back
 *  to a generic Hugeicons glyph via `ICONS`. */
const BRAND_ICONS: Record<string, (props: { size: number }) => React.JSX.Element> = {
  google: GoogleMark,
  hubspot: HubspotBrandIcon,
  slack: SlackBrandIcon,
  notion: NotionBrandIcon,
  salesforce: SalesforceBrandIcon,
  stripe: StripeMark,
  mercadopago: MercadoPagoBrandIcon,
  shopify: ShopifyBrandIcon,
  twilio: TwilioBrandIcon,
  resend: ResendBrandIcon,
  elevenlabs: ElevenLabsLogo,
  meta: MetaMark,
  anthropic: AnthropicLogo,
  openai: OpenAiLogo,
  gemini: GeminiLogo,
  "ai-gateway": VercelLogo,
};

function ConnectionIcon({ id, size }: { readonly id: string; readonly size: number }) {
  const Brand = BRAND_ICONS[id];
  if (Brand) return <Brand size={size} />;
  return <HugeiconsIcon icon={ICONS[id] ?? Blockchain05Icon} size={size} strokeWidth={1.75} />;
}

export default function ConnectionsPage() {
  const t = useT();
  const celebrate = useCelebrate();
  // Registering the OAuth *app* is a self-host concern, and Settings already
  // locks the `oauth-apps` group to an Enterprise licence. A managed install
  // gets those client credentials from the environment, so its cards never
  // reach "unavailable" and nobody is asked to go make a Google project.
  const enterprise = useEnterpriseAllowed();
  const [connections, setConnections] = useState<OAuthSummary[]>([]);
  const [manual, setManual] = useState<ManualSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const confirmTimer = useRef<ReturnType<typeof setTimeout>>(null);
  /** Which manual (API-key) connection the "add key" dialog is open for. */
  const [manualTarget, setManualTarget] = useState<ManualSummary | null>(null);
  /** Which OAuth provider the "register the app" dialog is open for. Separate
   *  from `manualTarget`: this one edits the *app's* client ID and secret, not
   *  a vendor key, and it is the only way out of the "unavailable" state. */
  const [oauthTarget, setOauthTarget] = useState<OAuthSummary | null>(null);
  /** The result of a round trip to a provider, read once off the URL. */
  const [outcome, setOutcome] = useState<
    { kind: "connected"; provider: string } | { kind: "failed"; provider: string; reason: string } | null
  >(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ connections?: OAuthSummary[]; manual?: ManualSummary[] }>(
      "/api/connections",
      t,
    );
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setConnections(result.data.connections ?? []);
    setManual(result.data.manual ?? []);
  }, [t]);

  useEffect(() => {
    // The callback lands here with its verdict in the query string. It is read
    // once and cleared, so a reload doesn't replay a banner about something
    // that happened a minute ago.
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const failed = params.get("failed");
    if (connected) {
      setOutcome({ kind: "connected", provider: connected });
      // Linking a channel is the milestone the whole product sits on top of —
      // nothing else can run until one exists. Keyed per provider, so adding
      // Instagram after WhatsApp gets its own moment while a reconnect months
      // later stays quiet.
      celebrate({ once: `connection:${connected}` });
    } else if (failed) {
      setOutcome({ kind: "failed", provider: failed, reason: params.get("reason") ?? "exchange" });
    }
    if (connected || failed) {
      window.history.replaceState(null, "", window.location.pathname);
    }

    void (async () => {
      await load();
      setLoading(false);
    })();
    // `celebrate` is listed for the linter's sake, not because a re-run could
    // fire twice: the query string is cleared above, so a second pass finds
    // nothing to celebrate.
  }, [load, celebrate]);

  useEffect(() => {
    return () => {
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
    };
  }, []);

  const connect = (id: string) => {
    // A navigation, not a fetch: consent has to happen on the provider's own
    // domain, in a page the person can see the address bar of.
    window.location.href = `/api/connections/${id}/start`;
  };

  const disconnect = async (id: string) => {
    if (confirming !== id) {
      setConfirming(id);
      if (confirmTimer.current) clearTimeout(confirmTimer.current);
      confirmTimer.current = setTimeout(() => setConfirming(null), 5000);
      return;
    }
    setConfirming(null);
    setBusy(id);
    const result = await fetchJson<{ ok: boolean }>(`/api/connections/${id}`, t, { method: "DELETE" });
    if (!result.ok) setError(result.error);
    else {
      await load();
      // Removing a model key is a credential change like any other: the model
      // picker and the health dot read it from elsewhere in the app.
      notifyCredentialsChanged();
    }
    setBusy(null);
  };

  const outcomeLabel = outcome
    ? (connections.find((c) => c.id === outcome.provider)?.label ?? outcome.provider)
    : "";

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      <Skeleton className="min-h-[500px]" isLoading={loading} skeleton={<ConnectionsSkeleton />}>
        <div className="content-enter">
          <header className="mb-8">
            <h1 className="text-2xl font-semibold">{t("connections.title")}</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {t("connections.subtitle")}
            </p>
          </header>

          {error ? (
            <ErrorBanner error={error} className="mb-6" onDismiss={() => setError(null)} />
          ) : null}

          {outcome?.kind === "connected" ? (
            <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-500/40 bg-emerald-500/5 px-5 py-4">
              <HugeiconsIcon
                icon={CheckmarkCircle02Icon}
                size={18}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
              />
              <p className="text-sm">{t("connections.connectedBanner", { provider: outcomeLabel })}</p>
            </div>
          ) : null}

          {outcome?.kind === "failed" ? (
            <ErrorBanner
              className="mb-6"
              messageKey={
                outcome.reason === "denied"
                  ? "connections.failedDenied"
                  : outcome.reason === "state"
                    ? "connections.failedState"
                    : outcome.reason === "unconfigured"
                      ? "connections.failedUnconfigured"
                      : "connections.failedExchange"
              }
              onDismiss={() => setOutcome(null)}
            />
          ) : null}

          {/* ── Sign in with the account ── */}
          <section>
            <SectionHeading
              icon={Blockchain05Icon}
              title={t("connections.oauthTitle")}
              description={t("connections.oauthDescription")}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              {connections.map((connection) => (
                <ConnectionCard
                  key={connection.id}
                  connection={connection}
                  busy={busy === connection.id}
                  confirming={confirming === connection.id}
                  onConnect={() => connect(connection.id)}
                  onDisconnect={() => void disconnect(connection.id)}
                  onSetUpApp={() => setOauthTarget(connection)}
                  canSetUpApp={!enterprise.loading && enterprise.allowed}
                />
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              {t("connections.mappingNote")}
            </p>
          </section>

          {/* ── Still a key, and why ── */}
          <section className="mt-10">
            <SectionHeading
              icon={AuthorizedIcon}
              title={t("connections.manualTitle")}
              description={t("connections.manualDescription")}
            />
            <div className="space-y-3">
              {manual.map((integration) => (
                <Card key={integration.id} className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
                  <div className="flex flex-col">
                    <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                      <div className="flex items-center gap-3 px-5 py-4">
                        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                          <ConnectionIcon id={integration.id} size={16} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-2 text-sm font-medium">
                            {integration.label}
                            {integration.configured ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                                <span className="size-1.5 rounded-full bg-emerald-500" />
                                {t("connections.statusConfigured")}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                    </div>
                    {/* Status + actions — outside the inner border */}
                    <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pt-2 pb-0.5">
                      <p className="truncate text-xs text-muted-foreground">
                        {integration.configured && integration.keyPreview
                          ? integration.source === "env"
                            ? `${integration.keyPreview} · ${t("connections.fromEnv")}`
                            : integration.keyPreview
                          : t(integration.reasonKey)}
                      </p>
                      <div className="flex shrink-0 items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => setManualTarget(integration)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {integration.configured
                                ? t("connections.review")
                                : t("connections.addKey")}
                              <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.75} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs text-pretty">
                            {integration.configured
                              ? t("connections.reviewHint", { provider: integration.label })
                              : t("connections.addKeyHint", { provider: integration.label })}
                          </TooltipContent>
                        </Tooltip>
                        {integration.configured && integration.source !== "env" ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant={confirming === integration.id ? "destructive" : "ghost"}
                                size="sm"
                                onClick={() => void disconnect(integration.id)}
                                disabled={busy === integration.id}
                                aria-label={t("connections.removeKey")}
                                className="ml-1"
                              >
                                {busy === integration.id ? (
                                  <Spinner size={13} />
                                ) : (
                                  <HugeiconsIcon icon={Unlink01Icon} size={13} strokeWidth={1.75} />
                                )}
                                {confirming === integration.id ? t("connections.confirmDisconnect") : null}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>
                              {confirming === integration.id
                                ? t("connections.confirmDisconnectHint")
                                : t("connections.removeKey")}
                            </TooltipContent>
                          </Tooltip>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* ── MCP servers ──
              Below the vendor cards on purpose: those are accounts, this is a
              protocol. A server added here is not "an integration Senka
              supports", it is one the operator wired themselves, and grouping
              it with the branded cards would imply a review that never
              happened. Self-contained so this already-long page does not grow
              a fourth loading state. */}
          <section className="mt-10">
            <McpSection />
          </section>

        </div>
      </Skeleton>

      <ManualKeyDialog
        open={manualTarget !== null}
        onOpenChange={(next) => {
          if (!next) setManualTarget(null);
        }}
        settingsGroup={manualTarget?.settingsGroup ?? ""}
        label={manualTarget?.label ?? ""}
        // Four vendors share the "ai-provider" group. Without this, opening
        // Anthropic's card rendered the provider select plus whichever key
        // the *active* provider uses — so the modal titled "Anthropic key"
        // showed no Anthropic field.
        onlyKeys={manualTarget?.credentialKeys}
        onSaved={() => void load()}
      />

      <ManualKeyDialog
        open={oauthTarget !== null}
        onOpenChange={(next) => {
          if (!next) setOauthTarget(null);
        }}
        settingsGroup="oauth-apps"
        label={oauthTarget?.label ?? ""}
        onlyKeys={oauthTarget?.oauthAppKeys}
        descriptionKey="connections.oauthAppDialogDescription"
        onSaved={() => void load()}
      />
    </PageContainer>
  );
}

function SectionHeading({
  icon,
  title,
  description,
}: {
  readonly icon: IconSvgElement;
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
        <HugeiconsIcon icon={icon} size={15} strokeWidth={1.75} />
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

function ConnectionCard({
  connection,
  busy,
  confirming,
  onConnect,
  onDisconnect,
  onSetUpApp,
  canSetUpApp,
}: {
  readonly connection: OAuthSummary;
  readonly busy: boolean;
  readonly confirming: boolean;
  readonly onConnect: () => void;
  readonly onDisconnect: () => void;
  readonly onSetUpApp: () => void;
  readonly canSetUpApp: boolean;
}) {
  const t = useT();
  const connected = connection.status === "connected";
  const unavailable = connection.status === "unavailable";
  const needsReconnect = connection.status === "needs_reconnect";

  return (
    <Card interactive className="rounded-[20px] border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
      <div className="flex flex-col">
        <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
          <CardHeader>
            <div
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-xl shadow-[var(--shadow-inset)]",
                connected ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
              )}
            >
              <ConnectionIcon id={connection.id} size={16} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle>{connection.label}</CardTitle>
              <CardDescription>{t(connection.descriptionKey)}</CardDescription>
            </div>
          </CardHeader>

          <div className="flex flex-wrap gap-1.5 px-5 pb-4">
            {connection.unlockKeys.map((key) => (
              <span
                key={key}
                className="rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                {t(key)}
              </span>
            ))}
          </div>
        </div>

        {/* Status + actions — outside the inner border */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 pt-2 pb-0.5">
          <div className="flex items-center">
            {connected ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
                <span className="truncate">
                  {connection.accountLabel ?? t("connections.statusConnected")}
                </span>
              </p>
            ) : needsReconnect ? (
              <p className="flex items-center gap-1.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                <HugeiconsIcon icon={AlertCircleIcon} size={13} strokeWidth={1.75} />
                {t("connections.statusExpired")}
              </p>
            ) : unavailable ? (
              canSetUpApp ? (
                <a
                  href={connection.appDocsUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  {t("connections.statusUnavailable")}
                  <HugeiconsIcon icon={ExternalLinkIcon} size={12} strokeWidth={1.75} />
                </a>
              ) : (
                <p className="text-xs text-muted-foreground">{t("connections.statusNotEnabled")}</p>
              )
            ) : (
              <p className="text-xs text-muted-foreground">{t("connections.statusDisconnected")}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {connected || needsReconnect ? (
              <>
                <Button variant="ghost" size="sm" onClick={onConnect} disabled={busy}>
                  {t("connections.reconnect")}
                </Button>
                <Button
                  variant={confirming ? "destructive" : "outline"}
                  size="sm"
                  onClick={onDisconnect}
                  disabled={busy}
                >
                  {busy ? (
                    <Spinner size={14} />
                  ) : confirming ? null : (
                    <HugeiconsIcon icon={Unlink01Icon} size={14} strokeWidth={1.75} />
                  )}
                  {confirming ? t("connections.confirmDisconnect") : t("connections.disconnect")}
                </Button>
              </>
            ) : unavailable ? (
              canSetUpApp ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="sm" onClick={onSetUpApp}>
                      <HugeiconsIcon icon={AuthorizedIcon} size={14} strokeWidth={1.75} />
                      {t("connections.setUpApp")}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-pretty">
                    {t("connections.setUpAppHint", { provider: connection.label })}
                  </TooltipContent>
                </Tooltip>
              ) : null
            ) : (
              <Button size="sm" onClick={onConnect}>
                {t("connections.connect")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function ConnectionsSkeleton() {
  return (
    <div>
      <div className="mb-8 space-y-2">
        <SkeletonBar className="h-7 w-40" />
        <SkeletonBar className="h-4 w-96 max-w-full" />
      </div>

      {/* OAuth cards */}
      <div className="mb-4 flex items-start gap-3">
        <SkeletonBar className="size-8 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <SkeletonBar className="h-3.5 w-32" />
          <SkeletonBar className="h-3 w-56" />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
            <div className="flex items-center gap-3">
              <SkeletonBar className="size-9 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBar className="h-4 w-24" />
                <SkeletonBar className="h-3 w-32" />
              </div>
            </div>
            <div className="mt-4 flex justify-between">
              <SkeletonBar className="h-3 w-20" />
              <SkeletonBar className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Manual keys */}
      <div className="mt-10 mb-4 flex items-start gap-3">
        <SkeletonBar className="size-8 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <SkeletonBar className="h-3.5 w-28" />
          <SkeletonBar className="h-3 w-64" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className={cn("flex items-center gap-3 px-5 py-4", i > 0 && "border-t border-border")}>
            <SkeletonBar className="size-9 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBar className="h-3.5 w-24" />
              <SkeletonBar className="h-3 w-40" />
            </div>
            <SkeletonBar className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Webhooks */}
      <div className="mt-10 mb-4 flex items-start gap-3">
        <SkeletonBar className="size-8 shrink-0 rounded-lg" />
        <div className="space-y-2">
          <SkeletonBar className="h-3.5 w-24" />
          <SkeletonBar className="h-3 w-56" />
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-soft)]">
        <SkeletonBar className="mx-auto h-3 w-48" />
      </div>
    </div>
  );
}
