"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  LibraryIcon,
  File01Icon,
  AlertCircleIcon,
  SearchIcon,
  AiWiperIcon,
  ArrowLeft01Icon,
  Delete02Icon,
  Image01Icon,
  MoreHorizontalIcon,
  FolderAddIcon,
  GlobalEducationIcon,
} from "@hugeicons/core-free-icons";
import { GoogleDriveBrandIcon } from "@/components/icons/connection-icons";
import {
  FileUpload,
  type FileUploadItem,
} from "@/components/motion/file-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton, SkeletonBar } from "@/components/ai-elements/skeleton";
import { SlidingTabs } from "@/components/ai-elements/sliding-tabs";
import { useI18n } from "@/lib/i18n/provider";
import { fetchJson, isApiError, networkUiError, readApiError, type UiError } from "@/lib/api-error-message";
import { ErrorBanner } from "@/components/ui/error-banner";
import { useSound } from "@/components/sound-provider";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import type { KnowledgeDocument, KnowledgeMatch } from "@/lib/knowledge-store";
import type { AgentSkill } from "@/lib/types";
import type { MediaAssetMatch } from "@/lib/media-store";
import { PageContainer } from "../../_components/page-container";
import { KpiCard, KpiSplit } from "../../_components/kpi-card";
import {
  Card,
} from "../../_components/dashboard-card";
import { CardCarousel } from "../../_components/card-carousel";
import { FolderArt, FolderDialog, FolderGrid, type FolderSummary } from "./_components/folder-grid";
import { MediaLibrary } from "./_components/media-library";
import { BusinessCard } from "./_components/business-card";
import { Spinner } from "@/components/ui/spinner";

type EmbeddingStatus =
  | { available: true; model: string; route: "openai" | "gateway" }
  | { available: false };

type Limits = { maxFileBytes: number; accept: string };

type Tab = "documents" | "media";

const TABS = ["documents", "media"] as const;

