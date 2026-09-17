"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import { Add01Icon, Delete01Icon, Idea01Icon, ThumbsUpIcon } from "@hugeicons/core-free-icons";
import { Card } from "@/app/_components/dashboard-card";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { SkeletonBar } from "@/components/ai-elements/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorBanner } from "@/components/ui/error-banner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import { useSound } from "@/components/sound-provider";
import { fetchJson, uiErrorMessage, type UiError } from "@/lib/api-error-message";
import {
  IDEA_CATEGORIES,
  LIMITS,
  sortIdeas,
  type IdeaCategory,
  type IdeaSort,
  type IdeaView,
} from "@/lib/community";
import { relativeTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

export function IdeasPanel() {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { cue } = useSound();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const [ideas, setIdeas] = useState<IdeaView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);
  const [sort, setSort] = useState<IdeaSort>("top");
  const [category, setCategory] = useState<IdeaCategory | "all">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  const load = useCallback(async () => {
    const result = await fetchJson<{ ideas: IdeaView[] }>("/api/community/ideas", t);
    if (result.ok) {
      setIdeas(result.data.ideas);
      setError(null);
    } else {
      setError(result.error);
    }
    setLoading(false);
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  // A like must not make the list jump under the pointer, so the order is
  // recomputed only when the sort changes or an idea arrives or leaves — not
  // when a count moves. Derived during render, so a fresh list never paints
  // unsorted for a frame first.
  const orderKey = `${sort}:${ideas.map((idea) => idea.id).join(",")}`;
  const [order, setOrder] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  if (order.key !== orderKey) {
    setOrder({ key: orderKey, ids: sortIdeas(ideas, sort).map((idea) => idea.id) });
  }

  const visible = useMemo(() => {
    const byId = new Map(ideas.map((idea) => [idea.id, idea]));
    return order.ids
      .map((id) => byId.get(id))
      .filter((idea): idea is IdeaView => Boolean(idea))
      .filter((idea) => category === "all" || idea.category === category);
  }, [category, ideas, order]);

  const vote = async (idea: IdeaView) => {
    const voted = !idea.voted;
    if (voted) cue("success");
    const optimistic = { ...idea, voted, votes: idea.votes + (voted ? 1 : -1) };
    setIdeas((current) => current.map((entry) => (entry.id === idea.id ? optimistic : entry)));
    const result = await fetchJson<{ idea: IdeaView }>("/api/community/ideas", t, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: idea.id, voted }),
    });
    if (result.ok) {
      setIdeas((current) => current.map((entry) => (entry.id === idea.id ? result.data.idea : entry)));
    } else {
      setIdeas((current) => current.map((entry) => (entry.id === idea.id ? idea : entry)));
      toast({ title: uiErrorMessage(t, result.error), status: "error" });
    }
  };

  const remove = async (idea: IdeaView) => {
    const ok = await confirm({
      title: t("help.deleteIdeaConfirm", { title: idea.title }),
      description: t("help.deleteIdeaBody"),
      confirmLabel: t("common.delete"),
    });
    if (!ok) return;
    const result = await fetchJson(`/api/community/ideas?id=${encodeURIComponent(idea.id)}`, t, {
      method: "DELETE",
    });
    if (result.ok) {
      cue("droplet");
      setIdeas((current) => current.filter((entry) => entry.id !== idea.id));
      toast({ title: t("common.deleted") });
    } else {
      toast({ title: uiErrorMessage(t, result.error), status: "error" });
    }
  };

  const openDialog = () => {
    setDialogKey((key) => key + 1);
    setDialogOpen(true);
  };

  return (
    <section aria-labelledby="ideas-title" className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="ideas-title" className="text-base font-semibold">
            {t("help.ideasTitle")}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">{t("help.ideasSubtitle")}</p>
        </div>
        <Button onClick={openDialog} className="self-start sm:self-auto">
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
          {t("help.newIdea")}
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SlidingTabs
          tabs={[
            { id: "top", label: t("help.sortTop") },
            { id: "new", label: t("help.sortNew") },
          ]}
          value={sort}
          onValueChange={(next) => setSort(next as IdeaSort)}
        />
        <Select value={category} onValueChange={(next) => setCategory(next as IdeaCategory | "all")}>
          <SelectTrigger aria-label={t("help.filterCategory")} className="w-full sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("help.category.all")}</SelectItem>
            {IDEA_CATEGORIES.map((id) => (
              <SelectItem key={id} value={id}>
                {t(`help.ideaCategory.${id}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {error ? <ErrorBanner error={error} onRetry={() => void load()} /> : null}

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Card key={index} className="flex gap-4 p-4">
              <SkeletonBar className="h-14 w-12 rounded-xl" />
              <div className="flex-1 space-y-2">
                <SkeletonBar className="h-4 w-1/2" />
                <SkeletonBar className="h-3 w-3/4" />
              </div>
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
            <div className="flex size-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
              <HugeiconsIcon icon={Idea01Icon} size={20} strokeWidth={1.75} />
            </div>
            {ideas.length === 0 ? (
              <>
                <p className="text-sm font-medium">{t("help.ideasEmpty")}</p>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  {t("help.ideasEmptyHint")}
                </p>
                <Button variant="outline" size="sm" onClick={openDialog}>
                  {t("help.newIdea")}
                </Button>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">{t("help.ideasFilteredEmpty")}</p>
            )}
          </div>
        </Card>
      ) : (
        <ul className="space-y-3">
          {visible.map((idea) => (
            <li key={idea.id}>
              <Card className="flex items-start gap-4 p-4">
                <button
                  type="button"
                  onClick={() => void vote(idea)}
                  aria-pressed={idea.voted}
                  aria-label={
                    idea.voted
                      ? t("help.unlikeIdea", { title: idea.title })
                      : t("help.likeIdea", { title: idea.title })
                  }
                  className={cn(
                    "flex w-12 shrink-0 flex-col items-center gap-0.5 rounded-xl border py-2 text-xs font-semibold tabular-nums",
                    "transition-[background-color,border-color,color,transform] duration-150 active:scale-95",
                    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--ring)]",
                    idea.voted
                      ? "border-primary/40 bg-primary/10 text-foreground"
                      : "border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <HugeiconsIcon icon={ThumbsUpIcon} size={16} strokeWidth={idea.voted ? 2.25 : 1.75} />
                  {idea.votes}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-medium leading-snug break-words">{idea.title}</h3>
                    {idea.mine ? (
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("help.deleteIdea", { title: idea.title })}
                        onClick={() => void remove(idea)}
                        className="-mt-1 -mr-1 shrink-0"
                      >
                        <HugeiconsIcon icon={Delete01Icon} size={15} strokeWidth={1.75} />
                      </Button>
                    ) : null}
                  </div>
                  {idea.body ? (
                    <p className="mt-1 text-xs leading-relaxed whitespace-pre-line text-muted-foreground break-words">
                      {idea.body}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="rounded-md bg-muted px-1.5 py-0.5">
                      {t(`help.ideaCategory.${idea.category}`)}
                    </span>
                    {idea.mine ? <span>{t("help.yours")}</span> : null}
                    <span aria-hidden="true">·</span>
                    <time dateTime={idea.createdAt}>{relativeTime(idea.createdAt, locale)}</time>
                  </div>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <IdeaDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(idea) => {
          setIdeas((current) => [idea, ...current]);
          setSort("new");
          setCategory("all");
        }}
      />
      {confirmDialog}
    </section>
  );
}

function IdeaDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onCreated: (idea: IdeaView) => void;
}) {
  const { t, locale } = useI18n();
  const { toast } = useToast();
  const { cue } = useSound();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<IdeaCategory>("other");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (title.trim().length < LIMITS.ideaTitle.min) {
      setError(t("help.tooShort", { min: LIMITS.ideaTitle.min }));
      return;
    }
    setBusy(true);
    setError(null);
    const result = await fetchJson<{ idea: IdeaView }>("/api/community/ideas", t, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title, body, category, locale }),
    });
    setBusy(false);
    if (!result.ok) {
      setError(uiErrorMessage(t, result.error));
      return;
    }
    cue("success");
    toast({ title: t("help.ideaCreated"), status: "success" });
    onCreated(result.data.idea);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={Idea01Icon} size={18} strokeWidth={1.75} />}>
            {t("help.ideaDialogTitle")}
          </DialogTitle>
          <DialogDescription>{t("help.ideaDialogDescription")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-4" noValidate>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("help.ideaTitle")}</span>
            <Input
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                setError(null);
              }}
              placeholder={t("help.ideaTitlePlaceholder")}
              maxLength={LIMITS.ideaTitle.max}
              autoComplete="off"
              disabled={busy}
              required
            />
          </label>
          <div className="space-y-1.5">
            <span id="idea-category-label" className="text-sm font-medium">
              {t("help.ideaCategory")}
            </span>
            <Select value={category} onValueChange={(next) => setCategory(next as IdeaCategory)} disabled={busy}>
              <SelectTrigger aria-labelledby="idea-category-label" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {IDEA_CATEGORIES.map((id) => (
                  <SelectItem key={id} value={id}>
                    {t(`help.ideaCategory.${id}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">{t("help.ideaBody")}</span>
            <Textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder={t("help.ideaBodyPlaceholder")}
              rows={4}
              maxLength={LIMITS.ideaBody.max}
              disabled={busy}
            />
          </label>
          {error ? (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={busy}>
                {t("common.cancel")}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {busy ? t("help.sending") : t("help.ideaSubmit")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
