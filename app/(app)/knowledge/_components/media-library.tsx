"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HugeiconsIcon } from "@/components/icons/icon";
import {
  AlertCircleIcon,
  Delete02Icon,
  Image01Icon,
  MusicNote01Icon,
  PencilEdit02Icon,
  PlayIcon,
  SearchIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import { FileUpload, type FileUploadItem } from "@/components/motion/file-upload";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/provider";
import { useSound } from "@/components/sound-provider";
import { useConfirmDialog } from "@/components/confirm-dialog";
import { useToast } from "@/components/toast-provider";
import type { MediaAsset, MediaKind } from "@/lib/media-store";
import type { FolderSummary } from "./folder-grid";

type MediaLimits = { maxBytesByKind: Record<MediaKind, number>; accept: string };

const DEFAULT_LIMITS: MediaLimits = {
  maxBytesByKind: { image: 5242880, video: 16777216, audio: 16777216, file: 26214400 },
  accept: ".jpg,.jpeg,.png,.webp,.gif,.mp4,.mov,.webm,.m4v,.3gp,.mp3,.ogg,.wav,.m4a,.aac",
};

const KIND_ICON = {
  image: Image01Icon,
  video: Video01Icon,
  audio: MusicNote01Icon,
  file: Image01Icon,
} as const;

/** The bytes are served by id, not from /public — see app/api/media/[id]/file. */
function assetUrl(asset: MediaAsset): string {
  return `/api/media/${asset.id}/file`;
}

function Thumbnail({ asset }: { readonly asset: MediaAsset }) {
  if (asset.kind === "image") {
    return (
      <Image
        src={assetUrl(asset)}
        alt={asset.description || asset.name}
        fill
        sizes="(max-width: 640px) 33vw, 300px"
        className="object-cover"
      />
    );
  }

  if (asset.kind === "video") {
    return (
      <>
        {/* `preload="metadata"` is what paints the first frame without
            pulling the whole clip down for a grid of twenty. */}
        <video
          src={assetUrl(asset)}
          muted
          playsInline
          preload="metadata"
          className="size-full object-cover"
        />
        <span className="absolute inset-0 flex items-center justify-center bg-black/20">
          <span className="flex size-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur">
            <HugeiconsIcon icon={PlayIcon} size={16} strokeWidth={2} />
          </span>
        </span>
      </>
    );
  }

  return (
    <span className="flex size-full items-center justify-center text-muted-foreground">
      <HugeiconsIcon icon={KIND_ICON[asset.kind]} size={22} strokeWidth={1.75} />
    </span>
  );
}

function AssetCard({
  asset,
  onEdit,
  onDelete,
}: {
  readonly asset: MediaAsset;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}) {
  const { t } = useI18n();

  return (
    <div className="group relative overflow-hidden rounded-xl border border-border bg-card">
      <div className="relative aspect-square overflow-hidden bg-muted">
        <Thumbnail asset={asset} />

        <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
          <button
            type="button"
            onClick={onEdit}
            aria-label={t("knowledge.mediaEdit")}
            className="flex size-7 items-center justify-center rounded-lg bg-background/85 text-muted-foreground shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:text-foreground"
          >
            <HugeiconsIcon icon={PencilEdit02Icon} size={14} strokeWidth={1.75} />
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("common.delete")}
            className="flex size-7 items-center justify-center rounded-lg bg-background/85 text-muted-foreground shadow-[var(--shadow-soft)] backdrop-blur transition-colors hover:text-destructive"
          >
            <HugeiconsIcon icon={Delete02Icon} size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>

      <div className="space-y-1 px-2.5 py-2">
        <p className="line-clamp-1 text-xs font-medium">{asset.name}</p>
        {asset.description ? (
          <p className="line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            {asset.description}
          </p>
        ) : (
          // A file with no description is nearly invisible to the agent's
          // search, so the gap is called out rather than left blank.
          <button
            type="button"
            onClick={onEdit}
            className="flex items-center gap-1 text-[11px] text-amber-600 hover:underline dark:text-amber-400"
          >
            <HugeiconsIcon icon={AlertCircleIcon} size={12} strokeWidth={2} />
            {t("knowledge.mediaNoDescription")}
          </button>
        )}
      </div>
    </div>
  );
}