const DEFAULT_LIMITS: Limits = { maxFileBytes: 20 * 1024 * 1024, accept: ".pdf,.txt,.md,.csv,.json" };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`;
}

export default function KnowledgePage() {
  const { t } = useI18n();
  const { cue } = useSound();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();

  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [embeddings, setEmbeddings] = useState<EmbeddingStatus>({ available: true, model: "", route: "openai" });
  const [limits, setLimits] = useState<Limits>(DEFAULT_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<UiError | null>(null);

  // `null` is the root of the library. Folders are shared with the media
  // side, so opening one narrows both lists at once.
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("documents");
  const [folderDialog, setFolderDialog] = useState<{ open: boolean; folder: FolderSummary | null }>({
    open: false,
    folder: null,
  });

  // The ingest queue, controlled so each row's status tracks the real
  // request rather than an animation.
  const [queue, setQueue] = useState<FileUploadItem[]>([]);
  const [syncingDrive, setSyncingDrive] = useState(false);

  // Which documents have already been promoted into a skill, so the menu can
  // offer the action once and then link to the result instead of making a
  // second near-identical skill.
  const [skillByDoc, setSkillByDoc] = useState<Record<string, AgentSkill>>({});
  const [promoting, setPromoting] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<KnowledgeMatch[] | null>(null);
  const [mediaMatches, setMediaMatches] = useState<MediaAssetMatch[] | null>(null);
  const [searching, setSearching] = useState(false);

  const folderIdRef = useRef(folderId);
  folderIdRef.current = folderId;

  const loadFolders = useCallback(async () => {
    try {
      const res = await fetch("/api/media/folders");
      if (!res.ok) return;
      const data = (await res.json()) as { folders?: FolderSummary[] };
      setFolders(data.folders ?? []);
    } catch {
      // The folder bar is an organizational nicety; a failure here must not
      // take the documents down with it.
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const res = await fetch("/api/knowledge");
      if (!res.ok) throw new Error("load failed");
      const data = (await res.json()) as {
        documents?: KnowledgeDocument[];
        embeddings?: EmbeddingStatus;
        limits?: Limits;
      };
      setDocuments(data.documents ?? []);
      if (data.embeddings) setEmbeddings(data.embeddings);
      if (data.limits) setLimits(data.limits);
    } catch {
      setError({ messageKey: "knowledge.loadFailed" });
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * The skills already promoted from a document, indexed by that document's
   * id. Read once here rather than per row: the menu needs it to decide
   * between "convertir" and "ya es una habilidad", and six rows asking the
   * same endpoint six times would be six requests for one answer.
   */
  const loadSkills = useCallback(async () => {
    try {
      const res = await fetch("/api/skills");
      if (!res.ok) return;
      const data = (await res.json()) as { skills?: AgentSkill[] };
      const byDoc: Record<string, AgentSkill> = {};
      for (const skill of data.skills ?? []) {
        if (skill.documentId) byDoc[skill.documentId] = skill;
      }
      setSkillByDoc(byDoc);
    } catch {
      // The menu simply offers "convertir" again; the API refuses a duplicate.
    }
  }, []);

  /**
   * Turn one document into a skill.
   *
   * The model rewrites it — see app/api/skills/from-document/route.ts for why
   * a copy would be the wrong thing — so this is slow enough to need its own
   * pending state on the row, and the result always lands disabled. The toast
   * says so and points at where to review it.
   */
  const promoteToSkill = useCallback(
    async (doc: KnowledgeDocument) => {
      setPromoting(doc.id);
      const result = await fetchJson<{ skill?: AgentSkill }>("/api/skills/from-document", t, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: doc.id }),
      });
      setPromoting(null);
      if (!result.ok) {
        toast({
          title: isApiError(result.error) ? result.error.message : t(result.error.messageKey),
          status: "error",
        });
        return;
      }
      await loadSkills();
      cue("success");
      toast({
        title: `"${result.data.skill?.name ?? doc.name}" quedó como habilidad`,
        description: "Está apagada hasta que la revises en Habilidades.",
        status: "success",
      });
    },
    [cue, loadSkills, t, toast],
  );

  useEffect(() => {
    void loadDocuments();
    void loadFolders();
    void loadSkills();
  }, [loadDocuments, loadFolders, loadSkills]);

  const patchQueueItem = useCallback((id: string, patch: Partial<FileUploadItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const upload = useCallback(
    (item: FileUploadItem) => {
      const file = item.file;
      if (!file) return;

      const form = new FormData();
      form.append("file", file);
      // Read through the ref: the request outlives the render it started in,
      // and a document must land in the folder that was open when it was
      // dropped, not wherever the user navigated meanwhile.
      form.append("folderId", folderIdRef.current ?? "root");

      const request = new XMLHttpRequest();
      request.open("POST", "/api/knowledge");

      // The transfer is only half the work — the server still has to extract
      // and embed — so the bar tops out at 90% until the response lands.
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        patchQueueItem(item.id, {
          status: "uploading",
          progress: Math.round((event.loaded / event.total) * 90),
        });
      };

      request.onload = () => {
        let payload: { documents?: KnowledgeDocument[]; failed?: { name: string; error: string }[] } = {};
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          /* handled below by the empty-documents check */
        }

        const failure = payload.failed?.[0];
        if (request.status >= 400 || failure) {
          patchQueueItem(item.id, {
            status: "error",
            progress: 0,
            error: failure?.error ?? t("knowledge.uploadFailed"),
          });
          return;
        }

        cue("success");
        patchQueueItem(item.id, { status: "success", progress: 100 });
        void loadDocuments();
        void loadFolders();
        // The document now shows in the library below, so the queue row would
        // be a duplicate — let the success state read, then drop it.
        setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.id !== item.id)), 1400);
      };

      request.onerror = () => {
        patchQueueItem(item.id, { status: "error", progress: 0, error: t("knowledge.uploadFailed") });
      };

      patchQueueItem(item.id, { status: "uploading", progress: 0 });
      request.send(form);
    },
    [cue, loadDocuments, loadFolders, patchQueueItem, t],
  );

  const handleFilesAdded = useCallback(
    (added: FileUploadItem[]) => {
      for (const item of added) upload(item);
    },
    [upload],
  );

  const handleDriveSync = useCallback(async () => {
    setSyncingDrive(true);
    try {
      // `not_configured` comes back as HTTP 200 (see lib/api-error.ts) — it's
      // a state, not a broken request — so a plain `fetch`/`res.ok` check
      // reads its error body as a success payload and crashes on the missing
      // `imported`/`skipped`/`errors` fields. `fetchJson` already checks the
      // body for an error shape on 2xx responses too.
      const result = await fetchJson<{
        imported: number;
        skipped: { name: string; reason: string }[];
        errors: { name: string; error: string }[];
      }>("/api/knowledge/drive-sync", t, { method: "POST" });
      if (!result.ok) {
        if (isApiError(result.error) && result.error.code === "not_configured") {
          toast({
            title: t("knowledge.driveSyncNotConfigured"),
            description: t("knowledge.driveSyncNotConfiguredHint"),
            status: "error",
          });
        } else {
          setError(result.error);
        }
        return;
      }
      const data = result.data;
      // A sync that dropped files is a recoverable failure, not a dismissal —
      // `droplet` is the collapse/discard cue and read as "fine, gone".
      cue(data.errors.length > 0 ? "error" : "success");
      toast({
        title: t("knowledge.driveSyncDone"),
        description: t("knowledge.driveSyncSummary", {
          imported: String(data.imported),
          skipped: String(data.skipped.length),
          errors: String(data.errors.length),
        }),
        status: data.errors.length > 0 ? "error" : "success",
      });
      await Promise.all([loadDocuments(), loadFolders()]);
    } finally {
      setSyncingDrive(false);
    }
  }, [cue, loadDocuments, loadFolders, t, toast]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (!(await confirm({ title: t("knowledge.confirmDelete") }))) return;
      cue("droplet");
      const previous = documents;
      setDocuments((prev) => prev.filter((doc) => doc.id !== id));
      try {
        const res = await fetch(`/api/knowledge?id=${encodeURIComponent(id)}`, { method: "DELETE" });
        if (!res.ok) {
          setDocuments(previous);
          setError({ messageKey: "knowledge.deleteFailed" });
          toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
        } else {
          void loadFolders();
          toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
        }
      } catch {
        setDocuments(previous);
        setError({ messageKey: "knowledge.deleteFailed" });
        toast({ title: t("common.somethingWentWrong"), description: t("common.somethingWentWrongDescription"), status: "error" });
      }
    },
    [confirm, cue, documents, loadFolders, t, toast],
  );

  const handleMoveDocument = useCallback(
    async (id: string, target: string | null) => {
      const previous = documents;
      setDocuments((prev) =>
        prev.map((doc) => (doc.id === id ? { ...doc, folder_id: target } : doc)),
      );
      try {
        const res = await fetch("/api/knowledge", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, folder_id: target }),
        });
        if (!res.ok) throw new Error("move failed");
        void loadFolders();
      } catch {
        setDocuments(previous);
        toast({
          title: t("common.somethingWentWrong"),
          description: t("common.somethingWentWrongDescription"),
          status: "error",
        });
      }
    },
    [documents, loadFolders, t, toast],
  );

  const handleSaveFolder = useCallback(
    async (values: { name: string; description: string }) => {
      const editing = folderDialog.folder;
      setFolderDialog({ open: false, folder: null });
      try {
        const res = await fetch("/api/media/folders", {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editing ? { id: editing.id, ...values } : values),
        });
        if (!res.ok) {
          setError(await readApiError(res, t));
          return;
        }
        cue("success");
        await loadFolders();
      } catch (err) {
        setError(networkUiError(err));
      }
    },
    [cue, folderDialog.folder, loadFolders, t],
  );

  const handleDeleteFolder = useCallback(
    async (folder: FolderSummary) => {
      const ok = await confirm({
        title: t("knowledge.folderConfirmDelete", { name: folder.name }),
        description: t("knowledge.folderConfirmDeleteHint"),
      });
      if (!ok) return;
      cue("droplet");
      try {
        const res = await fetch(`/api/media/folders?id=${encodeURIComponent(folder.id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("delete failed");
        if (folderIdRef.current === folder.id) setFolderId(null);
        await Promise.all([loadFolders(), loadDocuments()]);
        toast({ title: t("common.deleted"), description: t("knowledge.folderDeletedDescription"), status: "success" });
      } catch {
        toast({
          title: t("common.somethingWentWrong"),
          description: t("common.somethingWentWrongDescription"),
          status: "error",
        });
      }
    },
    [confirm, cue, loadDocuments, loadFolders, t, toast],
  );

  const runSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true);
    setError(null);
    try {
      // Documents and media are searched together: the owner testing "fotos
      // del sillón" wants to see what the agent would reach for, and the
      // agent has both tools available on the same question.
      const [knowledgeRes, mediaRes] = await Promise.all([
        fetch("/api/knowledge/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, limit: 5 }),
        }),
        fetch("/api/media/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, limit: 6 }),
        }),
      ]);

      setMediaMatches(
        mediaRes.ok ? (((await mediaRes.json()) as { matches?: MediaAssetMatch[] }).matches ?? []) : [],
      );

      if (!knowledgeRes.ok) {
        setMatches([]);
        // The server's own wording is English-only; `readApiError` maps its
        // code onto copy that exists in both languages.
        setError(await readApiError(knowledgeRes, t));
        return;
      }
      const data = (await knowledgeRes.json()) as { matches?: KnowledgeMatch[] };
      setMatches(data.matches ?? []);
    } catch (err) {
      setMatches([]);
      setMediaMatches([]);
      setError(networkUiError(err));
    } finally {
      setSearching(false);
    }
  }, [query, t]);

  const activeFolder = useMemo(
    () => folders.find((folder) => folder.id === folderId) ?? null,
    [folders, folderId],
  );

  // A document whose folder was deleted reads as root, matching how the
  // store answers for an unknown id.
  const knownFolderIds = useMemo(() => new Set(folders.map((f) => f.id)), [folders]);
  const visibleDocuments = useMemo(
    () =>
      documents.filter((doc) => {
        const filed = doc.folder_id && knownFolderIds.has(doc.folder_id) ? doc.folder_id : null;
        return filed === folderId;
      }),
    [documents, folderId, knownFolderIds],
  );

  const totalChunks = useMemo(
    () => documents.reduce((sum, doc) => sum + doc.chunks, 0),
    [documents],
  );
  const totalAssets = useMemo(
    () => folders.reduce((sum, folder) => sum + folder.assets, 0),
    [folders],
  );

  return (
    <PageContainer maxWidth="max-w-6xl" pattern="grid">
      {confirmDialog}
      <Skeleton className="min-h-[500px]" isLoading={isLoading} skeleton={<KnowledgeSkeleton />}>
        <div className="content-enter">
          <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{t("knowledge.title")}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{t("knowledge.subtitle")}</p>
            </div>
          </header>

          {!embeddings.available ? (
            <Card className="mb-6 border-amber-500/40">
              <div className="flex items-start gap-3 px-5 py-4">
                <HugeiconsIcon
                  icon={AlertCircleIcon}
                  size={18}
                  strokeWidth={1.75}
                  className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t("knowledge.embeddingsOff")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("knowledge.embeddingsOffHint")}
                  </p>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href="/settings">{t("knowledge.embeddingsOffCta")}</Link>
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}

          <ErrorBanner className="mb-4" error={error} onDismiss={() => setError(null)} />

          {documents.length > 0 || totalAssets > 0 ? (
            <CardCarousel label="Estadísticas de conocimiento">
              <div className="mb-6 flex items-stretch gap-4" style={{ paddingInline: "2px" }}>
                {/* The split bar is every document's share of the chunk
                    count. Two documents and 400 chunks is one file carrying
                    the base and one file that barely registers, and the split
                    is the only thing on the page that says so. */}
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={LibraryIcon}
                    label={t("knowledge.kpiDocuments")}
                    value={documents.length}
                    sub={t(documents.length > 0 ? "knowledge.kpiDocumentsSub" : "knowledge.kpiDocumentsSubNone")}
                    visual={
                      <KpiSplit
                        parts={documents.map((doc) => ({
                          tone: "neutral" as const,
                          value: doc.chunks,
                        }))}
                      />
                    }
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={File01Icon}
                    label={t("knowledge.kpiChunks")}
                    sub={t("knowledge.kpiChunksSub", {
                      value: String(
                        documents.length > 0 ? Math.round(totalChunks / documents.length) : 0,
                      ),
                    })}
                    value={totalChunks}
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={Image01Icon}
                    label={t("knowledge.kpiMedia")}
                    value={totalAssets}
                    sub={t("knowledge.kpiMediaSub", { count: String(folders.length) })}
                  />
                </div>
                <div className="min-w-[200px] flex-1">
                  <KpiCard
                    icon={AiWiperIcon}
                    label={t("knowledge.kpiEmbeddings")}
                    value={embeddings.available ? embeddings.route : "—"}
                    sub={embeddings.available
                      ? embeddings.model || t("knowledge.kpiEmbeddingsSub")
                      : t("knowledge.embeddingsOff")}
                  />
                </div>
              </div>
            </CardCarousel>
          ) : null}

          <BusinessCard />

          <div className="mb-6 rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
            <div className="flex flex-col">
              <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <HugeiconsIcon icon={FolderAddIcon} size={17} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{t("knowledge.foldersTitle")}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("knowledge.foldersDescription")}</p>
                  </div>
                </div>
                <div className="mx-5 h-px bg-border/50" />
                <div className="px-5 py-4">
                  {activeFolder ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setFolderId(null)}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
                      >
                        <HugeiconsIcon icon={ArrowLeft01Icon} size={14} strokeWidth={2} />
                        {t("knowledge.folderBack")}
                      </button>
                      <img
                        src="/frames/folder_blue.svg"
                        alt=""
                        aria-hidden
                        className="h-9 w-auto shrink-0"
                      />
                      <div className="min-w-0 flex-1 basis-40">
                        <p className="text-sm font-medium">{activeFolder.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {activeFolder.description ||
                            t("knowledge.folderContents", {
                              documents: String(activeFolder.documents),
                              assets: String(activeFolder.assets),
                            })}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <FolderGrid
                      folders={folders}
                      onOpen={setFolderId}
                      onCreate={() => setFolderDialog({ open: true, folder: null })}
                      onRename={(folder) => setFolderDialog({ open: true, folder })}
                      onDelete={(folder) => void handleDeleteFolder(folder)}
                    />
                  )}
                </div>
              </div>
              {/* Actions row */}
              <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2 pb-0.5">
                {activeFolder ? (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFolderDialog({ open: true, folder: activeFolder })}
                  >
                    {t("knowledge.folderRename")}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setFolderDialog({ open: true, folder: null })}
                  >
                    <HugeiconsIcon icon={FolderAddIcon} size={14} strokeWidth={1.75} />
                    {t("knowledge.foldersTitle")}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Two lists over the same folder: text the agent quotes, and files
              the agent sends. Same segmented bar the chat history uses for its
              channel filters, so switching a list looks the same everywhere. */}
          <div className="mb-6 rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
            <div className="flex flex-col">
              <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <HugeiconsIcon
                      icon={tab === "documents" ? LibraryIcon : Image01Icon}
                      size={17}
                      strokeWidth={1.75}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">
                      {activeFolder
                        ? t("knowledge.inFolderTitle", { name: activeFolder.name })
                        : tab === "documents"
                          ? t("knowledge.libraryTitle")
                          : t("knowledge.mediaTitle")}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {tab === "documents"
                        ? t("knowledge.libraryDescription")
                        : t("knowledge.mediaDescription")}
                    </p>
                  </div>
                </div>
                {/* Tabs bar lives inside the card, below the header */}
                <div className="px-5 pb-4">
                  <SlidingTabs
                    tabs={TABS.map((value) => ({
                      id: value,
                      label: value === "documents" ? t("knowledge.tabDocuments") : t("knowledge.tabMedia"),
                    }))}
                    value={tab}
                    onValueChange={(value) => setTab(value as Tab)}
                  />
                </div>
                <div className="mx-5 h-px bg-border/50" />

                <div className="px-5 py-5">
                  {tab === "documents" ? (
                    <div className="space-y-5">
                      <FileUpload
                        value={queue}
                        onValueChange={setQueue}
                        onFilesAdded={handleFilesAdded}
                        onRetry={upload}
                        accept={limits.accept}
                        disabled={!embeddings.available}
                        title={t("knowledge.uploadTitle")}
                        description={t("knowledge.uploadDescription", {
                          size: formatBytes(limits.maxFileBytes),
                        })}
                        browseLabel={t("knowledge.browse")}
                      />

                      {visibleDocuments.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-8 text-center">
                          <FolderArt className="w-20" />
                          <p className="text-sm font-medium">{t("knowledge.libraryEmpty")}</p>
                          <p className="max-w-xs text-xs text-muted-foreground">
                            {t("knowledge.libraryEmptyHint")}
                          </p>
                        </div>
                      ) : (
                        <ul className="space-y-2">
                          {visibleDocuments.map((doc) => (
                            <li
                              key={doc.id}
                              className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5"
                            >
                              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                                <HugeiconsIcon icon={File01Icon} size={15} strokeWidth={1.75} />
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{doc.name}</p>
                                <p className="text-xs tabular-nums text-muted-foreground">
                                  {formatBytes(doc.size)} ·{" "}
                                  {t("knowledge.chunksCount", { count: String(doc.chunks) })}
                                </p>
                              </div>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <button
                                    type="button"
                                    aria-label={t("knowledge.docActions")}
                                    className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                                  >
                                    <HugeiconsIcon icon={MoreHorizontalIcon} size={15} strokeWidth={2} />
                                  </button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  {skillByDoc[doc.id] ? (
                                    <DropdownMenuItem asChild>
                                      <Link href="/skills">
                                        <HugeiconsIcon
                                          icon={GlobalEducationIcon}
                                          size={15}
                                          strokeWidth={1.75}
                                        />
                                        Ya es una habilidad
                                      </Link>
                                    </DropdownMenuItem>
                                  ) : (
                                    <DropdownMenuItem
                                      disabled={promoting !== null}
                                      onSelect={(event) => {
                                        event.preventDefault();
                                        void promoteToSkill(doc);
                                      }}
                                    >
                                      <HugeiconsIcon
                                        icon={GlobalEducationIcon}
                                        size={15}
                                        strokeWidth={1.75}
                                      />
                                      {promoting === doc.id
                                        ? "Convirtiendo…"
                                        : "Convertir en habilidad"}
                                    </DropdownMenuItem>
                                  )}
                                  <DropdownMenuSeparator />
                                  <DropdownMenuSub>
                                    <DropdownMenuSubTrigger>
                                      {t("knowledge.moveToFolder")}
                                    </DropdownMenuSubTrigger>
                                    <DropdownMenuSubContent>
                                      <DropdownMenuItem
                                        disabled={!doc.folder_id}
                                        onSelect={() => void handleMoveDocument(doc.id, null)}
                                      >
                                        {t("knowledge.folderRoot")}
                                      </DropdownMenuItem>
                                      {folders.map((folder) => (
                                        <DropdownMenuItem
                                          key={folder.id}
                                          disabled={doc.folder_id === folder.id}
                                          onSelect={() => void handleMoveDocument(doc.id, folder.id)}
                                        >
                                          {folder.name}
                                        </DropdownMenuItem>
                                      ))}
                                    </DropdownMenuSubContent>
                                  </DropdownMenuSub>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    variant="destructive"
                                    onSelect={() => void handleDelete(doc.id)}
                                  >
                                    <HugeiconsIcon icon={Delete02Icon} size={15} strokeWidth={1.75} />
                                    {t("common.delete")}
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : (
                    <MediaLibrary
                      key={folderId ?? "root"}
                      folderId={folderId}
                      folders={folders}
                      onChanged={() => void loadFolders()}
                    />
                  )}
                </div>
              </div>
              {/* Bottom actions row */}
              <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2 pb-0.5">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDriveSync()}
                  disabled={syncingDrive}
                >
                  {syncingDrive ? (
                    <Spinner size={15} />
                  ) : (
                    <GoogleDriveBrandIcon size={15} />
                  )}
                  {t("knowledge.driveSyncButton")}
                </Button>
                {documents.length > 0 ? (
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium shadow-[var(--shadow-inset)]">
                    <HugeiconsIcon
                      icon={LibraryIcon}
                      size={14}
                      strokeWidth={1.75}
                      className="text-muted-foreground"
                    />
                    <span>
                      <span className="tabular-nums">{documents.length}</span>{" "}
                      {t("knowledge.docsWord")}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="rounded-[20px] border border-border/70 bg-muted/50 p-1.5 shadow-[var(--shadow-float)]">
            <div className="flex flex-col">
              <div className="overflow-hidden rounded-[14px] border border-border/50 bg-card shadow-xs">
                <div className="flex items-start gap-3 px-5 pt-5 pb-4">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-muted-foreground shadow-[var(--shadow-inset)]">
                    <HugeiconsIcon icon={AiWiperIcon} size={17} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-medium">{t("knowledge.searchTitle")}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("knowledge.searchDescription")}</p>
                  </div>
                </div>
                <div className="mx-5 h-px bg-border/50" />
                <div className="space-y-4 px-5 py-4">
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void runSearch();
                    }}
                  >
                    <div className="relative flex-1">
                      <HugeiconsIcon
                        icon={SearchIcon}
                        size={16}
                        strokeWidth={1.75}
                        className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        aria-label={t("knowledge.searchPlaceholder")}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t("knowledge.searchPlaceholder")}
                        className="pl-9"
                      />
                    </div>
                  </form>

                  {mediaMatches !== null && mediaMatches.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">
                        {t("knowledge.searchMediaHeading")}
                      </p>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                        {mediaMatches.map((match) => (
                          <div
                            key={match.id}
                            title={match.description || match.name}
                            className="overflow-hidden rounded-lg border border-border"
                          >
                            <div className="relative aspect-square bg-muted">
                              {match.kind === "image" ? (
                                <Image
                                  src={`/api/media/${match.id}/file`}
                                  alt={match.description || match.name}
                                  fill
                                  sizes="(max-width: 640px) 30vw, 96px"
                                  className="object-cover"
                                />
                              ) : (
                                <span className="flex size-full items-center justify-center text-muted-foreground">
                                  <HugeiconsIcon icon={Image01Icon} size={18} strokeWidth={1.75} />
                                </span>
                              )}
                            </div>
                            <p className="truncate px-1.5 py-1 text-[10px] text-muted-foreground">
                              {match.name}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {matches !== null ? (
                    matches.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {mediaMatches && mediaMatches.length > 0
                          ? t("knowledge.searchOnlyMedia")
                          : t("knowledge.searchEmpty")}
                      </p>
                    ) : (
                      <ul className="space-y-3">
                        {matches.map((match) => (
                          <li
                            key={`${match.doc_id}-${match.chunk_index}`}
                            className="rounded-xl border border-border bg-background p-3"
                          >
                            <div className="mb-1.5 flex items-center justify-between gap-3">
                              <span className="truncate text-xs font-medium">{match.doc_name}</span>
                              <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                                {t("knowledge.searchScore", { score: match.score.toFixed(3) })}
                              </span>
                            </div>
                            <p className="line-clamp-4 text-xs leading-5 text-muted-foreground">
                              {match.text}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )
                  ) : null}
                </div>
              </div>
              {/* Bottom actions row */}
              <div className="flex flex-wrap items-center gap-2 px-2.5 pt-2 pb-0.5">
                <Button
                  type="submit"
                  size="sm"
                  disabled={searching || query.trim().length === 0}
                  onClick={() => void runSearch()}
                >
                  {searching ? <Spinner strokeWidth={2} /> : null}
                  {t("knowledge.searchAction")}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Skeleton>

      <FolderDialog
        // Remounted per target so the fields never carry the last folder's
        // name into a fresh "new folder".
        key={folderDialog.folder?.id ?? "new"}
        open={folderDialog.open}
        folder={folderDialog.folder}
        onClose={() => setFolderDialog({ open: false, folder: null })}
        onSave={handleSaveFolder}
      />
    </PageContainer>
  );
}

function KnowledgeSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <SkeletonBar className="h-7 w-48" />
        <SkeletonBar className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <SkeletonBar className="h-24 rounded-2xl" />
        <SkeletonBar className="h-24 rounded-2xl" />
        <SkeletonBar className="h-24 rounded-2xl" />
        <SkeletonBar className="h-24 rounded-2xl" />
      </div>
      <SkeletonBar className="h-40 w-full rounded-2xl" />
      <SkeletonBar className="h-56 w-full rounded-2xl" />
    </div>
  );
}
