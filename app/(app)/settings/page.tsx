"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { HugeiconsIcon, type IconSvgElement } from "@/components/icons/icon";
import {
  CheckIcon,
  AuthorizedIcon,
  WhatsappIcon,
  AiWiperIcon,
  InstagramIcon,
  Cancel01Icon,
  GoogleSheetIcon,
  Calendar03Icon,
  GoogleDriveIcon,
  Mail02Icon,
  MetaIcon,
  StripeIcon,
  CreditCardIcon,
  Store01Icon,
  VolumeHighIcon,
  CallIcon,
  DatabaseIcon,
  SquareLock02Icon,
  Coins01Icon,
  Blockchain05Icon,
  ArrowRight01Icon,
} from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Skeleton, SettingsSkeleton } from "@/components/ai-elements/skeleton";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { type CredentialGroup } from "@/lib/credentials";
import { VALIDATION_ERROR_KEYS } from "@/lib/settings-i18n";
import { CredentialField } from "@/app/_components/credential-field";
import { describePostgresTarget, type PostgresKind } from "@/lib/postgres-target";
import { WhatsAppMark, InstagramMark, StripeMark, MetaMark } from "@/app/landing/_components/brand-marks";
import { ElevenLabsLogo } from "@/components/provider-logo";
import {
  TwilioBrandIcon,
  PostgresqlBrandIcon,
  GoogleCalendarBrandIcon,
  GoogleSheetsBrandIcon,
  GoogleDriveBrandIcon,
  MercadoPagoBrandIcon,
  ShopifyBrandIcon,
  ResendBrandIcon,
  DockerBrandIcon,
  SupabaseBrandIcon,
} from "@/components/icons/connection-icons";
import { ModelHealthCard } from "@/components/ai-elements/model-health-card";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import { notifyCredentialsChanged } from "@/lib/credentials-changed";
import { TutorialTrigger } from "../../_components/tutorial-video-dialog";
import { WebhookUrlNote, type WebhookChannel } from "../../_components/webhook-url-note";
import { PageContainer } from "../../_components/page-container";
import { Card, CardHeader, CardTitle, CardDescription, CardSeparator } from "../../_components/dashboard-card";
import { useEnterpriseAllowed } from "@/components/enterprise-gate";
import { Spinner } from "@/components/ui/spinner";

type CredentialStatus = Record<string, boolean>;

type ButtonPhase = "idle" | "saving" | "saved";

const GROUP_I18N: Record<string, { label?: string; desc?: string }> = {
  "ai-provider": { label: "settings.group.aiProvider", desc: "settings.group.aiProviderDesc" },
  "database": { label: "settings.group.database", desc: "settings.group.databaseDesc" },
  "whatsapp": { label: "settings.group.whatsapp", desc: "settings.group.whatsappDesc" },
  "instagram": { label: "settings.group.instagram", desc: "settings.group.instagramDesc" },
  storage: { label: "settings.group.storage", desc: "settings.group.storageDesc" },
  "google-sheets": { label: "settings.group.googleSheets", desc: "settings.group.googleSheetsDesc" },
  "google-calendar": { label: "settings.group.googleCalendar", desc: "settings.group.googleCalendarDesc" },
  "google-drive": { label: "settings.group.googleDrive", desc: "settings.group.googleDriveDesc" },
  "stripe": { label: "settings.group.stripe", desc: "settings.group.stripeDesc" },
  "mercadopago": { label: "settings.group.mercadopago", desc: "settings.group.mercadopagoDesc" },
  "shopify": { label: "settings.group.shopify", desc: "settings.group.shopifyDesc" },
  "elevenlabs": { label: "settings.group.elevenlabs", desc: "settings.group.elevenlabsDesc" },
  "twilio": { label: "settings.group.twilio", desc: "settings.group.twilioDesc" },
  "smtp": { label: "settings.group.smtp", desc: "settings.group.smtpDesc" },
  "resend": { label: "settings.group.resend", desc: "settings.group.resendDesc" },
  "meta-ads": { label: "settings.group.metaAds", desc: "settings.group.metaAdsDesc" },
};

