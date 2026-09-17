"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { cn } from "@/lib/utils";

/**
 * A horizontal scroll container that applies the same fade-edge effect used by
 * the pipeline kanban board. When the content overflows, an inline slider bar
 * appears below with left/right arrow buttons for navigation.
 *
 * Unlike the pipeline board (which uses a portal so its slider is not clipped
 * by the board's container-query context), this component places the slider
 * directly below the scroller — making it safe to use multiple times on the
 * same page without stacking issues.
 */
export function CardCarousel({
  children,
  className,
  label,
}: {
  readonly children: ReactNode;
  /** Extra classes on the outer wrapper. */
  readonly className?: string;
  /** Accessible label for the scrollbar (aria-label). */
  readonly label?: string;
}) {
  const scrollerId = useId();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const thumbDrag = useRef<{ startX: number; startScroll: number } | null>(null);
  const [shuttle, setShuttle] = useState({ x: 0, w: 0, frac: 0, max: 0 });

  const measureSlider = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    // Update fade variables: only fade edges that actually have hidden content
    scroller.style.setProperty("--x-fade-start", scroller.scrollLeft > 4 ? "40px" : "0px");
    scroller.style.setProperty("--x-fade-end", scroller.scrollLeft < max - 4 ? "40px" : "0px");
    const track = trackRef.current;
    if (!track || max <= 0) {
      setShuttle((s) => (s.max === max && s.w === 0 ? s : { x: 0, w: 0, frac: 0, max }));
      return;
    }
    const trackW = track.clientWidth;
    if (trackW <= 0) return;
    const w = Math.max((scroller.clientWidth / scroller.scrollWidth) * trackW, 44);
    const frac = scroller.scrollLeft / max;
    const x = frac * (trackW - w);
    setShuttle((s) =>
      Math.abs(s.x - x) < 0.5 && Math.abs(s.w - w) < 0.5 && s.max === max
        ? s
        : { x, w, frac, max },
    );
  }, []);

  useEffect(() => {
    measureSlider();
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    const onScroll = () => measureSlider();
    scroller?.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measureSlider);
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measureSlider()) : null;
    if (scroller) ro?.observe(scroller);
    if (track) ro?.observe(track);
    // Layout settles after first paint (fonts, container queries).
    const settled = setTimeout(measureSlider, 300);
    return () => {
      scroller?.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measureSlider);
      ro?.disconnect();
      clearTimeout(settled);
    };
  }, [measureSlider, children]);

  const onThumbDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller || shuttle.max <= 0) return;
    event.stopPropagation();
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    thumbDrag.current = { startX: event.clientX, startScroll: scroller.scrollLeft };
  };

  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = thumbDrag.current;
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!drag || !scroller || !track) return;
    const travel = track.clientWidth - shuttle.w;
    if (travel <= 0) return;
    scroller.scrollLeft =
      drag.startScroll + ((event.clientX - drag.startX) / travel) * shuttle.max;
  };

  const endThumbDrag = () => {
    thumbDrag.current = null;
  };

  const onTrackDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    const track = trackRef.current;
    if (!scroller || !track || shuttle.max <= 0) return;
    const rect = track.getBoundingClientRect();
    const travel = rect.width - shuttle.w;
    if (travel <= 0) return;
    const frac = Math.min(1, Math.max(0, (event.clientX - rect.left - shuttle.w / 2) / travel));
    scroller.scrollTo({ left: frac * shuttle.max, behavior: "smooth" });
  };

  const onThumbKey = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const step = scroller.clientWidth * 0.25;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      scroller.scrollBy({ left: step });
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      scroller.scrollBy({ left: -step });
    } else if (event.key === "Home") {
      event.preventDefault();
      scroller.scrollTo({ left: 0 });
    } else if (event.key === "End") {
      event.preventDefault();
      scroller.scrollTo({ left: shuttle.max });
    }
  };

  const nudge = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * (scrollerRef.current.clientWidth * 0.65),
      behavior: "smooth",
    });
  };

  const hasOverflow = shuttle.max > 0;

  return (
    <div className={cn("relative min-w-0", className)}>
      {/* Horizontal scroller with fade edges */}
      <div
        ref={scrollerRef}
        id={scrollerId}
        className="x-fade overflow-x-auto overscroll-contain scrollbar-hide"
      >
        {children}
      </div>

      {/* Inline slider — only visible when content overflows.
          The track div is always mounted so ResizeObserver can measure it
          and so the shuttle position is ready the moment overflow is detected. */}
      <div
        className={cn(
          "flex items-center justify-center gap-1",
          hasOverflow ? "mt-3 mb-1" : "pointer-events-none invisible h-0 overflow-hidden select-none",
        )}
        aria-hidden={!hasOverflow}
      >
        <CarouselButton
          icon={ArrowLeft01Icon}
          label="Anterior"
          disabled={shuttle.frac <= 0}
          onClick={() => nudge(-1)}
        />
        <div
          ref={trackRef}
          onPointerDown={onTrackDown}
          className="relative h-1.5 w-[min(200px,35vw)] cursor-pointer rounded-full bg-muted"
        >
          <div
            role="scrollbar"
            aria-controls={scrollerId}
            aria-orientation="horizontal"
            aria-label={label ?? "Desplazar"}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(shuttle.frac * 100)}
            tabIndex={hasOverflow ? 0 : -1}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={endThumbDrag}
            onPointerCancel={endThumbDrag}
            onKeyDown={onThumbKey}
            className="absolute top-1/2 h-3.5 -translate-y-1/2 cursor-grab touch-none rounded-full bg-foreground/30 transition-colors duration-150 outline-none hover:bg-foreground/55 focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] active:cursor-grabbing active:bg-foreground/70"
            style={{ left: shuttle.x, width: shuttle.w }}
          />
        </div>
        <CarouselButton
          icon={ArrowRight01Icon}
          label="Siguiente"
          disabled={shuttle.frac >= 1}
          onClick={() => nudge(1)}
        />
      </div>
    </div>
  );
}

function CarouselButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  readonly icon: typeof ArrowLeft01Icon;
  readonly label: string;
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] disabled:pointer-events-none disabled:opacity-30"
    >
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} />
    </button>
  );
}