export function MediaLibrary({
  folderId,
  folders,
  onChanged,
}: {
  /** Which folder's media to show. `null` is the root. */
  readonly folderId: string | null;
  readonly folders: readonly FolderSummary[];
  readonly onChanged: () => void;
}) {
  const { t } = useI18n();
  const { cue } = useSound();
  const { confirm, dialog: confirmDialog } = useConfirmDialog();
  const { toast } = useToast();

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [limits, setLimits] = useState<MediaLimits>(DEFAULT_LIMITS);
  const [embeddingsAvailable, setEmbeddingsAvailable] = useState(true);
  const [queue, setQueue] = useState<FileUploadItem[]>([]);
  const [batchDescription, setBatchDescription] = useState("");
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [query, setQuery] = useState("");

  // Read inside the XHR callbacks, which are created once per upload and
  // would otherwise close over a stale description.
  const batchRef = useRef(batchDescription);
  batchRef.current = batchDescription;

  const load = useCallback(async () => {
    const res = await fetch(`/api/media?folderId=${folderId ?? "root"}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      assets?: MediaAsset[];
      limits?: MediaLimits;
      embeddings?: { available: boolean };
    };
    setAssets(data.assets ?? []);
    if (data.limits) setLimits(data.limits);
    if (data.embeddings) setEmbeddingsAvailable(data.embeddings.available);
  }, [folderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchQueueItem = useCallback((id: string, patch: Partial<FileUploadItem>) => {
    setQueue((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  }, []);

  const upload = useCallback(
    (item: FileUploadItem) => {
      const file = item.file;
      if (!file) return;

      const form = new FormData();
      form.append("file", file);
      form.append("folderId", folderId ?? "root");
      if (batchRef.current.trim()) form.append("description", batchRef.current.trim());

      const request = new XMLHttpRequest();
      request.open("POST", "/api/media");

      // Stops at 90% because the server still has to write the bytes and
      // embed the description after the transfer lands.
      request.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        patchQueueItem(item.id, {
          status: "uploading",
          progress: Math.round((event.loaded / event.total) * 90),
        });
      };

      request.onload = () => {
        let payload: { assets?: MediaAsset[]; failed?: { name: string; error: string }[] } = {};
        try {
          payload = JSON.parse(request.responseText);
        } catch {
          /* handled by the status check below */
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
        void load();
        onChanged();
        // The file is now a card in the grid below; the queue row would just
        // be a duplicate of it.
        setTimeout(() => setQueue((prev) => prev.filter((entry) => entry.id !== item.id)), 1400);
      };

      request.onerror = () => {
        patchQueueItem(item.id, { status: "error", progress: 0, error: t("knowledge.uploadFailed") });
      };

      patchQueueItem(item.id, { status: "uploading", progress: 0 });
      request.send(form);
    },
    [cue, folderId, load, onChanged, patchQueueItem, t],
  );

  const handleFilesAdded = useCallback(
    (added: FileUploadItem[]) => {
      for (const item of added) upload(item);
    },
    [upload],
  );

  const handleDelete = useCallback(
    async (asset: MediaAsset) => {
      if (!(await confirm({ title: t("knowledge.mediaConfirmDelete") }))) return;
      cue("droplet");
      const previous = assets;
      setAssets((prev) => prev.filter((entry) => entry.id !== asset.id));
      try {
        const res = await fetch(`/api/media?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" });
        if (!res.ok) throw new Error("delete failed");
        onChanged();
        toast({ title: t("common.deleted"), description: t("common.deletedDescription"), status: "success" });
      } catch {
        setAssets(previous);
        toast({
          title: t("common.somethingWentWrong"),
          description: t("common.somethingWentWrongDescription"),
          status: "error",
        });
      }
    },
    [assets, confirm, cue, onChanged, t, toast],
  );

  const handleSaveEdit = useCallback(
    async (patch: { name: string; description: string; tags: string[]; folder_id: string | null }) => {
      if (!editing) return;
      const id = editing.id;
      setEditing(null);
      try {
        const res = await fetch("/api/media", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        if (!res.ok) throw new Error("patch failed");
        await load();
        onChanged();
        toast({ title: t("common.saved"), status: "success" });
      } catch {
        toast({
          title: t("common.somethingWentWrong"),
          description: t("common.somethingWentWrongDescription"),
          status: "error",
        });
      }
    },
    [editing, load, onChanged, t, toast],
  );

  // Filtering happens on the client: this is one folder's worth of files, and
  // a round trip per keystroke would be slower than the substring match.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) =>
      [asset.name, asset.description, asset.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }, [assets, query]);

  const missingDescriptions = useMemo(
    () => assets.filter((asset) => !asset.description).length,
    [assets],
  );

  return (
    <div className="space-y-4">
      {confirmDialog}

      <div className="space-y-3">
        <Input
          aria-label={t("knowledge.mediaBatchDescriptionPlaceholder")}
          value={batchDescription}
          onChange={(event) => setBatchDescription(event.target.value)}
          placeholder={t("knowledge.mediaBatchDescriptionPlaceholder")}
        />
        <p className="text-xs text-muted-foreground">
          {t("knowledge.mediaBatchDescriptionHint")}
        </p>
        <FileUpload
          value={queue}
          onValueChange={setQueue}
          onFilesAdded={handleFilesAdded}
          onRetry={upload}
          accept={limits.accept}
          title={t("knowledge.mediaUploadTitle")}
          description={t("knowledge.mediaUploadDescription", {
            image: String(Math.round(limits.maxBytesByKind.image / (1024 * 1024))),
            video: String(Math.round(limits.maxBytesByKind.video / (1024 * 1024))),
          })}
          browseLabel={t("knowledge.browse")}
        />
      </div>

      {!embeddingsAvailable ? (
        <p className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          <HugeiconsIcon
            icon={AlertCircleIcon}
            size={14}
            strokeWidth={2}
            className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
          />
          {t("knowledge.mediaNoEmbeddings")}
        </p>
      ) : null}

      {assets.length > 0 ? (
        <>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <HugeiconsIcon
                icon={SearchIcon}
                size={15}
                strokeWidth={1.75}
                className="absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                aria-label={t("knowledge.mediaFilterPlaceholder")}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("knowledge.mediaFilterPlaceholder")}
                className="pl-9"
              />
            </div>
            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
              {t("knowledge.mediaCount", { count: String(assets.length) })}
            </span>
          </div>

          {missingDescriptions > 0 ? (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {t("knowledge.mediaMissingDescriptions", { count: String(missingDescriptions) })}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {visible.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onEdit={() => setEditing(asset)}
                onDelete={() => void handleDelete(asset)}
              />
            ))}
          </div>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">
              {t("knowledge.mediaFilterEmpty")}
            </p>
          ) : null}
        </>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">
          {t("knowledge.mediaEmpty")}
        </p>
      )}

      <EditAssetDialog
        // Remounts per asset so the fields never open showing the previous
        // file's description.
        key={editing?.id ?? "none"}
        asset={editing}
        folders={folders}
        onClose={() => setEditing(null)}
        onSave={handleSaveEdit}
      />
    </div>
  );
}

