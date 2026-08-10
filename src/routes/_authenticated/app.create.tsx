import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, FolderOpen, Info, Loader2, TriangleAlert, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardData } from "@/lib/dashboard.functions";
import { preflightMediaUpload } from "@/lib/media.functions";
import { createAndQueuePost, dispatchPublishingJob } from "@/lib/publishing.functions";
import {
  DEFAULT_YOUTUBE_OPTIONS,
  YOUTUBE_PRIVACY,
  YOUTUBE_PRIVACY_LABEL,
  YOUTUBE_SHORTS_MODES,
  YOUTUBE_SHORTS_MODE_LABEL,
  resolveIsShort,
  type YouTubeOptions,
  type YouTubePrivacy,
  type YouTubeShortsMode,
} from "@/lib/youtube-options";
import { platformMap } from "@/lib/postflow-data";
import type { SocialPlatform } from "@/lib/social-platforms";
import { cn } from "@/lib/utils";
import { dashboardKeys, postKeys, storageKeys } from "@/lib/query-keys";
import {
  clearComposerDraft,
  loadComposerDraft,
  rememberComposerReturn,
  saveComposerDraft,
} from "@/lib/composer-draft";
import {
  getComposerMedia,
  setComposerMedia,
  updateComposerMediaMeta,
} from "@/lib/composer-media-cache";
import {
  emptyPostDetails,
  PostDetailsSection,
  type GenerateStatus,
  type GenerateStep,
  type PostDetailValues,
} from "@/components/composer/post-details";
import {
  PlatformContentCards,
  type CardState,
  type CardTarget,
} from "@/components/composer/platform-content-cards";
import { AudioStudio } from "@/components/composer/audio-studio";
import { MusicRightsPanel } from "@/components/composer/music-rights-panel";
import { listMusicTracks } from "@/lib/music.functions";
import {
  applyMusicDestinationPolicy,
  checkMusicRights,
  compactPlatformAudio,
  defaultPlatformAudio,
  withAttribution,
  type MusicTrack,
  type PlatformAudio,
} from "@/lib/music";
import {
  emptyPlatformContent,
  hashtagList,
  splitList,
  validatePlatformContent,
  type PlatformContent,
} from "@/lib/platform-content";
import { generatePlatformContent } from "@/lib/ai-content.functions";
import { generateSourceIdeaForPlatform } from "@/lib/source-idea.functions";
import { MEDIA_BUCKET, createUserPostStoragePath, formatBytes, validateFile } from "@/lib/media-library";
import {
  applyGeneratedContent,
  cardHasContent,
  generatorPlatformFor,
  SOURCE_IDEA_PLATFORM_LABEL,
  type SourceIdeaPlatform,
} from "@/lib/source-idea";
import { ReplaceContentDialog, type ConflictTarget } from "@/components/composer/replace-content-dialog";

