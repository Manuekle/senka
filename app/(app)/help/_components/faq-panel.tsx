"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  ArrowDown01Icon,
  ArrowRight01Icon,
  Book02Icon,
  BubbleChatQuestionIcon,
  SearchIcon,
} from "@hugeicons/core-free-icons";
import { Card } from "@/app/_components/dashboard-card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleChip } from "@/components/ui/toggle-chip";
import { useToast } from "@/components/toast-provider";
import { fetchJson, uiErrorMessage } from "@/lib/api-error-message";
import { LIMITS, type QuestionView } from "@/lib/community";
import { FAQ_CATEGORIES, FAQ_ITEMS, faqMatches, type FaqCategory } from "@/lib/help-faq";
import { relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";

export function FaqPanel() {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FaqCategory | "all">("all");

  const items = useMemo(
    () =>
      FAQ_ITEMS.filter(
        (item) =>
          (category === "all" || item.category === category) &&
          faqMatches(query, t(`help.faq.${item.id}.q`), t(`help.faq.${item.id}.a`)),
      ),
    [category, query, t],
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section aria-labelledby="faq-title" className="min-w-0 space-y-4">
        <h2 id="faq-title" className="text-base font-semibold">
          {t("help.faqTitle")}
        </h2>
        <div className="relative">
          <HugeiconsIcon
            icon={SearchIcon}
            size={16}
            strokeWidth={1.75}
            className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={t("help.searchLabel")}
            placeholder={t("help.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <div role="group" className="flex flex-wrap gap-1.5" aria-label={t("help.faqTitle")}>
          {(["all", ...FAQ_CATEGORIES] as const).map((id) => (
            <ToggleChip key={id} selected={category === id} onClick={() => setCategory(id)}>
              {t(`help.category.${id}`)}
            </ToggleChip>
          ))}
        </div>

        {items.length === 0 ? (
          <Card>
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <p className="text-sm font-medium">{t("help.noResults", { query: query.trim() })}</p>
              <p className="max-w-xs text-xs text-muted-foreground">{t("help.noResultsHint")}</p>
            </div>
          </Card>
        ) : (
          <Card className="divide-y divide-border">
            {items.map((item) => (
              <Collapsible key={item.id} className="group/faq">
                <CollapsibleTrigger className="flex w-full items-center gap-3 px-5 py-4 text-left text-sm font-medium transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--ring)]">
                  <span className="min-w-0 flex-1">{t(`help.faq.${item.id}.q`)}</span>
                  <HugeiconsIcon
                    icon={ArrowDown01Icon}
                    size={16}
                    strokeWidth={1.75}
                    className="shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/faq:rotate-180"
                  />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="space-y-3 px-5 pb-5 text-sm leading-relaxed text-muted-foreground">
                    <p className="max-w-prose">{t(`help.faq.${item.id}.a`)}</p>
                    {item.link ? (
                      <Link
                        href={item.link.href}
                        className="inline-flex items-center gap-1 text-xs font-medium text-foreground underline-offset-4 hover:underline"
                      >
                        {t("help.openPage", { page: t(item.link.labelKey) })}
                        <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={1.75} />
                      </Link>
                    ) : null}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </Card>
        )}
      </section>

      <aside className="space-y-4">
        <Link
          href="/guide"
          className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 shadow-[var(--shadow-soft)] transition-colors hover:bg-accent/50"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={Book02Icon} size={16} strokeWidth={1.75} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">{t("help.guideTitle")}</span>
            <span className="block text-xs text-muted-foreground">{t("help.guideHint")}</span>
          </span>
        </Link>
        <AskQuestion />
      </aside>
    </div>
  );
}

function AskQuestion() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<QuestionView[]>([]);
  const [delivered, setDelivered] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    const result = await fetchJson<{ questions: QuestionView[]; delivered: boolean }>(
      "/api/community/questions",
      t,
    );
    if (result.ok) {
      setQuestions(result.data.questions);
      setDelivered(result.data.delivered);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (subject.trim().length < LIMITS.questionSubject.min) {
      setError(t("help.tooShort", { min: LIMITS.questionSubject.min }));
      return;
    }
    if (body.trim().length < LIMITS.questionBody.min) {
      setError(t("help.tooShort", { min: LIMITS.questionBody.min }));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await fetchJson<{ question: QuestionView }>("/api/community/questions", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ subject, body, locale }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(uiErrorMessage(t, result.error));
      return;
    }
    setSubject("");
    setBody("");
    setQuestions((current) => [result.data.question, ...current]);
    toast(
      delivered
        ? { title: t("help.askSent"), description: t("help.askSentDescription"), status: "success" }
        : { title: t("help.askSaved"), status: "success" },
    );
  };

  return (
    <Card className="p-4">
      <form onSubmit={(event) => void submit(event)} className="space-y-3" noValidate>
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
            <HugeiconsIcon icon={BubbleChatQuestionIcon} size={16} strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-medium">{t("help.askTitle")}</h2>
            {delivered === null ? null : (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {delivered ? t("help.askHint") : t("help.askHintLocal")}
              </p>
            )}
          </div>
        </div>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">{t("help.askSubject")}</span>
          <Input
            value={subject}
            onChange={(event) => {
              setSubject(event.target.value);
              setError(null);
            }}
            placeholder={t("help.askSubjectPlaceholder")}
            maxLength={LIMITS.questionSubject.max}
            disabled={busy}
            required
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium">{t("help.askBody")}</span>
          <Textarea
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
              setError(null);
            }}
            placeholder={t("help.askBodyPlaceholder")}
            rows={4}
            maxLength={LIMITS.questionBody.max}
            disabled={busy}
            required
          />
        </label>
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? t("help.sending") : t("help.askSubmit")}
        </Button>
      </form>

      {questions.length > 0 ? (
        <div className="mt-4 border-t border-border pt-3">
          <h3 className="mb-2 text-xs font-medium text-muted-foreground">{t("help.myQuestions")}</h3>
          <ul className="space-y-2">
            {questions.slice(0, 5).map((question) => (
              <li key={question.id} className="flex items-baseline justify-between gap-3 text-xs">
                <span className="min-w-0 truncate text-foreground" title={question.subject}>
                  {question.subject}
                </span>
                <time dateTime={question.createdAt} className="shrink-0 text-muted-foreground tabular-nums">
                  {relativeTime(question.createdAt, locale)}
                </time>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
