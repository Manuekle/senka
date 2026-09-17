"use client";

import { useCallback, useEffect, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { StarIcon } from "@hugeicons/core-free-icons";
import { Card } from "@/app/_components/dashboard-card";
import { ReviewDialog } from "@/app/_components/review-dialog";
import { StarsDisplay } from "@/app/_components/star-rating";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import { ErrorBanner } from "@/components/ui/error-banner";
import { fetchJson, type UiError } from "@/lib/api-error-message";
import type { ReviewStatus, ReviewSummary, ReviewView } from "@/lib/community";
import { relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

type ReviewsPayload = {
  readonly reviews: ReviewView[];
  readonly summary: ReviewSummary;
  readonly status: ReviewStatus;
};

export function ReviewsPanel() {
  const { t, locale } = useI18n();
  const [data, setData] = useState<ReviewsPayload | null>(null);
  const [error, setError] = useState<UiError | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  const load = useCallback(async () => {
    const result = await fetchJson<ReviewsPayload>("/api/community/reviews", t);
    if (result.ok) {
      setData(result.data);
      setError(null);
    } else {
      setError(result.error);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const openDialog = () => {
    setDialogKey((key) => key + 1);
    setOpen(true);
  };

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });

  const summary = data?.summary;
  const status = data?.status;
  const maxBucket = summary ? Math.max(1, ...summary.distribution) : 1;

  return (
    <section aria-labelledby="reviews-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="reviews-title" className="text-base font-semibold">
            {t("help.reviewsTitle")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("help.reviewsSubtitle")}</p>
        </div>
        <Button onClick={openDialog} className="self-start sm:self-auto">
          <HugeiconsIcon icon={StarIcon} size={16} strokeWidth={1.75} />
          {t("help.leaveReview")}
        </Button>
      </div>

      {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}

      {!data && !error ? (
        <Card className="space-y-3 p-5">
          <SkeletonBar className="h-8 w-24" />
          <SkeletonBar className="h-3 w-full" />
          <SkeletonBar className="h-3 w-2/3" />
        </Card>
      ) : null}

      {data && summary && status ? (
        <>
          <div className="grid gap-4 md:grid-cols-[260px_minmax(0,1fr)]">
            <Card className="p-5">
              <p className="text-xs font-medium text-muted-foreground">{t("help.reviewsAverage")}</p>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold tabular-nums">
                  {summary.average === null
                    ? "–"
                    : summary.average.toLocaleString(locale, { minimumFractionDigits: 1 })}
                </span>
                <span className="text-xs text-muted-foreground">
                  {summary.count === 1 ? t("help.reviewsCountOne") : t("help.reviewsCount", { count: summary.count })}
                </span>
              </div>
              {summary.average !== null ? <StarsDisplay rating={summary.average} className="mt-2" /> : null}
              <ul className="mt-4 space-y-1.5">
                {[5, 4, 3, 2, 1].map((stars) => {
                  const count = summary.distribution[stars - 1];
                  return (
                    <li
                      key={stars}
                      className="flex items-center gap-2 text-[11px] text-muted-foreground"
                      aria-label={t("help.distributionRow", { stars, count })}
                    >
                      <span aria-hidden="true" className="w-3 text-right tabular-nums">
                        {stars}
                      </span>
                      <span aria-hidden="true" className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <span
                          className="block h-full rounded-full bg-amber-400"
                          style={{ width: `${(count / maxBucket) * 100}%` }}
                        />
                      </span>
                      <span aria-hidden="true" className="w-5 tabular-nums">
                        {count}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card className="flex flex-col justify-center gap-1 p-5">
              <p className="text-sm font-medium">
                {status.due ? t("help.reviewDue") : t("help.nextReview", { date: date(status.nextAt) })}
              </p>
              {status.lastReviewedAt ? (
                <p className="text-xs text-muted-foreground">
                  {t("help.lastReview", { date: date(status.lastReviewedAt) })}
                </p>
              ) : null}
              {status.due ? (
                <Button variant="outline" size="sm" onClick={openDialog} className="mt-2 self-start">
                  {t("help.leaveReview")}
                </Button>
              ) : null}
            </Card>
          </div>

          {data.reviews.length === 0 ? (
            <Card>
              <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
                <p className="text-sm font-medium">{t("help.reviewsEmpty")}</p>
                <p className="max-w-xs text-xs text-muted-foreground">{t("help.reviewsEmptyHint")}</p>
              </div>
            </Card>
          ) : (
            <ul className="space-y-3">
              {data.reviews.map((review) => (
                <li key={review.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StarsDisplay rating={review.rating} />
                      <span className="text-[11px] text-muted-foreground">
                        {review.mine ? `${t("help.yours")} · ` : null}
                        <time dateTime={review.createdAt}>{relativeTime(review.createdAt, locale)}</time>
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed whitespace-pre-line break-words">{review.text}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : null}

      <ReviewDialog
        key={dialogKey}
        open={open}
        onOpenChange={setOpen}
        dismissLabel={t("common.cancel")}
        onSubmitted={() => void load()}
      />
    </section>
  );
}
