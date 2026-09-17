"use client";

import { Liquid } from "liquid-gooey";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n/provider";
import { ANALYTICS, PREFERENCES_EVENT, consentSnapshot, parseConsent, privacySignal, saveConsent, subscribeConsent } from "@/lib/analytics-consent";
import { enforceAnalyticsChoice, trackPage } from "@/lib/browser-analytics";
import { cn } from "@/lib/utils";

const copy = {
  es: {
    title: "Cookies y analítica",
    body: "Almacenamiento necesario para sesión y preferencias. Podés autorizar por separado la medición de visitas y uso del producto.",
    none: "No hay analítica opcional configurada. Solo almacenamiento necesario.",
    accept: "Aceptar todas", reject: "Rechazar todas", save: "Guardar preferencias", done: "Entendido", close: "Cerrar",
    necessary: "Necesario", always: "Sesión, seguridad y preferencias.",
    google: "Google Analytics", googleBody: "Medir visitas a páginas públicas.",
    product: "PostHog", productBody: "Medir uso del producto, sin grabar contenido.",
    unavailable: "No configurado.", gpc: "GPC activo: analítica desactivada.",
    policy: "Política de cookies", preferences: "Preferencias de cookies", saved: "Preferencias guardadas.",
    temporary: "No se pudo guardar. Elección aplicada en esta pestaña.",
    status: "Tu elección aplica a este navegador. Podés cambiarla cuando quieras.",
  },
  en: {
    title: "Cookies & analytics",
    body: "Necessary storage for session and preferences. You can separately allow public visit and product usage measurement.",
    none: "No optional analytics configured. Necessary storage only.",
    accept: "Accept all", reject: "Decline all", save: "Save preferences", done: "Understood", close: "Close",
    necessary: "Necessary", always: "Session, security and preferences.",
    google: "Google Analytics", googleBody: "Measure public page visits.",
    product: "PostHog", productBody: "Measure product usage, no content recording.",
    unavailable: "Not configured.", gpc: "GPC is on: analytics disabled.",
    policy: "Cookie policy", preferences: "Cookie preferences", saved: "Preferences saved.",
    temporary: "Could not save. Choice applied in this tab.",
    status: "Your choice applies to this browser. You can change it anytime.",
  },
};

const serverSnapshot = () => null;
const serverSignal = () => false;
const subscribeReady = () => () => {};
const clientReady = () => true;

export function PrivacyPreferencesButton({ className }: { className?: string }) {
  const { locale } = useI18n();
  const onClick = useCallback((event: React.MouseEvent) => {
    window.dispatchEvent(new CustomEvent(PREFERENCES_EVENT, { detail: event.currentTarget }));
  }, []);
  return (
    <button type="button" className={className ?? "lp-focus text-sm underline underline-offset-4"}
      onClick={onClick}>
      {copy[locale].preferences}
    </button>
  );
}

export function PrivacyConsent() {
  const { locale } = useI18n();
  const t = copy[locale];
  const pathname = usePathname();
  const raw = useSyncExternalStore(subscribeConsent, consentSnapshot, serverSnapshot);
  const gpc = useSyncExternalStore(subscribeConsent, privacySignal, serverSignal);
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverSignal);
  const available = Boolean(ANALYTICS.gaId || ANALYTICS.posthogKey);
  const [expanded, setExpanded] = useState(false);
  const [google, setGoogle] = useState(false);
  const [product, setProduct] = useState(false);

  const isLanding = pathname === "/" || pathname.startsWith("/landing");

  useEffect(() => {
    const show = () => {
      const saved = parseConsent(consentSnapshot());
      setGoogle(Boolean(saved?.google));
      setProduct(Boolean(saved?.product));
      setExpanded(true);
    };
    window.addEventListener(PREFERENCES_EVENT, show);
    return () => window.removeEventListener(PREFERENCES_EVENT, show);
  }, []);

  useEffect(() => {
    enforceAnalyticsChoice();
    return trackPage(pathname);
  }, [pathname, raw, gpc]);

  const save = useCallback((allowGoogle: boolean, allowProduct: boolean) => {
    saveConsent(allowGoogle, allowProduct);
    enforceAnalyticsChoice();
    setExpanded(false);
  }, []);

  const showBanner = !raw && isLanding;

  if (!ready) return null;

  return <>
    <div className="fixed right-4 bottom-4 z-40 max-w-[320px]">
      <Liquid blur={6} contrast={20} className="w-full">
        <div className={cn(
          "rounded-2xl border border-border/50 bg-card text-foreground shadow-xl transition duration-300 ease-bounce",
          expanded ? "p-4" : showBanner ? "p-3" : "hidden",
        )}>
          {showBanner && !expanded && (
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-xs font-semibold tracking-tight select-none">{t.title}</h2>
              <button type="button"
                className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setExpanded(true)}
                aria-label={t.preferences}
                aria-expanded="false">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          )}

          {expanded && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xs font-semibold tracking-tight select-none">{t.title}</h2>
                <button type="button"
                  className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setExpanded(false)}
                  aria-label={t.close}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">{t.status}</p>
              {gpc && <p className="text-xs text-muted-foreground">{t.gpc}</p>}
              {!available && <p className="text-xs text-muted-foreground">{t.none}</p>}

              {available && !gpc && <>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium">{t.necessary}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{t.always}</p>
                  </div>
                  <span className="shrink-0 text-[11px] font-medium text-muted-foreground/60">{t.done}</span>
                </div>
                {[
                  { id: "google", label: t.google, description: t.googleBody, enabled: Boolean(ANALYTICS.gaId), checked: google, set: setGoogle },
                  { id: "product", label: t.product, description: t.productBody, enabled: Boolean(ANALYTICS.posthogKey), checked: product, set: setProduct },
                ].map((option) => (
                  <div key={option.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium">{option.label}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {option.enabled ? option.description : t.unavailable}
                      </p>
                    </div>
                    <Switch
                      label={option.label}
                      checked={option.checked && option.enabled && !gpc}
                      disabled={!option.enabled || gpc}
                      onCheckedChange={option.set}
                    />
                  </div>
                ))}
              </>}

              <div className="flex flex-wrap gap-2">
                {available && !gpc ? <>
                  <button type="button"
                    className="min-h-9 flex-1 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 transition-opacity"
                    onClick={() => { save(true, true); }}>
                    {t.accept}
                  </button>
                  <button type="button"
                    className="min-h-9 flex-1 rounded-lg border border-red-600/40 px-3 text-xs font-medium text-red-600 hover:bg-red-600/10 transition-colors"
                    onClick={() => { save(false, false); }}>
                    {t.reject}
                  </button>
                </> : <button type="button"
                  className="min-h-9 flex-1 rounded-lg bg-foreground px-3 text-xs font-medium text-background hover:opacity-90 transition-opacity"
                  onClick={() => { save(false, false); }}>
                  {t.done}
                </button>}
              </div>

              {(google || product) && <button type="button"
                className="min-h-9 w-full rounded-lg bg-foreground/10 px-3 text-xs font-medium text-foreground hover:bg-foreground/20 transition-colors"
                onClick={() => { save(google, product); }}>
                {t.save}
              </button>}

              <Link href="/cookies"
                className="block text-center text-[11px] text-muted-foreground underline underline-offset-4 hover:text-foreground transition-colors"
                onClick={() => setExpanded(false)}>
                {t.policy}
              </Link>
            </div>
          )}
        </div>
      </Liquid>
    </div>
  </>;
}
