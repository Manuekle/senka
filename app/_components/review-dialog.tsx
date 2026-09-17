"use client";

import { useId, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { StarIcon } from "@hugeicons/core-free-icons";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/toast-provider";
import { useSound } from "@/components/sound-provider";
import { fetchJson, uiErrorMessage } from "@/lib/api-error-message";
import { LIMITS, type ReviewStatus, type ReviewView } from "@/lib/community";
import { useI18n } from "@/lib/i18n/provider";
import { StarRating } from "./star-rating";

// Stars and a few words about the app.
//
// Opened two ways: by the shell when a review is due, where dismissing it
// means "later", and from Help & Community whenever someone wants to, where it
// just means "cancel". The caller names the dismiss button and decides what
// dismissing does; this only collects and sends.
//
// Mount it keyed on each opening (see the call sites): a half-written review
// from the last time should not be waiting in it.

export function ReviewDialog({
  open,
  onOpenChange,
  dismissLabel,
  onDismiss,
  onSubmitted,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly dismissLabel: string;
  /** Called when it closes without a review — the button, Escape or the X. */
  readonly onDismiss?: () => void;
  readonly onSubmitted?: (review: ReviewView, status: ReviewStatus) => void;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { cue } = useSound();
  const ratingLabelId = useId();
  const ratingHintId = useId();
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = (submitted: boolean) => {
    if (!submitted) onDismiss?.();
    onOpenChange(false);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (rating < 1) {
      setError(t("review.ratingRequired"));
      return;
    }
    if (text.trim().length < LIMITS.reviewText.min) {
      setError(t("help.tooShort", { min: LIMITS.reviewText.min }));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await fetchJson<{ review: ReviewView; status: ReviewStatus }>(
      "/api/community/reviews",
      t,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rating, text, locale }),
      },
    );
    setBusy(false);
    if (!result.ok) {
      setError(uiErrorMessage(t, result.error));
      return;
    }
    cue("success");
    toast({ title: t("review.thanks"), description: t("review.thanksDescription"), status: "success" });
    onSubmitted?.(result.data.review, result.data.status);
    close(true);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : close(false))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={StarIcon} size={18} strokeWidth={1.75} />}>
            {t("review.title")}
          </DialogTitle>
          <DialogDescription>{t("review.description")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <div className="space-y-2">
            <span id={ratingLabelId} className="text-sm font-medium">
              {t("review.ratingLabel")}
            </span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <StarRating
                value={rating}
                onChange={(next) => {
                  setRating(next);
                  setError(null);
                }}
                disabled={busy}
                labelledBy={ratingLabelId}
                describedBy={ratingHintId}
              />
              <span id={ratingHintId} aria-live="polite" className="text-sm text-muted-foreground">
                {rating ? t(`review.rating.${rating}`) : null}
              </span>
            </div>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("review.text")}</span>
            <Textarea
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                setError(null);
              }}
              placeholder={t("review.textPlaceholder")}
              rows={4}
              maxLength={LIMITS.reviewText.max}
              disabled={busy}
              required
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
              {dismissLabel}
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? t("help.sending") : t("review.submit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
