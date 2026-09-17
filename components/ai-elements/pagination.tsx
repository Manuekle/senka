"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { ArrowLeft01Icon, ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useSound } from "@/components/sound-provider";
import { useT } from "@/lib/i18n/provider";
import { pageItems } from "@/lib/pagination";
import { cn } from "@/lib/utils";

export interface PaginationProps {
  readonly className?: string;
  readonly onPageChange: (page: number) => void;
  readonly onPageSizeChange?: (size: number) => void;
  /** 1-indexed. */
  readonly page: number;
  readonly pageCount: number;
  readonly pageSize?: number;
  readonly pageSizeOptions?: readonly number[];
}

/**
 * Page bar plus an optional rows-per-page control.
 *
 * Both sit on the same recessed track the segmented tabs use, so paging reads
 * as part of the same control family rather than as a stray row of links.
 * Prev/Next are raised pills at the ends; the current page is the one filled
 * element in the bar.
 */
export function Pagination({
  className,
  onPageChange,
  onPageSizeChange,
  page,
  pageCount,
  pageSize,
  pageSizeOptions = [5, 10, 20],
}: PaginationProps) {
  const t = useT();
  const { cue } = useSound();
  const showPages = pageCount > 1;
  const showSizes = pageSize !== undefined && onPageSizeChange !== undefined;
  const pagesRef = useRef<HTMLSpanElement>(null);
  const pagePillRef = useRef<HTMLSpanElement>(null);
  const pageRefs = useRef<Map<number, HTMLButtonElement>>(new Map());
  const hasPositionedPill = useRef(false);

  const positionPagePill = useCallback((animate: boolean) => {
    const pill = pagePillRef.current;
    const pages = pagesRef.current;
    const active = pageRefs.current.get(page);
    if (!pill || !pages) return;
    if (!active) {
      pill.style.transition = "none";
      pill.style.width = "0px";
      pill.style.transform = "translateX(0px)";
      return;
    }
    pill.style.transition = animate ? "" : "none";
    pill.style.width = `${active.offsetWidth}px`;
    // The pill and page buttons share `.t-pager-pages` as their offset parent.
    // Subtracting the parent offset here moved the indicator twice whenever
    // the pager sat inside a centered layout.
    pill.style.transform = `translateX(${active.offsetLeft}px)`;
    if (!animate) {
      void pill.offsetWidth;
      pill.style.transition = "";
    }
  }, [page]);

  useLayoutEffect(() => {
    if (!showPages) return;
    positionPagePill(hasPositionedPill.current);
    hasPositionedPill.current = true;
  }, [page, pageCount, positionPagePill, showPages]);

  useEffect(() => {
    if (!showPages || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => positionPagePill(false));
    if (pagesRef.current) observer.observe(pagesRef.current);
    return () => observer.disconnect();
  }, [positionPagePill, showPages]);

  // One page is not a choice — but the rows control still is, so the bar goes
  // and the size tabs stay.
  if (!showPages && !showSizes) return null;

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), pageCount);
    // Inside the guard, so Next on the last page — a button that is disabled
    // but still reachable by a stray click — stays as silent as it is inert.
    if (clamped !== page) {
      cue("page");
      onPageChange(clamped);
    }
  };

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      {showPages ? (
        <nav aria-label={t("pagination.label")} className="t-pager">
          <button
            aria-label={t("pagination.prev")}
            className="t-pager-edge"
            disabled={page <= 1}
            onClick={() => goTo(page - 1)}
            type="button"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
            <span className="hidden sm:inline">{t("pagination.prev")}</span>
          </button>

          <span className="t-pager-pages" ref={pagesRef}>
            <span ref={pagePillRef} className="t-pager-pill" aria-hidden="true" />
            {pageItems(page, pageCount).map((item, index) =>
              item === "gap" ? (
                <span
                  aria-hidden="true"
                  className="t-pager-gap"
                  // Gaps have no stable identity of their own; there are at
                  // most two and they never reorder among themselves.
                  key={`gap-${index}`}
                >
                  …
                </span>
              ) : (
                <button
                  aria-current={item === page ? "page" : undefined}
                  aria-label={t("pagination.page", { page: item })}
                  className="t-pager-page"
                  key={item}
                  onClick={() => goTo(item)}
                  ref={(element) => {
                    if (element) pageRefs.current.set(item, element);
                    else pageRefs.current.delete(item);
                  }}
                  type="button"
                >
                  {item}
                </button>
              ),
            )}
          </span>

          <button
            aria-label={t("pagination.next")}
            className="t-pager-edge"
            disabled={page >= pageCount}
            onClick={() => goTo(page + 1)}
            type="button"
          >
            <span className="hidden sm:inline">{t("pagination.next")}</span>
            <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} />
          </button>
        </nav>
      ) : null}

      {showSizes ? (
        <SlidingTabs
          onValueChange={(id) => onPageSizeChange(Number(id))}
          tabs={pageSizeOptions.map((size) => ({
            id: String(size),
            // Keep every option's label shape stable. Changing the selected
            // option from "20" to "20 rows" made the pill resize and looked
            // like the tab was wrapping the number only after selection.
            label: t("pagination.rows", { count: size }),
          }))}
          value={String(pageSize)}
        />
      ) : null}
    </div>
  );
}