/** Groups whose card should show the callback URL for their Eve webhook. */
const WEBHOOK_CHANNELS: readonly WebhookChannel[] = ["whatsapp", "instagram"];

function isWebhookChannel(id: string): id is WebhookChannel {
  return (WEBHOOK_CHANNELS as readonly string[]).includes(id);
}

const GROUP_ICONS: Record<string, IconSvgElement> = {
  "ai-provider": AiWiperIcon,
  database: DatabaseIcon,
  whatsapp: WhatsappIcon,
  instagram: InstagramIcon,
  "google-sheets": GoogleSheetIcon,
  "google-calendar": Calendar03Icon,
  "google-drive": GoogleDriveIcon,
  stripe: StripeIcon,
  mercadopago: CreditCardIcon,
  shopify: Store01Icon,
  elevenlabs: VolumeHighIcon,
  twilio: CallIcon,
  smtp: Mail02Icon,
  resend: Mail02Icon,
  "meta-ads": MetaIcon,
  integrations: Blockchain05Icon,
  storage: DatabaseIcon,
  "oauth-apps": AuthorizedIcon,
};

/** Groups with a real brand mark on hand — everything else falls back to the
 *  generic Hugeicons glyph in `GROUP_ICONS`. `ai-provider` stays generic on
 *  purpose: it bundles several vendors, so no single mark fits the card. */
const GROUP_BRAND_ICONS: Record<string, (props: { size: number }) => React.JSX.Element> = {
  whatsapp: WhatsAppMark,
  instagram: InstagramMark,
  stripe: StripeMark,
  mercadopago: MercadoPagoBrandIcon,
  shopify: ShopifyBrandIcon,
  elevenlabs: ElevenLabsLogo,
  twilio: TwilioBrandIcon,
  "meta-ads": MetaMark,
  "google-sheets": GoogleSheetsBrandIcon,
  "google-calendar": GoogleCalendarBrandIcon,
  "google-drive": GoogleDriveBrandIcon,
  resend: ResendBrandIcon,
  database: PostgresqlBrandIcon,
};

function GroupIcon({
  groupId,
  size,
  databaseKind,
}: {
  readonly groupId: string;
  readonly size: number;
  /** Where WORKFLOW_POSTGRES_URL points, so the database card wears the mark
   *  of whatever is actually serving it. */
  readonly databaseKind?: PostgresKind;
}) {
  if (groupId === "database" && databaseKind === "supabase") {
    return <SupabaseBrandIcon size={size} />;
  }
  const Brand = GROUP_BRAND_ICONS[groupId];
  if (Brand) return <Brand size={size} />;
  return <HugeiconsIcon icon={GROUP_ICONS[groupId] ?? AuthorizedIcon} size={size} strokeWidth={1.75} />;
}

/**
 * The bento's sections, in reading order.
 *
 * Ordered by how early you need them: the model keys are what makes the app
 * do anything at all, then the channels it talks on, then the money, then the
 * places it writes to, and last the plumbing you touch once. `extras` are the
 * self-contained cards that save themselves — they sit in the section they
 * belong to rather than being stacked at the top away from their subject.
 */
type SettingsSection = {
  readonly id: string;
  readonly labelKey: string;
  /** A line under the heading, for a section whose cards would otherwise each
   *  have to repeat the same caveat. */
  readonly descriptionKey?: string;
  readonly groups: readonly string[];
  readonly extras: ReadonlyArray<() => React.JSX.Element>;
};

