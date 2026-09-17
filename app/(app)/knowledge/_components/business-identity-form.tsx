"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Delete02Icon, ImageUpload01Icon } from "@hugeicons/core-free-icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { useToast } from "@/components/toast-provider";
import { useConfirmDialog } from "@/components/confirm-dialog";
import Image from "next/image";
import { fetchJson, readApiError, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import type { BusinessIdentity, BusinessIdentityFields } from "@/lib/business-profile-store";
import { Spinner } from "@/components/ui/spinner";

/** Mirrors `LOGO_ACCEPT_ATTRIBUTE` in lib/business-identity.ts, which is
 *  server-only — importing it here would pull the AI and fs modules it sits
 *  next to into the browser bundle. The route still enforces the real list. */
const LOGO_ACCEPT = ".png,.jpg,.jpeg,.webp,.gif,.svg";

/**
 * The hand-entered half of the business: name, what it does, how to reach it,
 * and the logo. Nothing here is generated and nothing is required — a business
 * that only fills in its name is better off than one that filled in nothing.
 */

const FIELDS = [
  { key: "name", type: "text" },
  { key: "websiteUrl", type: "url" },
  { key: "email", type: "email" },
  { key: "phone", type: "tel" },
  { key: "address", type: "text" },
  { key: "hours", type: "text" },
] as const satisfies readonly { key: keyof BusinessIdentityFields; type: string }[];

const LABELS: Record<keyof BusinessIdentityFields, string> = {
  name: "business.fieldName",
  description: "business.fieldDescription",
  websiteUrl: "business.fieldWebsite",
  email: "business.fieldEmail",
  phone: "business.fieldPhone",
  address: "business.fieldAddress",
  hours: "business.fieldHours",
};

function toFields(identity: BusinessIdentity): BusinessIdentityFields {
  return {
    name: identity.name,
    description: identity.description,
    websiteUrl: identity.websiteUrl,
    email: identity.email,
    phone: identity.phone,
    address: identity.address,
    hours: identity.hours,
  };
}

export function BusinessIdentityForm({
  identity,
  onChange,
  onSaveRef,
  onSaveState,
}: {
  readonly identity: BusinessIdentity;
  readonly onChange: (identity: BusinessIdentity) => void;
  readonly onSaveRef?: React.MutableRefObject<(() => void) | null>;
  readonly onSaveState?: (state: { dirty: boolean; saving: boolean; canSave: boolean }) => void;
}) {
  const { t } = useI18n();
  const { cue } = useSound();
  const { toast } = useToast();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();

  const [draft, setDraft] = useState<BusinessIdentityFields>(() => toFields(identity));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draggingLogo, setDraggingLogo] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const logoDragDepth = useRef(0);

  const saved = useMemo(() => toFields(identity), [identity]);
  const dirty = useMemo(
    () => (Object.keys(saved) as (keyof BusinessIdentityFields)[]).some((key) => draft[key] !== saved[key]),
    [draft, saved],
  );
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  useEffect(() => {
    if (!dirtyRef.current) setDraft(saved);
  }, [saved]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    const result = await fetchJson<{ identity: BusinessIdentity }>("/api/business-profile/identity", t, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    setSaving(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    cue("success");
    onChange(result.data.identity);
    toast({ title: t("common.saved"), status: "success" });
  }, [cue, draft, onChange, t, toast]);

  // Wire up the footer save ref and bubble state up.
  useEffect(() => {
    if (onSaveRef) onSaveRef.current = () => void save();
  }, [onSaveRef, save]);

  useEffect(() => {
    onSaveState?.({ dirty, saving, canSave: dirty && !saving });
  }, [dirty, saving, onSaveState]);

  const uploadLogo = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      const form = new FormData();
      form.append("file", file);
      try {
        const res = await fetch("/api/business-profile/logo", { method: "POST", body: form });
        if (!res.ok) {
          setError(await readApiError(res, t));
          return;
        }
        // The logo lives outside the identity payload this form holds, so read
        // the whole identity back rather than patching a field in place.
        const refreshed = await fetchJson<{ identity: BusinessIdentity }>(
          "/api/business-profile/identity",
          t,
        );
        if (refreshed.ok) onChange(refreshed.data.identity);
        cue("success");
      } catch {
        setError({ messageKey: "business.logoFailed" });
      } finally {
        setUploading(false);
      }
    },
    [cue, onChange, t],
  );

  const removeLogo = useCallback(async () => {
    if (!(await confirm({ title: t("business.logoConfirmRemove") }))) return;
    cue("droplet");
    try {
      const res = await fetch("/api/business-profile/logo", { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onChange({ ...identity, logo: null });
    } catch {
      setError({ messageKey: "business.logoFailed" });
    }
  }, [confirm, cue, identity, onChange, t]);

  return (
    <div className="space-y-4">
      {confirmDialog}
      <ErrorBanner error={error} onDismiss={() => setError(null)} />

      <div
        onClick={(event) => {
          // Whole card opens the picker, like the documents dropzone.
          // Clicks on the inner buttons keep their own behavior.
          if (uploading) return;
          if ((event.target as HTMLElement).closest("button, input, a, textarea")) return;
          fileInput.current?.click();
        }}
        onPointerDown={(event) => {
          // Same press knock the documents dropzone gets from the global
          // floor binding (it only listens on button/[role="button"], and
          // this card can't be a button: it contains real ones).
          if (uploading) return;
          if ((event.target as HTMLElement).closest("button, input, a, textarea")) return;
          cue("press");
        }}
        onPointerUp={(event) => {
          if (uploading) return;
          if ((event.target as HTMLElement).closest("button, input, a, textarea")) return;
          cue("release");
        }}
        onDragEnter={(event) => {
          if (uploading) return;
          event.preventDefault();
          logoDragDepth.current += 1;
          setDraggingLogo(true);
        }}
        onDragOver={(event) => {
          if (uploading) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDraggingLogo(true);
        }}
        onDragLeave={(event) => {
          if (uploading) return;
          event.preventDefault();
          logoDragDepth.current = Math.max(0, logoDragDepth.current - 1);
          if (logoDragDepth.current === 0) setDraggingLogo(false);
        }}
        onDrop={(event) => {
          if (uploading) return;
          event.preventDefault();
          logoDragDepth.current = 0;
          setDraggingLogo(false);
          const file = event.dataTransfer.files?.[0];
          if (file) void uploadLogo(file);
        }}
        className={`flex flex-wrap items-center gap-4 rounded-xl border bg-background p-4 transition-[background-color,border-color,transform] duration-150 active:scale-[0.99] ${draggingLogo ? "border-foreground bg-muted/40" : "border-border"} ${uploading ? "" : "cursor-pointer"}`}
      >
        <LogoPreview identity={identity} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="text-sm font-medium">{t("business.logo")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("business.logoHint")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInput}
            type="file"
            accept={LOGO_ACCEPT}
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              // Cleared so picking the same file twice still fires a change.
              event.target.value = "";
              if (file) void uploadLogo(file);
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            {uploading ? (
              <Spinner size={14} strokeWidth={2} />
            ) : (
              <HugeiconsIcon icon={ImageUpload01Icon} size={14} strokeWidth={1.75} />
            )}
            {identity.logo ? t("business.logoReplace") : t("business.logoUpload")}
          </Button>
          {identity.logo ? (
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t("business.logoRemove")}
              onClick={() => void removeLogo()}
            >
              <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.75} />
            </Button>
          ) : null}
        </div>
      </div>

      <div>
        <label htmlFor="bi-description" className="mb-1.5 block text-sm font-medium">
          {t(LABELS.description)}
        </label>
        <Textarea
          id="bi-description"
          value={draft.description}
          onChange={(event) => setDraft((prev) => ({ ...prev, description: event.target.value }))}
          placeholder={t("business.fieldDescriptionPlaceholder")}
          rows={3}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(({ key, type }) => (
          <div key={key}>
            <label htmlFor={`bi-${key}`} className="mb-1.5 block text-sm font-medium">
              {t(LABELS[key])}
            </label>
            <Input
              id={`bi-${key}`}
              type={type}
              value={draft[key]}
              onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
              placeholder={t(`business.${key}Placeholder`)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The stored logo, or a placeholder tile. The `updatedAt` query keeps a
 *  replaced logo from showing through the immutable cache the route sets. */
export function LogoPreview({
  identity,
  className = "size-14",
}: {
  readonly identity: BusinessIdentity;
  readonly className?: string;
}) {
  const { t } = useI18n();

  if (!identity.logo) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl border border-dashed border-border bg-muted text-muted-foreground ${className}`}
      >
        <HugeiconsIcon icon={ImageUpload01Icon} size={18} strokeWidth={1.75} />
      </div>
    );
  }

  return (
    <Image
      src={`/api/business-profile/logo?v=${encodeURIComponent(identity.logo.updatedAt)}`}
      alt={identity.name || t("business.logo")}
      width={112}
      height={112}
      className={`shrink-0 rounded-xl border border-border bg-card object-contain p-1 ${className}`}
    />
  );
}
