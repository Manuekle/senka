"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowDown01Icon,
  Add01Icon,
  CheckIcon,
  Building06Icon,
  Loading03Icon,
} from "@hugeicons/core-free-icons";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchJson, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

// Which business you are working on, at the top of the sidebar.
//
// It sits here rather than inside Settings for the reason every workspace
// switcher does: it is the frame around everything below it. The inbox, the
// contacts, the agents and the knowledge base on this screen all belong to the
// business named in this button, and a switch that lived three clicks deep
// would leave people reading one business's numbers believing they were
// another's.
//
// Switching reloads the page rather than refetching. Every screen in the app
// holds data from the business that was active when it mounted — polled
// badges, an open conversation, a half-typed agent — and a soft refresh would
// mix the two. A reload is one second and zero ambiguity.

type Business = {
  readonly id: string;
  readonly name: string;
  readonly active: boolean;
  readonly primary: boolean;
  readonly logoUpdatedAt: string | null;
  readonly access?: "active" | "suspended";
};

export function BusinessSwitcher({ collapsed = false, className }: { readonly collapsed?: boolean; readonly className?: string }) {
  const { t, locale } = useI18n();
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [price, setPrice] = useState<{ id: string; amount: number; currency: string } | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const [purchaseId, setPurchaseId] = useState("");

  useEffect(() => {
    if (!createOpen) return;
    let cancelled = false;
    void fetchJson<{ price: typeof price }>("/api/billing/workspaces?quote=1", t).then((result) => {
      if (cancelled) return;
      setPriceLoading(false);
      if (result.ok) setPrice(result.data.price);
      else setError(result.error);
    });
    return () => { cancelled = true; };
  }, [createOpen, t]);

  const load = useCallback(async () => {
    const result = await fetchJson<{ businesses: Business[] }>("/api/businesses", t);
    if (result.ok) setBusinesses(result.data.businesses);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = businesses.find((business) => business.active);
  // Before the first response, and on an install whose one business has never
  // been named, the button still has to say something.
  const activeName = active?.name?.trim() || t("business.unnamed");

  const switchTo = async (id: string) => {
    if (id === active?.id) {
      setPickerOpen(false);
      return;
    }
    setBusy(true);
    const result = await fetchJson("/api/businesses", t, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, active: true }),
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    window.location.reload();
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const name = newName.trim();
    if (!name || busy || !price) return;
    setBusy(true);
    const result = await fetchJson<{ url: string }>("/api/billing/workspaces", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, requestId: purchaseId, priceId: price.id }),
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return;
    }
    // Checkout explains and collects the recurring charge. The signed webhook
    // provisions access; returning from this browser flow does not.
    window.location.href = result.data.url;
  };

  const trigger = (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-expanded={pickerOpen}
      aria-label={t("business.switch")}
      onClick={() => setPickerOpen(true)}
      data-cuelume-hover="tick"
      data-cuelume-press
      className={cn(
        "flex items-center rounded-lg border border-border bg-card text-left transition-colors duration-150",
        "hover:border-input hover:bg-accent",
        collapsed ? "size-8 justify-center p-0" : "w-full gap-2 px-2 py-2",
        className,
      )}
    >
      {active?.logoUpdatedAt ? (
        <Image
          src={`/api/businesses/${encodeURIComponent(active.id)}/logo?v=${encodeURIComponent(active.logoUpdatedAt)}`}
          alt={activeName}
          width={40}
          height={40}
          className="size-5 shrink-0 rounded-md border border-border bg-card object-contain p-px"
        />
      ) : (
        <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-semibold uppercase shadow-[var(--shadow-inset)]">
          {activeName.slice(0, 1)}
        </span>
      )}
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] font-medium">{activeName}</span>
          <HugeiconsIcon
            icon={busy ? Loading03Icon : ArrowDown01Icon}
            size={13}
            strokeWidth={1.75}
            className={cn("shrink-0 text-muted-foreground", busy && "animate-spin")}
          />
        </>
      )}
    </button>
  );

  return (
    <>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right">{activeName}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}

      <CommandDialog
        className="rounded-[18px] border-border/70 bg-muted/50 p-0 shadow-[var(--shadow-float)] [&_[data-slot=command]]:rounded-none [&_[data-slot=command]]:border-0 [&_[data-slot=command]]:bg-transparent [&_[data-slot=command]]:shadow-none [&_[data-slot=command-input-wrapper]]:mx-2 [&_[data-slot=command-input-wrapper]]:mt-1.5 [&_[data-slot=command-input-wrapper]]:h-10 [&_[data-slot=command-input-wrapper]]:rounded-lg [&_[data-slot=command-input-wrapper]]:border-0 [&_[data-slot=command-input-wrapper]]:bg-transparent [&_[data-slot=command-input-wrapper]]:px-0 [&_[cmdk-input]]:!h-10 [&_[cmdk-group]]:p-0 [&_[cmdk-item]]:px-2 [&_[cmdk-item]]:py-2"
        closeClassName="top-3"
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t("business.switch")}
        description={t("business.switchDescription")}
      >
        <CommandInput placeholder={t("business.search")} />
        <CommandList className="mx-2 mb-2 py-[0.5em] max-h-[min(24rem,60vh)] rounded-[12px] border border-border bg-card">
          <CommandEmpty>{t("business.noneFound")}</CommandEmpty>
          <CommandGroup>
            {businesses.map((business) => (
              <CommandItem
                key={business.id}
                disabled={business.access === "suspended" || busy}
                value={`${business.id} ${business.name}`}
                onSelect={() => void switchTo(business.id)}
              >
                <span className="flex w-full items-center gap-2.5">
                  {business.logoUpdatedAt ? (
                    <Image
                      src={`/api/businesses/${encodeURIComponent(business.id)}/logo?v=${encodeURIComponent(business.logoUpdatedAt)}`}
                      alt={business.name || t("business.unnamed")}
                      width={48}
                      height={48}
                      className="size-6 shrink-0 rounded-md border border-border bg-card object-contain p-px"
                    />
                  ) : (
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold uppercase">
                      {(business.name || t("business.unnamed")).slice(0, 1)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-[13px]">
                    {business.name || t("business.unnamed")}
                  </span>
                  {business.active ? (
                    <HugeiconsIcon
                      icon={CheckIcon}
                      size={14}
                      strokeWidth={2}
                      className="shrink-0 text-emerald-500"
                    />
                  ) : null}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandGroup>
            <CommandItem
              value={t("business.create")}
              onSelect={() => {
                setPickerOpen(false);
                setNewName("");
                setPrice(null);
                setPriceLoading(true);
                setPurchaseId(crypto.randomUUID());
                setError(null);
                setCreateOpen(true);
              }}
            >
              <span className="flex items-center gap-2.5 text-[13px]">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                  <HugeiconsIcon icon={Add01Icon} size={13} strokeWidth={1.75} />
                </span>
                {t("business.create")}
              </span>
            </CommandItem>
          </CommandGroup>
        </CommandList>
        <p className="border-t border-border px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
          {t("business.scopeNote")}
        </p>
      </CommandDialog>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle icon={<HugeiconsIcon icon={Building06Icon} size={18} strokeWidth={1.75} />}>
              {t("business.create")}
            </DialogTitle>
            <DialogDescription>{t("business.createDescription")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void create(event)} className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-sm font-medium">{t("business.name")}</span>
              <Input
                value={newName}
                onChange={(event) => { setNewName(event.target.value); setPurchaseId(crypto.randomUUID()); }}
                placeholder={t("business.namePlaceholder")}
                autoComplete="off"
                data-1p-ignore="true"
                required
                maxLength={100}
                disabled={busy}
              />
            </label>
            {error ? <p className="text-xs text-destructive">{uiErrorMessage(t, error)}</p> : null}
            <p className="text-sm" role="status">{priceLoading ? t("workspace.priceLoading") : price
              ? t("workspace.price", { amount: new Intl.NumberFormat(locale, { style: "currency", currency: price.currency }).format(price.amount) })
              : t("workspace.notConfigured")}</p>
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <HugeiconsIcon
                icon={Building06Icon}
                size={12}
                strokeWidth={1.75}
                className="mt-0.5 shrink-0"
              />
              {t("business.createNote")}
            </p>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline" type="button" onClick={() => setCreateOpen(false)}>
                  {t("common.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={!newName.trim() || busy || !price || priceLoading}>
                {busy ? t("workspace.opening") : t("workspace.checkout")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
