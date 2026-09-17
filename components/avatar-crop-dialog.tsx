"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LiquidSlider } from "@/components/ui/liquid-slider";
import { Spinner } from "@/components/ui/spinner";
import { useT } from "@/lib/i18n/provider";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  Camera01Icon,
  ZoomInIcon,
  ZoomOutIcon,
  RotateClockwiseIcon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";

interface Props {
  readonly file: File | null;
  readonly onConfirm: (blob: Blob) => void;
  readonly onCancel: () => void;
}

/** Output size in px (square JPEG). */
const OUTPUT = 400;
/** How far the circular preview sits inside the square viewport. */
const CIRCLE_INSET = 14;
/** Max zoom = cover scale × this. */
const ZOOM_RANGE = 4;

const isSideways = (rot: number) => rot === 90 || rot === 270;

/**
 * Avatar crop modal — la imagen se toma tal cual se sube (cualquier tamaño)
 * y aquí solo se recorta: al cargar se escala a "cover" sobre el viewport
 * cuadrado y el usuario arrastra / zoom / rota. El export es un JPEG 400×400.
 */
export function AvatarCropDialog({ file, onConfirm, onCancel }: Props) {
  const t = useT();
  const open = file !== null;

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState(false);

  // Viewport size in CSS px (responsive square, max 380).
  const [size, setSize] = useState(300);

  const [minZoom, setMinZoom] = useState(1);
  const [maxZoom, setMaxZoom] = useState(4);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [rotation, setRotation] = useState(0);
  const [applying, setApplying] = useState(false);

  // Refs espejo para usar dentro de listeners nativos sin stale closures.
  const stateRef = useRef({ zoom: 1, minZoom: 1, maxZoom: 4, offset: { x: 0, y: 0 }, rotation: 0, size: 300, natural: { w: 0, h: 0 } });
  useLayoutEffect(() => {
    stateRef.current = { zoom, minZoom, maxZoom, offset, rotation, size, natural };
  });

  const dragPtr = useRef<{ x: number; y: number } | null>(null);
  const dragOffset = useRef({ x: 0, y: 0 });

  // ── Object URL ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) {
      setImgSrc(null);
      setLoaded(false);
      return;
    }
    const url = URL.createObjectURL(file);
    setImgSrc(url);
    setLoaded(false);
    setRotation(0);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // ── Medir viewport (cuadrado responsive) ────────────────────────────
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) setSize(w);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open ]);

  const clamp = useCallback(
    (ox: number, oy: number, z: number, rot: number, s: number, nw: number, nh: number) => {
      const w = nw * z;
      const h = nh * z;
      // La caja pintada rota solidaria con la imagen (origen = su centro):
      // a 90°/270° sus dimensiones se intercambian.
      const pw = isSideways(rot) ? h : w;
      const ph = isSideways(rot) ? w : h;
      // Se clampea el centro del elemento para que la caja pintada cubra.
      const clampAxis = (c: number, p: number) =>
        p <= s ? s / 2 : Math.min(p / 2, Math.max(s - p / 2, c));
      return {
        x: clampAxis(ox + w / 2, pw) - w / 2,
        y: clampAxis(oy + h / 2, ph) - h / 2,
      };
    },
    [],
  );

  // Re-clampear al cambiar el tamaño del viewport (apertura animada, resize).
  useLayoutEffect(() => {
    if (!loaded) return;
    setOffset((prev) => clamp(prev.x, prev.y, stateRef.current.zoom, stateRef.current.rotation, size, natural.w, natural.h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size]);

  // ── Al cargar la imagen: escala cover tal cual venga ────────────────
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (!img) return;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return;
    const s = stateRef.current.size || 300;
    const cover = s / Math.min(w, h);
    const max = cover * ZOOM_RANGE;
    setNatural({ w, h });
    setMinZoom(cover);
    setMaxZoom(max);
    setZoom(cover);
    setRotation(0);
    setOffset({ x: (s - w * cover) / 2, y: (s - h * cover) / 2 });
    setLoaded(true);
  }, []);

  // ── Drag ────────────────────────────────────────────────────────────
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!loaded || applying) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      dragPtr.current = { x: e.clientX, y: e.clientY };
      dragOffset.current = { ...stateRef.current.offset };
    },
    [loaded, applying],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragPtr.current) return;
      const st = stateRef.current;
      setOffset(
        clamp(
          dragOffset.current.x + (e.clientX - dragPtr.current.x),
          dragOffset.current.y + (e.clientY - dragPtr.current.y),
          st.zoom,
          st.rotation,
          st.size,
          st.natural.w,
          st.natural.h,
        ),
      );
    },
    [clamp],
  );

  const endDrag = useCallback(() => {
    dragPtr.current = null;
  }, []);

  // Wheel nativo no-pasivo: zoom bajo el cursor sin scrollear el modal.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el || !open) return;
    const onWheel = (e: WheelEvent) => {
      if (!stateRef.current.natural.w) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const st = stateRef.current;
      const next = st.zoom + -e.deltaY * 0.002 * st.zoom;
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const clamped = Math.min(st.maxZoom, Math.max(st.minZoom, next));
      if (clamped === st.zoom) return;
      const scale = clamped / st.zoom;
      setZoom(clamped);
      setOffset(clamp(px + (st.offset.x - px) * scale, py + (st.offset.y - py) * scale, clamped, st.rotation, st.size, st.natural.w, st.natural.h));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [open, clamp]);

  // ── Slider (zoom centrado) ──────────────────────────────────────────
  const sliderValue = maxZoom > minZoom ? (zoom - minZoom) / (maxZoom - minZoom) : 0;
  const onSliderZoom = useCallback(
    (v: number) => {
      const st = stateRef.current;
      const next = st.minZoom + v * (st.maxZoom - st.minZoom);
      const c = st.size / 2;
      const clamped = Math.min(st.maxZoom, Math.max(st.minZoom, next));
      const scale = clamped / st.zoom;
      if (clamped === st.zoom) return;
      setZoom(clamped);
      setOffset(clamp(c + (st.offset.x - c) * scale, c + (st.offset.y - c) * scale, clamped, st.rotation, st.size, st.natural.w, st.natural.h));
    },
    [clamp],
  );

  const stepZoom = useCallback(
    (dir: 1 | -1) => {
      onSliderZoom(Math.min(1, Math.max(0, sliderValue + dir * 0.1)));
    },
    [onSliderZoom, sliderValue],
  );

  // ── Rotación 90° sobre el centro de la imagen: el centro se queda quieto
  // y solo se re-clampea al rango de la orientación nueva. Sin saltos ni
  // huecos blancos, y el preview coincide con el export.
  const rotate = useCallback(() => {
    const st = stateRef.current;
    if (!st.natural.w || applying) return;
    const next = (st.rotation + 90) % 360;
    setRotation(next);
    setOffset(clamp(st.offset.x, st.offset.y, st.zoom, next, st.size, st.natural.w, st.natural.h));
  }, [applying, clamp]);

  const reset = useCallback(() => {
    const st = stateRef.current;
    if (!st.natural.w || applying) return;
    setRotation(0);
    setZoom(st.minZoom);
    setOffset({ x: (st.size - st.natural.w * st.minZoom) / 2, y: (st.size - st.natural.h * st.minZoom) / 2 });
  }, [applying]);

  // ── Export ──────────────────────────────────────────────────────────
  const handleApply = useCallback(async () => {
    const img = imgRef.current;
    const st = stateRef.current;
    if (!img || !st.natural.w) return;
    setApplying(true);
    try {
      // Esperar a que la imagen esté decodificada (object URL recién creado).
      try {
        await img.decode();
      } catch {
        /* decode opcional */
      }
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, OUTPUT, OUTPUT);
      const scale = OUTPUT / st.size;
      // Mismo modelo que el preview: caja layout en offset con tamaño W×H,
      // rotada sobre su propio centro.
      const wScaled = st.natural.w * st.zoom;
      const hScaled = st.natural.h * st.zoom;
      const cxOut = (st.offset.x + wScaled / 2) * scale;
      const cyOut = (st.offset.y + hScaled / 2) * scale;
      ctx.save();
      ctx.translate(cxOut, cyOut);
      ctx.rotate((st.rotation * Math.PI) / 180);
      ctx.translate(-cxOut, -cyOut);
      ctx.drawImage(
        img,
        st.offset.x * scale,
        st.offset.y * scale,
        wScaled * scale,
        hScaled * scale,
      );
      ctx.restore();
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob failed"))), "image/jpeg", 0.92);
      });
      onConfirm(blob);
    } finally {
      setApplying(false);
    }
  }, [onConfirm]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next && !applying) onCancel();
    },
    [applying, onCancel],
  );

  const scaledW = natural.w * zoom;
  const scaledH = natural.h * zoom;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[520px]" showCloseButton={!applying}>
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={Camera01Icon} size={18} strokeWidth={1.75} />}>
            {t("account.avatarCropTitle")}
          </DialogTitle>
          <DialogDescription>
            {t("account.avatarCropDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-5">
          {/* Viewport cuadrado responsive, centrado */}
          <div ref={wrapRef} className="mx-auto w-full max-w-[380px]">
            <div
              ref={viewportRef}
              aria-label={t("account.avatarCropViewport")}
              className="relative aspect-square w-full cursor-grab touch-none overflow-hidden rounded-2xl bg-muted ring-1 ring-border select-none active:cursor-grabbing"
              style={{ touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
            >
              {imgSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imgRef}
                  src={imgSrc}
                  alt=""
                  draggable={false}
                  onLoad={handleImgLoad}
                  className="absolute max-w-none pointer-events-none select-none"
                  style={{
                    left: offset.x,
                    top: offset.y,
                    width: scaledW || undefined,
                    height: scaledH || undefined,
                    transform: `rotate(${rotation}deg)`,
                    // Origen = centro del elemento: la foto gira sobre sí
                    // misma sin desplazarse (igual que en el export).
                    transformOrigin: "50% 50%",
                    transition: "transform 320ms var(--ease-smooth-out)",
                    opacity: loaded ? 1 : 0,
                  }}
                />
              ) : null}

              {/* Estado de carga */}
              {imgSrc && !loaded ? (
                <div className="absolute inset-0 grid place-items-center">
                  <Spinner size={20} strokeWidth={2} />
                </div>
              ) : null}

              {/* Máscara circular: lo de fuera se atenúa, lo de dentro es el avatar */}
              {loaded ? (
                <div
                  className="pointer-events-none absolute rounded-full border-2 border-white/90 shadow-[0_2px_16px_rgb(0_0_0/0.25)]"
                  style={{
                    inset: CIRCLE_INSET,
                    boxShadow:
                      "0 0 0 9999px rgb(0 0 0 / 0.55), 0 2px 16px rgb(0 0 0 / 0.25)",
                  }}
                />
              ) : null}

              {/* Tercios sutiles dentro del círculo para encuadrar la cara */}
              {loaded ? (
                <div
                  className="pointer-events-none absolute rounded-full"
                  style={{ inset: CIRCLE_INSET }}
                  aria-hidden="true"
                >
                  <div className="absolute top-1/3 right-0 left-0 h-px bg-white/25" />
                  <div className="absolute bottom-1/3 right-0 left-0 h-px bg-white/25" />
                  <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white/25" />
                  <div className="absolute top-0 right-1/3 bottom-0 w-px bg-white/25" />
                </div>
              ) : null}
            </div>
          </div>

          {/* Zoom + rotar + restablecer */}
          <div className="mx-auto flex w-full max-w-[380px] items-center gap-2">
            <button
              type="button"
              aria-label={t("account.avatarCropZoomOut")}
              disabled={!loaded || applying}
              onClick={() => stepZoom(-1)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HugeiconsIcon icon={ZoomOutIcon} size={15} strokeWidth={1.75} />
            </button>
            <div className="min-w-0 flex-1">
              <LiquidSlider
                value={sliderValue}
                onValueChange={onSliderZoom}
                min={0}
                max={1}
                step={0.01}
                label={t("account.avatarCropZoomLevel")}
              />
            </div>
            <button
              type="button"
              aria-label={t("account.avatarCropZoomIn")}
              disabled={!loaded || applying}
              onClick={() => stepZoom(1)}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HugeiconsIcon icon={ZoomInIcon} size={15} strokeWidth={1.75} />
            </button>
            <div className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden="true" />
            <button
              type="button"
              aria-label={t("account.avatarCropRotate")}
              title={t("account.avatarCropRotateShort")}
              disabled={!loaded || applying}
              onClick={rotate}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HugeiconsIcon icon={RotateClockwiseIcon} size={15} strokeWidth={1.75} />
            </button>
            <button
              type="button"
              aria-label={t("account.avatarCropReset")}
              title={t("account.avatarCropResetShort")}
              disabled={!loaded || applying}
              onClick={reset}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground active:bg-muted/80 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <HugeiconsIcon icon={RefreshIcon} size={15} strokeWidth={1.75} />
            </button>
          </div>

          <p className="mx-auto max-w-[380px] text-center text-xs leading-relaxed text-muted-foreground">
            {t("account.avatarCropHint")}
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={applying}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleApply()} disabled={applying || !loaded}>
            {applying ? <Spinner size={15} strokeWidth={2} /> : null}
            {t("account.avatarCropApply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