const SECTIONS: readonly SettingsSection[] = [
  {
    id: "intelligence",
    labelKey: "settings.section.intelligence",
    groups: ["ai-provider"],
    extras: [ModelHealthCard, AiUsageTeaser],
  },
  {
    id: "channels",
    labelKey: "settings.section.channels",
    groups: ["whatsapp", "instagram", "twilio", "elevenlabs"],
    extras: [],
  },
  {
    id: "email",
    labelKey: "settings.section.email",
    groups: ["resend", "smtp"],
    extras: [],
  },
  {
    id: "payments",
    labelKey: "settings.section.payments",
    groups: ["stripe", "mercadopago", "shopify"],
    extras: [],
  },
  {
    id: "data",
    labelKey: "settings.section.data",
    groups: ["google-sheets", "google-calendar", "google-drive", "meta-ads"],
    extras: [],
  },
  {
    id: "system",
    labelKey: "settings.section.system",
    // Last, and it's where a group this list forgot lands — see `sectionOf`.
    groups: ["database", "storage"],
    // The license and the interaction sounds used to sit here. Neither is a
    // credential this install runs on — one is the plan, the other a personal
    // preference — so both moved to Account.
    extras: [],
  },
];

const SECTION_BY_GROUP = new Map(
  SECTIONS.flatMap((section) => section.groups.map((group) => [group, section.id] as const)),
);

/** A group the sections don't name still has to appear somewhere, so it falls
 *  into "System" rather than vanishing from the page. */
function sectionOf(groupId: string): string {
  return SECTION_BY_GROUP.get(groupId) ?? "system";
}

/**
 * The one group that only makes sense for a self-hosted install: the local
 * Postgres connection. Every other group — the AI provider keys most of
 * all — is the account's own configuration and stays open regardless of
 * license. The OAuth app credentials (Google, HubSpot, Slack, Notion) are
 * registered from Conexiones instead — see the "Configurar app" dialog
 * there — so they no longer have a card on this page at all.
 */
const ENTERPRISE_ONLY_GROUPS = new Set(["database"]);

/** What GET and POST /api/settings both answer with. */
type SettingsResponse = {
  readonly groups?: CredentialGroup[];
  /** Set in ~/.senka/credentials.json — the only ones this app can clear. */
  readonly credentials?: Record<string, boolean>;
  /** Set anywhere, store or environment. */
  readonly configured?: Record<string, boolean>;
  readonly sources?: Record<string, "store" | "env">;
  readonly values?: Record<string, string>;
  readonly previews?: Record<string, string>;
};