function EditAssetDialog({
  asset,
  folders,
  onClose,
  onSave,
}: {
  readonly asset: MediaAsset | null;
  readonly folders: readonly FolderSummary[];
  readonly onClose: () => void;
  readonly onSave: (patch: {
    name: string;
    description: string;
    tags: string[];
    folder_id: string | null;
  }) => void;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(asset?.name ?? "");
  const [description, setDescription] = useState(asset?.description ?? "");
  const [tags, setTags] = useState(asset?.tags.join(", ") ?? "");
  const [folder, setFolder] = useState(asset?.folder_id ?? "root");

  if (!asset) return null;

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle icon={<HugeiconsIcon icon={PencilEdit02Icon} size={18} strokeWidth={1.75} />}>
            {t("knowledge.mediaEditTitle")}
          </DialogTitle>
          <DialogDescription>{t("knowledge.mediaEditDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-3">
            <div className="size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
              <div className="relative size-full">
                <Thumbnail asset={asset} />
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("knowledge.mediaFieldName")}
              </label>
              <Input
                aria-label={t("knowledge.mediaFieldName")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              {t("knowledge.mediaFieldDescription")}
            </label>
            <Textarea
              aria-label={t("knowledge.mediaFieldDescriptionPlaceholder")}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={3}
              placeholder={t("knowledge.mediaFieldDescriptionPlaceholder")}
            />
            <p className="text-[11px] text-muted-foreground">
              {t("knowledge.mediaFieldDescriptionHint")}
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("knowledge.mediaFieldTags")}
              </label>
              <Input
                aria-label={t("knowledge.mediaFieldTagsPlaceholder")}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder={t("knowledge.mediaFieldTagsPlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {t("knowledge.mediaFieldFolder")}
              </label>
              <Select value={folder} onValueChange={setFolder}>
                <SelectTrigger aria-label={t("knowledge.mediaFieldFolder")} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">{t("knowledge.folderRoot")}</SelectItem>
                  {folders.map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {entry.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() =>
              onSave({
                name: name.trim() || asset.name,
                description: description.trim(),
                tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
                folder_id: folder === "root" ? null : folder,
              })
            }
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