export const Route = createFileRoute("/_authenticated/app/create")({
  head: () => ({
    meta: [
      { title: "Create Post — PostFlow" },
      { name: "description", content: "Upload a photo or video, write a caption, description and hashtags, then publish to every connected platform." },
      { property: "og:title", content: "Create Post — PostFlow" },
      { property: "og:description", content: "One upload, one caption, published across Instagram, Facebook, Pinterest, YouTube and Snapchat." },
    ],
  }),
  component: CreatePost,
});

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
function CreatePost() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const fetchDashboard = useServerFn(getDashboardData);
  const preflightUpload = useServerFn(preflightMediaUpload);
  const submitPost = useServerFn(createAndQueuePost);
  const dispatchPost = useServerFn(dispatchPublishingJob);
  const generateContent = useServerFn(generatePlatformContent);

  const { data, isLoading } = useQuery({
    queryKey: dashboardKeys.legacy(),
    queryFn: () => fetchDashboard(),
  });
  const connections = data?.connections ?? [];

  const [selected, setSelected] = useState<string[] | null>(null);
  // Text fields live inside PostDetailsSection; the composer only keeps a ref so
  // typing never re-renders the media uploader or the platform list.
  const details = useRef<PostDetailValues>(emptyPostDetails);
  const [hasSchedule, setHasSchedule] = useState(false);

  // Draft persistence: text + selected account IDs survive a trip to
  // /app/accounts (or an accidental reload). Files are never persisted.
  const [userId, setUserId] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Restored from the in-memory cache so leaving the page and coming back
  // keeps the selected image/video.
  const [file, setFile] = useState<File | null>(() => getComposerMedia()?.file ?? null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    () => getComposerMedia()?.previewUrl ?? null,
  );
  const [uploading, setUploading] = useState(false);
  const [mediaMeta, setMediaMeta] = useState<{
    width?: number;
    height?: number;
    durationSeconds?: number;
  }>(() => getComposerMedia()?.meta ?? {});
  const [publishing, setPublishing] = useState<"now" | "schedule" | null>(null);
  const [youtubeOptions, setYoutubeOptions] = useState<YouTubeOptions>(DEFAULT_YOUTUBE_OPTIONS);
  // One independent content card per selected account, keyed by account id.
  const [cards, setCards] = useState<CardState>({});
  const [generatingCardId, setGeneratingCardId] = useState<string | null>(null);
  const [generatingAll, setGeneratingAll] = useState(false);
  // "Generate for All Platforms" (source idea card)
  const generateFromIdea = useServerFn(generateSourceIdeaForPlatform);
  const [genStatus, setGenStatus] = useState<GenerateStatus>("idle");
  const [genSteps, setGenSteps] = useState<GenerateStep[]>([]);
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<ConflictTarget[] | null>(null);

  // Copyright-safe music: one independent audio mix per platform card.
  const fetchTracks = useServerFn(listMusicTracks);
  const { data: libraryTracks } = useQuery({
    queryKey: ["music-tracks"],
    queryFn: () => fetchTracks(),
  });
  const [ownTracks, setOwnTracks] = useState<MusicTrack[]>([]);
  const tracks = useMemo<MusicTrack[]>(
    () => [...ownTracks, ...(libraryTracks ?? []).filter((t) => !ownTracks.some((o) => o.id === t.id))],
    [ownTracks, libraryTracks],
  );
  const [audioByCard, setAudioByCard] = useState<Record<string, PlatformAudio>>({});
  // The global mix every platform inherits until it is customized.
  const [globalAudio, setGlobalAudio] = useState<PlatformAudio>(defaultPlatformAudio);
  const audioOf = useCallback(
    (cardId: string) => {
      const own = audioByCard[cardId];
      return own && own.customized ? own : { ...globalAudio, customized: false };
    },
    [audioByCard, globalAudio],
  );
  const cancelled = useRef(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data: userData }) => {
      if (!active) return;
      const uid = userData.user?.id ?? null;
      if (uid) {
        const draft = loadComposerDraft(uid);
        if (draft) {
          details.current = { ...emptyPostDetails, ...draft.details };
          setSelected(draft.selectedAccountIds);
          if (draft.platformContents) setCards(draft.platformContents);
          if (draft.details.scheduledFor) setHasSchedule(true);
          const filled = Object.values(draft.details).some((v) => typeof v === "string" && v.trim());
          if (filled) toast.info("Restored your unsaved post.");
        }
      }
      setUserId(uid);
      setRestored(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const persistDraft = useCallback(
    (nextDetails: PostDetailValues, nextSelected: string[] | null, nextCards?: CardState) => {
      if (!userId) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveComposerDraft(userId, {
          details: nextDetails,
          selectedAccountIds: nextSelected,
          platformContents: nextCards ?? cards,
        });
      }, 500);
    },
    [userId, cards],
  );

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    },
    [],
  );

  // Default to every connected account until the user changes the selection.
  const selectedIds = selected ?? connections.map((c) => c.id);
  const toggle = (id: string) => {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    setSelected(next);
    persistDraft(details.current, next);
  };

  /** Leaves the composer to connect an account, remembering where to come back. */
  function goConnectAccounts() {
    if (userId) {
      saveComposerDraft(userId, {
        details: details.current,
        selectedAccountIds: selected,
        platformContents: cards,
      });
    }
    rememberComposerReturn("/app/create");
    void navigate({ to: "/app/accounts" });
  }

  // ---- Per-platform content cards -------------------------------------------
  const targets: CardTarget[] = connections
    .filter((c) => selectedIds.includes(c.id))
    .map((c) => ({
      id: c.id,
      accountId: c.id,
      platform: c.platform as SocialPlatform,
      accountLabel: c.accountName,
    }));

  function updateCard(cardId: string, next: PlatformContent) {
    setCards((prev) => {
      const updated = { ...prev, [cardId]: next };
      persistDraft(details.current, selected, updated);
      return updated;
    });
  }

  function cardOf(id: string): PlatformContent {
    return cards[id] ?? emptyPlatformContent;
  }

  /** The shared source idea the AI turns into a distinct variant per platform. */
  function aiIdea() {
    const v = details.current;
    return [v.title, v.caption, v.description, v.hashtags].filter(Boolean).join("\n");
  }

  function mediaKind(): "image" | "video" | "none" {
    if (!file) return "none";
    return file.type.startsWith("video/") ? "video" : "image";
  }

  async function runGenerate(cardIds: string[]) {
    const chosen = targets.filter((t) => cardIds.includes(t.id));
    if (chosen.length === 0) return;
    const platforms = [...new Set(chosen.map((t) => t.platform))];
    const generated = await generateContent({
      data: { platforms, idea: aiIdea(), mediaType: mediaKind() },
    });
    setCards((prev) => {
      const updated = { ...prev };
      for (const target of chosen) {
        const g = generated.find((c) => c.platform === target.platform);
        if (!g) continue;
        const base = prev[target.id] ?? emptyPlatformContent;
        updated[target.id] = {
          ...base,
          title: g.title || base.title,
          hook: g.hook || base.hook,
          caption: g.caption || base.caption,
          description: g.description || base.description,
          hashtags: g.hashtags.length ? g.hashtags.join(" ") : base.hashtags,
          keywords: g.keywords.length ? g.keywords.join(", ") : base.keywords,
          tags: g.tags.length ? g.tags.join(", ") : base.tags,
          callToAction: g.callToAction || base.callToAction,
          altText: g.altText || base.altText,
          firstComment: g.firstComment || base.firstComment,
          pinnedComment: g.pinnedComment || base.pinnedComment,
          overlayText: g.overlayText || base.overlayText,
          aiGenerated: true,
          manuallyEdited: false,
        };
      }
      persistDraft(details.current, selected, updated);
      return updated;
    });
  }

  async function generateOne(cardId: string) {
    if (generatingCardId || generatingAll) return;
    setGeneratingCardId(cardId);
    try {
      await runGenerate([cardId]);
      toast.success("Rewritten for this platform.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The AI writer is unavailable.");
    } finally {
      setGeneratingCardId(null);
    }
  }

  async function generateEverything() {
    if (generatingAll || generatingCardId) return;
    setGeneratingAll(true);
    try {
      await runGenerate(targets.map((t) => t.id));
      toast.success("Every platform now has its own version.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The AI writer is unavailable.");
    } finally {
      setGeneratingAll(false);
    }
  }

  // ---- Source idea → all platforms ------------------------------------------
  /** The generator profile each selected card should be written for. */
  function generatorPlatformOf(target: CardTarget): SourceIdeaPlatform {
    return generatorPlatformFor(target.platform, { isShort: youtubeShortsPreview });
  }

  function startSourceIdeaGeneration() {
    if (genStatus === "loading") return;
    const values = details.current;
    if (values.title.trim().length < 3) {
      toast.error("Enter a title first.");
      return;
    }
    if (targets.length === 0) {
      toast.error("Select at least one connected platform.");
      return;
    }
    const filled = targets.filter((t) => cardHasContent(cardOf(t.id)));
    if (filled.length > 0) {
      setConflicts(
        filled.map((t) => ({
          id: t.id,
          label: `${platformMap[t.platform]?.name ?? t.platform} · ${t.accountLabel}`,
        })),
      );
      return;
    }
    void runSourceIdeaGeneration(targets.map((t) => t.id));
  }

  /** Generates one platform at a time so progress shows and failures isolate. */
  async function runSourceIdeaGeneration(cardIds: string[]) {
    const chosen = targets.filter((t) => cardIds.includes(t.id));
    if (chosen.length === 0) return;
    const values = details.current;
    const platforms = [...new Set(chosen.map(generatorPlatformOf))];

    cancelled.current = false;
    setCardErrors({});
    setGenStatus("loading");
    setGenSteps([
      { label: "Analysing title", state: "running" },
      ...platforms.map((p) => ({
        label: `Generating ${SOURCE_IDEA_PLATFORM_LABEL[p]} content`,
        state: "pending" as const,
      })),
      { label: "Finalising hashtag suggestions", state: "pending" as const },
    ]);

    const setStep = (index: number, state: GenerateStep["state"]) =>
      setGenSteps((prev) => prev.map((s, i) => (i === index ? { ...s, state } : s)));

    setStep(0, "done");
    let succeeded = 0;
    let failed = 0;
    let lastError = "";

    for (let i = 0; i < platforms.length; i += 1) {
      if (cancelled.current) break;
      const platform = platforms[i]!;
      setStep(i + 1, "running");
      try {
        const generated = await generateFromIdea({
          data: {
            title: values.title.trim(),
            language: values.language || "English",
            tone: values.tone || "Engaging",
            target_audience: values.audience,
            location: values.location,
            platform,
          },
        });
        if (cancelled.current) break;
        setCards((prev) => {
          const updated = { ...prev };
          for (const target of chosen) {
            if (generatorPlatformOf(target) !== platform) continue;
            updated[target.id] = applyGeneratedContent(
              prev[target.id] ?? emptyPlatformContent,
              generated,
            );
          }
          persistDraft(details.current, selected, updated);
          return updated;
        });
        setStep(i + 1, "done");
        succeeded += 1;
      } catch (error) {
        failed += 1;
        const message = error instanceof Error ? error.message : "Generation failed.";
        lastError = message;
        setStep(i + 1, "failed");
        setCardErrors((prev) => {
          const next = { ...prev };
          for (const target of chosen) {
            if (generatorPlatformOf(target) === platform) next[target.id] = message;
          }
          return next;
        });
      }
    }

    if (cancelled.current) {
      setGenStatus("idle");
      setGenSteps([]);
      toast.info("Generation cancelled.");
      return;
    }

    setGenSteps((prev) =>
      prev.map((s, i) => (i === prev.length - 1 ? { ...s, state: "done" as const } : s)),
    );
    if (succeeded === 0) {
      setGenStatus("error");
      toast.error(lastError || "The AI writer could not generate any platform — try again.");
      return;
    }
    setGenStatus("success");
    toast.success(
      failed > 0
        ? `Generated ${succeeded} platform${succeeded === 1 ? "" : "s"} · ${failed} failed.`
        : "Every selected platform now has its own content.",
    );
  }

  function clearSourceIdea() {
    cancelled.current = true;
    setGenStatus("idle");
    setGenSteps([]);
    setCardErrors({});
    setHasSchedule(false);
  }


  function pickFile(next: File | null) {
    if (!next) return;
    const fileCheck = validateFile(next);
    if ("error" in fileCheck) {
      toast.error(fileCheck.error);
      return;
    }
    const url = URL.createObjectURL(next);
    setFile(next);
    setPreviewUrl(url);
    setMediaMeta({});
    setComposerMedia({ file: next, previewUrl: url, meta: {} });
    // Dimensions and duration decide which platforms will accept the file.
    if (next.type.startsWith("image/")) {
      const img = new Image();
      img.onload = () => {
        const meta = { width: img.naturalWidth, height: img.naturalHeight };
        setMediaMeta(meta);
        updateComposerMediaMeta(meta);
      };
      img.src = url;
    } else if (next.type.startsWith("video/")) {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        const meta = {
          width: video.videoWidth,
          height: video.videoHeight,
          ...(Number.isFinite(video.duration) ? { durationSeconds: video.duration } : {}),
        };
        setMediaMeta(meta);
        updateComposerMediaMeta(meta);
      };
      video.src = url;
    }
  }

  function clearFile() {
    setComposerMedia(null);
    setFile(null);
    setPreviewUrl(null);
    setMediaMeta({});
    if (fileInput.current) fileInput.current.value = "";
  }

  async function uploadMedia() {
    if (!file) return null;
    console.info("[MEDIA_UPLOAD]", {
      stage: "storage_upload",
      file_size: file.size,
      mime: file.type || "application/octet-stream",
    });
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) throw new Error("Your session expired — sign in again.");
    await preflightUpload({
      data: {
        fileName: file.name,
        mimeType: file.type as never,
        fileSize: file.size,
        checksum: null,
      },
    });
    const path = createUserPostStoragePath(uid, file.name);
    const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (error) {
      if (/maximum allowed size/i.test(error.message)) {
        throw new Error(
          "Media storage is not configured for a file of this size yet. Please try again after the storage update has been deployed.",
        );
      }
      throw error;
    }
    return path;
  }

  async function submit(mode: "now" | "schedule") {
    const values = details.current;
    if (!values.title.trim()) {
      toast.error("Add a post title first.");
      return;
    }
    if (targets.length === 0) {
      toast.error("Select at least one connected platform.");
      return;
    }

    // Every card is validated on its own rules — one bad card blocks only itself.
    const blockedCards = targets.filter(
      (t) => validatePlatformContent(t.platform, cardOf(t.id), { hasMedia: !!file }).length > 0,
    );
    if (blockedCards.length > 0) {
      const summaries = blockedCards.map((t) => {
        const name = platformMap[t.platform]?.name ?? t.platform;
        const first = validatePlatformContent(t.platform, cardOf(t.id), { hasMedia: !!file })[0];
        return `${name}: ${first?.message ?? "needs attention"}`;
      });
      toast.error(summaries.join(" | "));
      return;
    }

    const destinations = targets
      .map((t) => {
        const card = cardOf(t.id);
        // The music destination policy decides whether this platform gets the
        // added music at all; non-destinations reuse the original upload.
        const audio = applyMusicDestinationPolicy(audioOf(t.id), t.platform);
        const publishAudio = compactPlatformAudio(audio);
        // Required credits are added to the published description automatically.
        const description = publishAudio.attributionText
          ? withAttribution(card.description, publishAudio.attributionText)
          : card.description;
        return {
          socialAccountId: t.accountId,
          platform: t.platform,
          title: card.title,
          hook: card.hook,
          caption: card.caption,
          description,
          hashtags: hashtagList(card.hashtags),
          keywords: splitList(card.keywords),
          tags: splitList(card.tags),
          callToAction: card.callToAction,
          altText: card.altText,
          firstComment: card.firstComment,
          pinnedComment: card.pinnedComment,
          overlayText: card.overlayText,
          destinationUrl: card.destinationUrl.trim() ? card.destinationUrl.trim() : null,
          location: card.location,
          aiGenerated: card.aiGenerated,
          manuallyEdited: card.manuallyEdited,
          scheduledAtUtc: card.scheduledFor ? new Date(card.scheduledFor).toISOString() : null,
          settings: {
            ...card.settings,
            ...(t.platform === "youtube" ? { ...youtubeOptions } : {}),
            audio: publishAudio,
          },
        };
      });
    if (destinations.length === 0) {
      toast.error("Select at least one platform with valid required content.");
      return;
    }
    if (mode === "schedule" && !values.scheduledFor) {
      toast.error("Pick a date and time to schedule.");
      return;
    }

    setPublishing(mode);
    let uploadedMediaPath: string | null = null;
    try {
      let mediaPath: string | null = null;
      if (file) {
        setUploading(true);
        mediaPath = await uploadMedia();
        uploadedMediaPath = mediaPath;
        setUploading(false);
      }

      const result = await submitPost({
        data: {
          title: values.title.trim(),
          caption: values.caption,
          description: values.description,
          hashtags: hashtagList(values.hashtags),
          linkUrl: values.linkUrl.trim() ? values.linkUrl.trim() : null,
          scheduledAtUtc:
            mode === "schedule" ? new Date(values.scheduledFor).toISOString() : null,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          publishNow: mode === "now",
          media:
            mediaPath && file
              ? {
                  storagePath: mediaPath,
                  mimeType: file.type || "application/octet-stream",
                  fileSize: file.size,
                  originalFilename: file.name,
                  ...(mediaMeta.width ? { width: mediaMeta.width } : {}),
                  ...(mediaMeta.height ? { height: mediaMeta.height } : {}),
                  ...(mediaMeta.durationSeconds
                    ? { durationSeconds: mediaMeta.durationSeconds }
                    : {}),
                  ...(values.altText.trim() ? { altText: values.altText.trim() } : {}),
                }
              : null,
          destinations,
          idempotencyKey: crypto.randomUUID(),
        },
      });

      const blocked = result.validations.filter((v) => v.status === "blocked");
      if (blocked.length > 0) {
        const messages = blocked.map((validation) => {
          const name = platformMap[validation.platform]?.name ?? validation.platform;
          const reconnect = validation.issues.some((item) =>
            ["scope_missing", "account_disconnected", "token_expired"].includes(item.code),
          );
          return reconnect
            ? `Reconnect ${name}.`
            : `${name}: ${validation.issues[0]?.message ?? "needs attention."}`;
        });
        toast.error(messages.join(" | "));
      }
      const queued = result.validations.length - blocked.length;
      if (queued > 0) {
        toast.success(
          mode === "schedule"
            ? `Scheduled for ${queued} destination${queued === 1 ? "" : "s"}.`
            : `Publishing to ${queued} destination${queued === 1 ? "" : "s"}.`,
        );
      }
      // The post now lives in the database — the local draft can go.
      if (userId) clearComposerDraft(userId);
      setComposerMedia(null);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: dashboardKeys.summary() }),
        queryClient.invalidateQueries({ queryKey: dashboardKeys.legacy() }),
        queryClient.invalidateQueries({ queryKey: storageKeys.usage() }),
        queryClient.invalidateQueries({ queryKey: postKeys.history() }),
        queryClient.invalidateQueries({ queryKey: postKeys.calendar() }),
      ]);
      await navigate({ to: "/app/posts" });
      uploadedMediaPath = null;
      if (mode === "now" && queued > 0) {
        void dispatchPost({ data: { jobId: result.jobId } }).catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : "Publishing could not be started.");
        });
      }
    } catch (error) {
      setUploading(false);
      if (uploadedMediaPath) {
        await supabase.storage.from(MEDIA_BUCKET).remove([uploadedMediaPath]);
      }
      toast.error(error instanceof Error ? error.message : "Could not create the post.");
    } finally {
      setPublishing(null);
    }
  }

  const isVideo = file?.type.startsWith("video/") ?? false;
  const youtubeSelected = connections.some(
    (c) => c.platform === "youtube" && selectedIds.includes(c.id),
  );
  const youtubeShortsPreview = resolveIsShort(youtubeOptions.shortsMode, {
    width: mediaMeta.width ?? null,
    height: mediaMeta.height ?? null,
    durationSeconds: mediaMeta.durationSeconds ?? null,
  });
  const busy = publishing !== null;


  return (
    <div className="pb-4">
      <h1 className="text-2xl font-bold">Create post</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload a photo or video, write your caption and hashtags, then publish to every connected
        account at once.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* Media */}
        <section className="space-y-4 rounded-2xl border border-border p-5">
          <h2 className="text-base font-semibold">Media</h2>
          <input
            ref={fileInput}
            type="file"
            accept="image/*,video/*"
            className="hidden"
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              pickFile(e.dataTransfer.files?.[0] ?? null);
            }}
            className="mesh-vanilla flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/50 px-4 py-8 text-center"
          >
            <Upload className="size-6" aria-hidden />
            <p className="text-sm font-medium">Drag and drop a file</p>
            <p className="text-xs text-muted-foreground">JPG, PNG, WebP, MP4, MOV — up to 512 MiB</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                Select file
              </button>
              <Link
                to="/app/media"
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/60 px-3 py-2 text-xs font-semibold"
              >
                <FolderOpen className="size-3.5" aria-hidden /> Media library
              </Link>
            </div>
          </div>

          {file ? (
            <div className="grid gap-3 sm:grid-cols-[110px_minmax(0,1fr)]">
              <div className="mesh-vanilla relative aspect-[9/16] overflow-hidden rounded-xl border border-border bg-primary/10">
                {previewUrl && !isVideo && (
                  <img
                    src={previewUrl}
                    alt={file.name}
                    decoding="async"
                    className="size-full object-cover"
                  />
                )}
                {previewUrl && isVideo && (
                  <video
                    src={previewUrl}
                    muted
                    playsInline
                    preload="metadata"
                    className="size-full object-cover"
                  />
                )}
                <button
                  type="button"
                  onClick={clearFile}
                  aria-label="Remove media"
                  className="absolute right-2 top-2 rounded-full bg-primary p-1 text-primary-foreground"
                >
                  <X className="size-3" aria-hidden />
                </button>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                {[
                  ["File", file.name],
                  ["Type", isVideo ? "Video" : "Image"],
                  ["Size", formatSize(file.size)],
                  ["Status", uploading ? "Uploading…" : "Ready"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium break-words">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              No file selected yet — you can also publish a text-only post.
            </p>
          )}
        </section>

        {/* Details — owns its own text state so keystrokes stay local. */}
        {restored ? (
          <PostDetailsSection
            valuesRef={details}
            onScheduleChange={(v) => setHasSchedule(!!v)}
            onChange={(values) => persistDraft(values, selected)}
            onGenerateAll={startSourceIdeaGeneration}
            onCancelGenerate={() => {
              cancelled.current = true;
            }}
            onClear={clearSourceIdea}
            generateStatus={genStatus}
            steps={genSteps}
          />
        ) : (
          <section className="rounded-2xl border border-border p-5">
            <p className="text-sm text-muted-foreground">Loading your draft…</p>
          </section>
        )}


        {/* Platforms */}
        <section className="space-y-3 rounded-2xl border border-border p-5 lg:col-span-2 xl:col-span-1">
          <h2 className="text-base font-semibold">Connected platforms</h2>

          {isLoading && (
            <p className="text-sm text-muted-foreground">Loading your connected accounts…</p>
          )}

          {!isLoading && connections.length === 0 && (
            <div className="rounded-xl border border-dashed border-primary/50 p-4 text-sm">
              <p className="font-medium">No accounts connected yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Connect Instagram, YouTube, Snapchat and more to publish everywhere at once.
              </p>
              <button
                type="button"
                onClick={goConnectAccounts}
                className="mt-3 inline-flex rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
              >
                Connect an account
              </button>
            </div>
          )}

          {connections.map((acc) => {
            const platform = platformMap[acc.platform];
            const active = selectedIds.includes(acc.id);
            const expired = acc.status === "expired";
            return (
              <div
                key={acc.id}
                className={cn(
                  "rounded-xl border p-3 transition-colors",
                  active ? "surface-strong border-transparent" : "border-border",
                )}
              >
                <div className="flex items-center gap-3">
                  {platform && <platform.icon className="size-5 shrink-0" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{acc.accountName}</p>
                    <p className="truncate text-xs opacity-75">
                      {platform?.name ?? acc.platform}
                      {acc.username ? ` · ${acc.username}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={active}
                    aria-label={`Select ${acc.accountName}`}
                    onClick={() => toggle(acc.id)}
                    className={cn(
                      "grid size-5 shrink-0 place-items-center rounded border",
                      active ? "border-primary-foreground bg-primary-foreground" : "border-primary/60",
                    )}
                  >
                    {active && <Check className="size-3.5 text-primary" aria-hidden />}
                  </button>
                </div>

                <div className="mt-2.5 flex items-center gap-2 text-xs">
                  <span className="inline-flex items-center gap-1.5 opacity-85">
                    {expired ? (
                      <>
                        <TriangleAlert className="size-3.5" aria-hidden /> Permission expired —
                        reconnect to publish
                      </>
                    ) : (
                      <>
                        <Info className="size-3.5" aria-hidden /> Ready ·{" "}
                        {platform?.formats ?? "all formats"}
                      </>
                    )}
                  </span>
                </div>
              </div>
            );
          })}

          {youtubeSelected && (
            <div className="space-y-3 rounded-xl border border-primary/40 p-3">
              <p className="text-sm font-semibold">YouTube options</p>
              <label className="block text-xs font-semibold">
                Publish as
                <select
                  value={youtubeOptions.shortsMode}
                  onChange={(e) =>
                    setYoutubeOptions((o) => ({
                      ...o,
                      shortsMode: e.target.value as YouTubeShortsMode,
                    }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-normal"
                >
                  {YOUTUBE_SHORTS_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {YOUTUBE_SHORTS_MODE_LABEL[mode]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-semibold">
                Privacy
                <select
                  value={youtubeOptions.privacy}
                  onChange={(e) =>
                    setYoutubeOptions((o) => ({ ...o, privacy: e.target.value as YouTubePrivacy }))
                  }
                  className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs font-normal"
                >
                  {YOUTUBE_PRIVACY.map((value) => (
                    <option key={value} value={value}>
                      {YOUTUBE_PRIVACY_LABEL[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold">
                <input
                  type="checkbox"
                  checked={youtubeOptions.madeForKids}
                  onChange={(e) =>
                    setYoutubeOptions((o) => ({ ...o, madeForKids: e.target.checked }))
                  }
                />
                Made for kids
              </label>
              <p className="text-[11px] text-muted-foreground">
                {youtubeShortsPreview
                  ? "This upload will be tagged #Shorts in the title, description and tags."
                  : "This upload will be published as a regular YouTube video."}
              </p>
            </div>
          )}
        </section>

      </div>

      {/* Global audio mix — each platform inherits it until customized. */}
      {targets.length > 0 && (
        <div className="mt-6">
          <AudioStudio
            scope="global"
            platform={targets[0]!.platform}
            selectedPlatforms={targets.map((t) => t.platform)}
            audio={globalAudio}
            globalAudio={globalAudio}
            tracks={tracks}
            isVideo={isVideo}
            videoUrl={isVideo ? previewUrl : null}
            videoDurationSeconds={mediaMeta.durationSeconds ?? null}
            onChange={(next: PlatformAudio) => setGlobalAudio({ ...next, customized: false })}
            onTrackCreated={(track: MusicTrack) => setOwnTracks((cur) => [track, ...cur])}
          />
        </div>
      )}

      {/* One independent, editable content card per selected platform. */}
      <div className="mt-6">
        <PlatformContentCards
          targets={targets}
          values={cards}
          hasMedia={!!file}
          errors={cardErrors}
          generatingCardId={generatingCardId}
          generatingAll={generatingAll}
          onChangeCard={updateCard}
          onGenerateCard={(id) => void generateOne(id)}
          onGenerateAll={() => void generateEverything()}
          renderExtra={(target) => (
            <AudioStudio
              scope="platform"
              platform={target.platform}
              accountLabel={target.accountLabel}
              selectedPlatforms={targets.map((t) => t.platform)}
              audio={audioByCard[target.id] ?? { ...globalAudio, customized: false }}
              globalAudio={globalAudio}
              tracks={tracks}
              isVideo={isVideo}
              videoUrl={isVideo ? previewUrl : null}
              videoDurationSeconds={mediaMeta.durationSeconds ?? null}
              copySources={targets
                .filter((t) => t.id !== target.id)
                .map((t) => ({ id: t.id, label: `${platformMap[t.platform]?.name ?? t.platform} · ${t.accountLabel}` }))}
              onCopyFrom={(sourceId) =>
                setAudioByCard((cur) => ({
                  ...cur,
                  [target.id]: { ...audioOf(sourceId), customized: true },
                }))
              }
              onChange={(next: PlatformAudio) =>
                setAudioByCard((cur) => ({ ...cur, [target.id]: next }))
              }
              onTrackCreated={(track: MusicTrack) => setOwnTracks((cur) => [track, ...cur])}
            />
          )}
        />
      </div>

      <div className="mt-4">
        <MusicRightsPanel
          checks={targets.map((t) =>
            checkMusicRights({
              cardId: t.id,
              platform: t.platform,
              accountLabel: t.accountLabel,
              audio: applyMusicDestinationPolicy(audioOf(t.id), t.platform),
              descriptionText: `${cardOf(t.id).description}\n${cardOf(t.id).caption}`,
            }),
          )}
        />
      </div>

      {conflicts && (
        <ReplaceContentDialog
          conflicts={conflicts}
          onCancel={() => setConflicts(null)}
          onConfirm={(replaceIds) => {
            setConflicts(null);
            const untouched = targets
              .filter((t) => !cardHasContent(cardOf(t.id)))
              .map((t) => t.id);
            void runSourceIdeaGeneration([...new Set([...replaceIds, ...untouched])]);
          }}
        />
      )}

      {/* Sticky inside the content column so it never covers the sidebar. */}
      <div className="sticky bottom-0 z-30 -mx-4 mt-6 border-t border-border bg-background px-4 py-3 md:-mx-8 md:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {selectedIds.length} of {connections.length} connected account
            {connections.length === 1 ? "" : "s"} selected
            {file ? ` · ${file.name}` : ""}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || !hasSchedule}
              onClick={() => void submit("schedule")}
              className="rounded-md border border-primary/60 px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-50"
            >
              Schedule
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit("now")}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow-soft hover:opacity-90 disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
              {uploading ? "Uploading…" : publishing === "now" ? "Publishing…" : "Publish Now"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