export default function SettingsPage() {
  const t = useT();
  const enterprise = useEnterpriseAllowed();
  const [groups, setGroups] = useState<CredentialGroup[]>([]);
  const [status, setStatus] = useState<CredentialStatus>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [configured, setConfigured] = useState<Record<string, boolean>>({});
  const [sources, setSources] = useState<Record<string, "store" | "env">>({});
  // Snapshot of what's actually been persisted this session, keyed by field.
  // Lets the input keep showing what you typed after a save (the server
  // never echoes secrets back) while still knowing when there's nothing new
  // to submit.
  const [savedValues, setSavedValues] = useState<Record<string, string>>({});
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Portal target only exists on the client — gate the floating bar on mount
  // so SSR never touches `document`.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const [buttonPhase, setButtonPhase] = useState<ButtonPhase>("idle");
  const buttonLabelRef = useRef<HTMLSpanElement>(null);
  const buttonIconRef = useRef<HTMLSpanElement>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [loading, setLoading] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shakingFields, setShakingFields] = useState<Set<string>>(new Set());
  const shakeTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const loadSettings = useCallback(async () => {
    // Whether Google is connected decides whether the service-account
    // fallback card even applies — see the HIDDEN_GROUPS comment below —
    // so this has to land before groups are filtered, not after.
    const googleConnected = await fetch("/api/connections")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { connections?: Array<{ id: string; status: string }> } | null) =>
        data?.connections?.some((c) => c.id === "google" && c.status === "connected") ?? false,
      )
      .catch(() => false);

    const result = await fetchJson<SettingsResponse>("/api/settings", t);
    if (!result.ok) {
      setError(result.error);
      setLoading(false);
      return;
    }
    const data = result.data;
    const HIDDEN_GROUPS = new Set([
      // The OAuth app credentials (Google, HubSpot, Slack, Notion) live
      // only in Conexiones now — see the "Configurar app" dialog there —
      // so this page never renders a second card for the same values.
      "oauth-apps",
      // HTTP_ALLOWLIST and LEAD_WEBHOOK_SECRET stay real and enforced —
      // the SSRF gate and the /api/leads auth don't move — this only
      // drops their card from Settings. Still settable via env var.
      "integrations",
      // A connected account always wins over the service account (see
      // getGoogleToken in lib/google-auth.ts) — with no way to prefer the
      // service account instead. Filling this in while Google is connected
      // can never take effect, so the card would be a lie. `google-calendar`
      // stays regardless: its calendar id still overrides even when
      // connected, pointing at a shared calendar instead of "primary".
      ...(googleConnected ? ["google-sheets"] : []),
    ]);
    setGroups((data.groups ?? []).filter((group) => !HIDDEN_GROUPS.has(group.id)));
    setStatus(data.credentials ?? {});
    setConfigured(data.configured ?? {});
    setSources(data.sources ?? {});
    const stored = data.values ?? {};
    setValues((prev) => ({ ...stored, ...prev }));
    setSavedValues((prev) => ({ ...stored, ...prev }));
    setPreviews(data.previews ?? {});
    setError(null);
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const validateField = useCallback((key: string, value: string, pattern?: string): string | null => {
    // Keys get pasted, and a paste carries whatever whitespace came with it —
    // a trailing newline from a terminal, a leading space from a doc. The
    // value is trimmed on save, so validate what will actually be stored.
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (pattern) {
      try {
        const regex = new RegExp(pattern);
        if (!regex.test(trimmed)) {
          return t(VALIDATION_ERROR_KEYS[key] ?? "settings.validate.generic");
        }
      } catch { /* skip */ }
    }
    return null;
  }, [t]);

  const triggerShake = useCallback((key: string) => {
    const existing = shakeTimeouts.current.get(key);
    if (existing) clearTimeout(existing);
    setShakingFields((prev) => new Set(prev).add(key));
    const timeout = setTimeout(() => {
      setShakingFields((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      shakeTimeouts.current.delete(key);
    }, 300);
    shakeTimeouts.current.set(key, timeout);
  }, []);

  const validateAll = useCallback((): boolean => {
    const errors: Record<string, string> = {};
    let hasError = false;
    for (const group of groups) {
      for (const field of group.fields) {
        const value = values[field.key];
        if (value) {
          const err = validateField(field.key, value, field.pattern);
          if (err) {
            errors[field.key] = err;
            hasError = true;
            triggerShake(field.key);
          }
        }
      }
    }
    setFieldErrors(errors);
    return !hasError;
  }, [groups, values, validateField, triggerShake]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Trim on the way out: a pasted key drags whitespace with it and a stored
    // "re_abc\n" fails at the vendor with an opaque 401 nobody traces back
    // here. An empty string still means "clear this field".
    const payload = Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, value.trim()]),
    );
    if (Object.keys(payload).length === 0) return;
    if (!validateAll()) return;

    setSaving(true);
    setSaved(false);
    setError(null);

    const result = await fetchJson<SettingsResponse>("/api/settings", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (result.ok) {
      // POST answers with the same shape GET does, so the form repaints from
      // the server's own view: the "Configurado" badge, the "from env" hint
      // and — the one you actually notice — the masked preview standing in as
      // each secret's placeholder. Without this the page looked unchanged
      // until a reload, which reads as "it didn't save".
      const data = result.data;
      setStatus(data.credentials ?? {});
      setConfigured(data.configured ?? {});
      setSources(data.sources ?? {});
      setPreviews(data.previews ?? {});
      // A cleared field has to come back empty rather than keep the value the
      // operator just deleted, so the server's view wins for anything it
      // returns and the typed value stands only where it doesn't.
      const stored = data.values ?? {};
      setValues((prev) => {
        const next = { ...prev, ...stored };
        for (const key of Object.keys(payload)) {
          if (payload[key] === "" && !(key in stored)) next[key] = "";
        }
        return next;
      });
      setSavedValues((prev) => ({ ...prev, ...payload, ...stored }));
      setFieldErrors({});
      setSaved(true);
      // The model picker, the health dot and the provider badge all read a
      // credential they did not save. Tell them, instead of waiting for the
      // next poll or the next reload.
      notifyCredentialsChanged();
      setTimeout(() => setSaved(false), 3000);
    } else {
      // Says which credential the server rejected, instead of one flat
      // "couldn't save" for every possible cause.
      setError(result.error);
    }
    setSaving(false);
  };

  // Drive button text-swap animation via phases
  useEffect(() => {
    if (savedTimer.current) clearTimeout(savedTimer.current);

    if (saving) {
      setButtonPhase("saving");
    } else if (saved) {
      setButtonPhase("saved");
      savedTimer.current = setTimeout(() => setButtonPhase("idle"), 3000);
    } else {
      setButtonPhase("idle");
    }
    return () => { if (savedTimer.current) clearTimeout(savedTimer.current); };
  }, [saving, saved]);

  // Animate button text swap when phase changes
  const prevPhase = useRef<ButtonPhase>("idle");
  useEffect(() => {
    if (prevPhase.current === buttonPhase) return;
    prevPhase.current = buttonPhase;
    const label = buttonLabelRef.current;
    const icon = buttonIconRef.current;
    if (!label || !icon) return;

    // Phase 1: exit old text
    label.classList.add("is-exit");
    icon.classList.add("is-exit");

    const dur = 260; // matches --text-swap-dur
    const swapTimeout = setTimeout(() => {
      label.classList.remove("is-exit");
      icon.classList.remove("is-exit");
      label.classList.add("is-enter-start");
      icon.classList.add("is-enter-start");
      // Force reflow
      void label.offsetHeight;
      label.classList.remove("is-enter-start");
      icon.classList.remove("is-enter-start");
    }, dur);

    return () => clearTimeout(swapTimeout);
  }, [buttonPhase]);

  const handleChange = (key: string, value: string, pattern?: string) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    if (value) {
      const err = validateField(key, value, pattern);
      if (err) {
        setFieldErrors((prev) => ({ ...prev, [key]: err }));
        triggerShake(key);
      }
    }
  };

  // Clear a configured field — sets empty string value so it gets deleted on save
  const handleClearField = (key: string) => {
    setValues((prev) => ({ ...prev, [key]: "" }));
  };

  const toggleSecret = (key: string) => {
    setShowSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // The provider select drives which API-key fields are worth showing.
  // Unset means the Gateway, matching resolveProvider()'s own default.
  const activeProvider = values.AI_PROVIDER && values.AI_PROVIDER.length > 0
    ? values.AI_PROVIDER
    : "gateway";

  // Read off the connection string rather than stored separately: a second
  // "I use Supabase" setting could disagree with the URL, and then the page
  // would be wrong in a way nobody could see.
  const databaseKind = useMemo(
    () => describePostgresTarget(values.WORKFLOW_POSTGRES_URL)?.kind,
    [values.WORKFLOW_POSTGRES_URL],
  );

  const visibleFields = useCallback(
    (group: CredentialGroup) =>
      group.fields.filter(
        (field) => !field.showWhenProvider || field.showWhenProvider.includes(activeProvider),
      ),
    [activeProvider],
  );

  // Locked (Enterprise-only) groups render no fields, so they count toward
  // neither total nor configured — the badge reflects what's on screen.
  const isLocked = useCallback(
    (groupId: string) => ENTERPRISE_ONLY_GROUPS.has(groupId) && !enterprise.loading && !enterprise.allowed,
    [enterprise],
  );

  const totalFields = useMemo(
    () =>
      groups.reduce((sum, g) => (isLocked(g.id) ? sum : sum + visibleFields(g).length), 0),
    [groups, visibleFields, isLocked],
  );
  const configuredFields = useMemo(
    () =>
      groups.reduce(
        (sum, g) => (isLocked(g.id) ? sum : sum + visibleFields(g).filter((f) => status[f.key]).length),
        0,
      ),
    [groups, status, visibleFields, isLocked],
  );

  // A field is "dirty" (has an unsaved edit worth submitting) when its
  // current value differs from what's actually been persisted — clearing an
  // unconfigured field, or retyping exactly what's already saved, isn't.
  const isDirty = useCallback(
    (key: string): boolean => {
      const value = values[key];
      if (value === undefined) return false;
      if (value === "") return Boolean(status[key]);
      return value !== (savedValues[key] ?? "");
    },
    [values, status, savedValues],
  );
  const dirtyKeys = useMemo(
    () => new Set(Object.keys(values).filter(isDirty)),
    [values, isDirty],
  );
  // Button should be enabled only while there's an actual unsaved edit
  const canSubmit = dirtyKeys.size > 0;
  // The floating bar stays visible through the save itself and its
  // confirmation — otherwise it would vanish the instant the request
  // succeeds and the "saved" state would never be seen.
  const showSaveBar = canSubmit || saving || saved;

  // Clear all configured fields at once
  const handleClearAll = () => {
    const clears: Record<string, string> = {};
    for (const group of groups) {
      if (isLocked(group.id)) continue;
      for (const field of group.fields) {
        if (status[field.key]) {
          clears[field.key] = "";
        }
      }
    }
    setValues(clears);
  };

  /** A group's card. */
  const renderGroupCards = (group: CredentialGroup): React.ReactNode[] => {
    const gi = GROUP_I18N[group.id];
    const locked = isLocked(group.id);
    const fields = visibleFields(group);

    return [
      renderCredentialCard({
        id: group.id,
        label: gi?.label ? t(gi.label) : group.label,
        description: gi?.desc ? t(gi.desc) : group.description,
        fields,
        icon: <GroupIcon groupId={group.id} size={16} databaseKind={databaseKind} />,
        locked,
        note: isWebhookChannel(group.id) ? (
          // The one value on this card that is derived, not typed: where the
          // provider has to send its webhook. See WebhookUrlNote.
          <WebhookUrlNote channel={group.id} />
        ) : group.id !== "database" ? null : (databaseKind ?? "local") === "local" ? (
            // Docker itself has nothing to type, so it has no group here — but
            // it is what serves this database, and /setup is where you can see
            // whether its daemon and container are actually up.
            <a
              href="/setup"
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
            >
              <DockerBrandIcon size={13} />
              {t("settings.dockerStatusLink")}
            </a>
          ) : (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              {databaseKind === "supabase" ? <SupabaseBrandIcon size={13} /> : null}
              {t(
                databaseKind === "supabase"
                  ? "settings.databaseSupabaseNote"
                  : "settings.databaseRemoteNote",
              )}
            </p>
          ),
      }),
    ];
  };

  /** One credential card, for one group. */
  const renderCredentialCard = (card: {
    id: string;
    label: string;
    description: string;
    fields: readonly CredentialGroup["fields"][number][];
    icon: React.ReactNode;
    locked: boolean;
    /** `database`'s extra line about where its Postgres actually lives. */
    note?: React.ReactNode;
  }) => {
    const groupFields = card.fields;
    const groupConfigured = groupFields.filter((f) => status[f.key]).length;
    const locked = card.locked;

    return (
      <Card key={card.id} className="mb-4 break-inside-avoid">
        <CardHeader>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            {locked ? (
              <HugeiconsIcon icon={SquareLock02Icon} size={16} strokeWidth={1.75} />
            ) : (
              card.icon
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <CardTitle>{card.label}</CardTitle>
              {locked ? null : (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {groupConfigured}/{groupFields.length}
                </span>
              )}
            </div>
            <CardDescription>{card.description}</CardDescription>
          </div>
          {/* The walkthrough for this credential. Sits in the header rather
              than next to a field: what people get stuck on is which console
              to open, not which of the two inputs to fill. */}
          {locked ? null : <TutorialTrigger id={card.id} name={card.label} />}
        </CardHeader>

        <CardSeparator />

        {locked ? (
          <div className="flex flex-col items-start gap-2 px-5 py-4">
            <p className="text-xs text-muted-foreground">{t("settings.enterpriseLockedHint")}</p>
            <a
              href="/account/billing"
              className="text-xs font-medium underline underline-offset-2 hover:text-foreground"
            >
              {t("settings.enterpriseLockedCta")}
            </a>
          </div>
        ) : (
        <div className="space-y-4 px-5 py-4">
          {card.note}
          {groupFields.map((field) => {
            // Configured anywhere, store or environment — that is
            // what "is this set up?" means to whoever is reading it.
            const isSet = configured[field.key] ?? status[field.key];
            const fromEnv = sources[field.key] === "env";
            const show = showSecrets[field.key];
            const fieldError = fieldErrors[field.key];
            const isShaking = shakingFields.has(field.key);
            // A pending (unsaved) clear always displays as not-set;
            // otherwise trust the server-confirmed status, so a
            // freshly saved value shows "Configurado" right away
            // without wiping what's still sitting in the input.
            const displaySet = values[field.key] === "" ? false : isSet;
            // Keep showing whatever the user typed/saved this
            // session — the server never echoes secrets back, so
            // this local copy is the only place it's visible.
            const inputValue = values[field.key] ?? "";

            return (
              <CredentialField
                key={field.key}
                field={field}
                value={inputValue}
                onChange={handleChange}
                activeProvider={activeProvider}
                preview={previews[field.key]}
                error={fieldError}
                show={show}
                onToggleShow={toggleSecret}
                className={cn(isShaking && "is-shaking")}
                headerExtra={
                  field.type !== "select" && field.key !== "AI_MODEL" ? (
                    // Nothing here can remove an environment
                    // variable, so an env-provided value says where
                    // it came from instead of offering a Clear that
                    // would silently do nothing.
                    fromEnv ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/40" />
                        {t("settings.fromEnv")}
                      </span>
                    ) : displaySet ? (
                      <button
                        type="button"
                        onClick={() => handleClearField(field.key)}
                        className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        title={t("settings.clearField")}
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={1.75} />
                        {t("settings.clearField")}
                      </button>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-muted-foreground/30" />
                        {t("settings.notSet")}
                      </span>
                    )
                  ) : null
                }
              />
            );
          })}
        </div>
        )}
      </Card>
    );
  };

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
        <Skeleton
          className="min-h-[600px]"
          isLoading={loading}
          skeleton={<SettingsSkeleton />}
        >
        <div className="content-enter">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{t("settings.title")}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("settings.subtitle")}
            </p>
          </div>
          {totalFields > 0 ? (
            <div className="hidden items-center gap-2 sm:inline-flex">
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium shadow-[var(--shadow-inset)]">
                <HugeiconsIcon icon={CheckIcon} size={16} strokeWidth={1.75} className="text-muted-foreground" />
                <span className="tabular-nums">{configuredFields}/{totalFields}</span>
              </div>
              {configuredFields > 0 && !canSubmit ? (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-muted-foreground shadow-[var(--shadow-inset)] transition-colors hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
                >
                  <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
                  {t("settings.clearAll")}
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <ErrorBanner className="mb-6" error={error} onDismiss={() => setError(null)} />

        {/* Bento. Grouped into sections by what each credential is *for* —
            seventeen equal-weight cards in one column flow read as a pile,
            and the thing you came to configure was never where you looked
            first. Within a section the layout is multi-column rather than a
            CSS grid: groups run from 1 field to 6, and grid rows stretch
            every card to the tallest in the row, which is where the big
            empty blocks under the short cards came from. Columns pack by
            height instead, so each card is as tall as its own contents. */}
        {!loading ? (
        <form id="settings-form" onSubmit={handleSubmit}>
            {SECTIONS.map((section) => {
              const sectionGroups = groups.filter((group) => sectionOf(group.id) === section.id);
              if (sectionGroups.length === 0 && section.extras.length === 0) return null;

              const fields = sectionGroups.flatMap((group) =>
                isLocked(group.id) ? [] : visibleFields(group),
              );
              const set = fields.filter((field) => status[field.key]).length;

              return (
                <section key={section.id} className="mb-9 last:mb-0">
                  <div className="mb-3 flex items-baseline justify-between gap-3 border-b border-border/60 pb-2">
                    <h2 className="font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
                      {t(section.labelKey)}
                    </h2>
                    {fields.length > 0 ? (
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {set}/{fields.length}
                      </span>
                    ) : null}
                  </div>
                  {section.descriptionKey ? (
                    <p className="mb-4 max-w-[70ch] text-xs leading-relaxed text-muted-foreground">
                      {t(section.descriptionKey)}
                    </p>
                  ) : null}
                  <div className="gap-4 lg:columns-2">
                    {section.extras.map((Extra, index) => (
                      <Extra key={index} />
                    ))}
                    {sectionGroups.flatMap(renderGroupCards)}
                  </div>
                </section>
              );
            })}
        </form>
        ) : null}

        {/* Floating save button — viewport-fixed, centered. Rendered through
            a portal: the page content carries entrance-animation transforms,
            and any transformed ancestor would re-anchor a `fixed` child to
            itself instead of the viewport — which is how the bar ended up
            glued to the end of the content instead of floating. It never
            unmounts once on the client; hide/show is a transition on
            translate + opacity so both directions animate. */}
        {mounted ? createPortal(
          <div
            className={cn(
              "fixed bottom-6 left-1/2 z-50 -translate-x-1/2 transition duration-200 ease-out motion-reduce:transition-none",
              showSaveBar ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
            )}
            aria-hidden={!showSaveBar}
            inert={!showSaveBar}
          >
            <Button
              type="submit"
              form="settings-form"
              disabled={saving}
              className="shadow-[var(--shadow-float)]"
              tabIndex={showSaveBar ? undefined : -1}
            >
                {/* Idle has no icon, and an empty span still eats the button's
                    gap. `hidden` can't do it: `.t-text-swap` sets
                    `display: inline-block` from the stylesheet and wins over
                    the utility class, so the display is set inline instead. */}
                <span
                  ref={buttonIconRef}
                  className="t-text-swap"
                  style={{ display: buttonPhase === "idle" ? "none" : "inline-block" }}
                >
                  {buttonPhase === "saving" ? (
                    <Spinner />
                  ) : buttonPhase === "saved" ? (
                    <HugeiconsIcon icon={CheckIcon} size={16} strokeWidth={1.75} />
                  ) : null}
                </span>
                <span ref={buttonLabelRef} className="t-text-swap">
                  {buttonPhase === "saving"
                    ? t("settings.saving")
                    : buttonPhase === "saved"
                      ? t("settings.saved")
                      : t("settings.saveChanges")}
                </span>
              </Button>
          </div>,
          document.body,
        ) : null}

        {/* Footer */}
        {!loading ? (
          <div className="mt-10">
            <p className="text-xs leading-relaxed text-muted-foreground">
              {t("settings.footerText", { path: "~/.senka/credentials.json" })}
            </p>
            {totalFields > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {t("settings.credentialsConfigured", { configured: configuredFields, total: totalFields })}
              </p>
            ) : null}
          </div>
        ) : null}
        </div>
        </Skeleton>
    </PageContainer>
  );
}

/** Teaser for Settings → AI Usage — the credits balance and cost breakdown
 *  live on their own page (a filterable table doesn't belong inside this
 *  form), this card is just the entry point. */
function AiUsageTeaser() {
  const t = useT();
  return (
    <Card className="mb-4 break-inside-avoid">
      <Link href="/settings/ai-usage" className="block">
        <CardHeader>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={Coins01Icon} size={16} strokeWidth={1.75} />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div className="min-w-0">
              <CardTitle>{t("aiUsage.title")}</CardTitle>
              <CardDescription>{t("aiUsage.subtitle")}</CardDescription>
            </div>
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={16}
              strokeWidth={1.75}
              className="shrink-0 text-muted-foreground"
            />
          </div>
        </CardHeader>
      </Link>
    </Card>
  );
}
