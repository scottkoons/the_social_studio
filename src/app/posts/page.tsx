"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, storage, functions } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, setDoc, getDoc, serverTimestamp, writeBatch } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import Surface from "@/components/ui/Surface";
import ViewToggle, { ViewMode } from "@/components/ui/ViewToggle";
import BatchActionBar from "@/components/ui/BatchActionBar";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/ui/ConfirmModal";
import BufferExportModal from "@/components/BufferExportModal";
import PostsCalendarView from "@/components/posts/PostsCalendarView";
import PostsListView from "@/components/posts/PostsListView";
import PostDetailPanel from "@/components/posts/PostDetailPanel";
import { PostDay, getPostDocId, GenerationMode, EmojiStyle } from "@/lib/types";
import { generatePlatformPostingTimes } from "@/lib/postingTime";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import { isPostPastDue, isPastInDenver } from "@/lib/utils";
import { Plus, Play, Download, Trash2, Sparkles, Loader2 } from "lucide-react";
import { format, addDays } from "date-fns";

const CONCURRENCY_LIMIT = 3;

interface GeneratePostCopyResponse {
  success: boolean;
  status: "generated" | "already_generated" | "error";
  message?: string;
}

export default function PostsPage() {
  const { user, workspaceId, workspaceLoading } = useAuth();

  // Data state
  const [posts, setPosts] = useState<PostDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("calendar");
  const [currentMonth, setCurrentMonth] = useState(new Date());

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Panel state
  const [selectedPost, setSelectedPost] = useState<PostDay | null>(null);
  const [selectedPostImageUrl, setSelectedPostImageUrl] = useState<string | null>(null);
  const [isPanelOpen, setIsPanelOpen] = useState(false);

  // Action state
  const [isGenerating, setIsGenerating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ type: "success" | "warn" | "error"; message: string } | null>(null);

  // Use shared hooks
  const { filteredPosts, hidePastUnsent } = useHidePastUnsent(posts);
  const { aiSettings } = useWorkspaceUiSettings();

  // Load posts
  useEffect(() => {
    if (!user || !workspaceId) return;

    const q = query(
      collection(db, "workspaces", workspaceId, "post_days"),
      orderBy("date", "asc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const postsData = snapshot.docs.map((docSnap) => ({
        docId: docSnap.id,
        ...docSnap.data(),
      })) as PostDay[];
      setPosts(postsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, workspaceId]);

  // Load image URLs
  useEffect(() => {
    if (!workspaceId) return;

    const assetsRef = collection(db, "workspaces", workspaceId, "assets");
    const unsubscribe = onSnapshot(assetsRef, async (snapshot) => {
      const urls = new Map<string, string>();
      const resolvePromises: Promise<void>[] = [];

      snapshot.docs.forEach((assetDoc) => {
        const data = assetDoc.data();
        const assetId = assetDoc.id;

        if (data.downloadUrl) {
          urls.set(assetId, data.downloadUrl);
        } else if (data.storagePath) {
          const promise = getDownloadURL(ref(storage, data.storagePath))
            .then((url) => { urls.set(assetId, url); })
            .catch((err) => console.warn(`Failed to resolve URL for ${assetId}:`, err));
          resolvePromises.push(promise);
        }
      });

      await Promise.all(resolvePromises);
      setImageUrls(urls);
    });

    return () => unsubscribe();
  }, [workspaceId]);

  // Clear hidden posts from selection
  useEffect(() => {
    if (!hidePastUnsent) return;
    const visibleIds = new Set(filteredPosts.map((p) => getPostDocId(p)));
    setSelectedIds((prev) => {
      const filtered = new Set([...prev].filter((id) => visibleIds.has(id)));
      return filtered.size !== prev.size ? filtered : prev;
    });
  }, [hidePastUnsent, filteredPosts]);

  const showToast = useCallback((type: "success" | "warn" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

  // Selection handlers
  const handleSelectPost = useCallback((docId: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (selected) next.add(docId);
      else next.delete(docId);
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(
    (selected: boolean) => {
      if (selected) {
        setSelectedIds(new Set(filteredPosts.map((p) => getPostDocId(p))));
      } else {
        setSelectedIds(new Set());
      }
    },
    [filteredPosts]
  );

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Post click handler - open panel
  const handlePostClick = useCallback(
    async (post: PostDay) => {
      setSelectedPost(post);

      // Fetch image URL if post has an image
      let imgUrl: string | null = null;
      if (post.imageAssetId) {
        imgUrl = imageUrls.get(post.imageAssetId) || null;
        if (!imgUrl && workspaceId) {
          try {
            const assetRef = doc(db, "workspaces", workspaceId, "assets", post.imageAssetId);
            const assetSnap = await getDoc(assetRef);
            if (assetSnap.exists()) {
              const asset = assetSnap.data();
              if (asset.downloadUrl) {
                imgUrl = asset.downloadUrl;
              } else if (asset.storagePath) {
                imgUrl = await getDownloadURL(ref(storage, asset.storagePath));
              }
            }
          } catch (err) {
            console.error("Error fetching image URL:", err);
          }
        }
      }

      setSelectedPostImageUrl(imgUrl);
      setIsPanelOpen(true);
    },
    [imageUrls, workspaceId]
  );

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
    setSelectedPost(null);
    setSelectedPostImageUrl(null);
  }, []);

  // Past date blocked callback
  const handlePastDateBlocked = useCallback(() => {
    showToast("warn", "Past dates can't be scheduled. Pick today or a future date.");
  }, [showToast]);

  // Empty day click - create new post
  const handleEmptyDayClick = useCallback(
    async (dateStr: string) => {
      if (!workspaceId || isAdding) return;

      // Block creating posts on past dates
      if (isPastInDenver(dateStr)) {
        handlePastDateBlocked();
        return;
      }

      setIsAdding(true);

      try {
        const docRef = doc(db, "workspaces", workspaceId, "post_days", dateStr);
        const postingTimes = generatePlatformPostingTimes(dateStr, dateStr);

        await setDoc(docRef, {
          date: dateStr,
          starterText: "",
          postingTimeIg: postingTimes.ig,
          postingTimeFb: postingTimes.fb,
          postingTimeIgSource: "auto",
          postingTimeFbSource: "auto",
          status: "input",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        showToast("success", `Created post for ${dateStr}`);
      } catch (err) {
        console.error("Error creating post:", err);
        showToast("error", "Failed to create post");
      } finally {
        setIsAdding(false);
      }
    },
    [workspaceId, isAdding, showToast, handlePastDateBlocked]
  );

  // Add new post (for button)
  const handleAddPost = useCallback(async () => {
    if (!workspaceId || isAdding) return;

    setIsAdding(true);

    // Find next available date
    let nextDate = new Date();
    let dateStr = format(nextDate, "yyyy-MM-dd");
    const existingDates = new Set(posts.map((p) => p.date));

    while (existingDates.has(dateStr)) {
      nextDate = addDays(nextDate, 1);
      dateStr = format(nextDate, "yyyy-MM-dd");
    }

    try {
      const docRef = doc(db, "workspaces", workspaceId, "post_days", dateStr);
      const postingTimes = generatePlatformPostingTimes(dateStr, dateStr);

      await setDoc(docRef, {
        date: dateStr,
        starterText: "",
        postingTimeIg: postingTimes.ig,
        postingTimeFb: postingTimes.fb,
        postingTimeIgSource: "auto",
        postingTimeFbSource: "auto",
        status: "input",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      showToast("success", `Added post for ${dateStr}`);
    } catch (err) {
      console.error("Error adding post:", err);
      showToast("error", "Failed to add post");
    } finally {
      setIsAdding(false);
    }
  }, [workspaceId, isAdding, posts, showToast]);

  // Batch generate
  const handleGenerateBatch = useCallback(async () => {
    if (!workspaceId || isGenerating) return;

    const targets =
      selectedIds.size > 0
        ? filteredPosts.filter((p) => selectedIds.has(getPostDocId(p)))
        : filteredPosts;

    if (targets.length === 0) return;

    setIsGenerating(true);

    const generatePostCopy = httpsCallable<
      {
        workspaceId: string;
        dateId: string;
        regenerate: boolean;
        generationMode?: GenerationMode;
        guidanceText?: string;
        requestId?: string;
        emojiStyle?: EmojiStyle;
        avoidWords?: string;
      },
      GeneratePostCopyResponse
    >(functions, "generatePostCopy");

    const currentEmojiStyle = aiSettings.emojiStyle;
    const currentAvoidWords = aiSettings.avoidWords;

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    const toProcess: PostDay[] = [];

    for (const post of targets) {
      const isPast = isPostPastDue(post);
      if (isPast && post.status !== "sent") {
        skipped++;
        continue;
      }

      const effectiveMode = post.generationMode || (post.imageAssetId ? (post.starterText ? "hybrid" : "image") : "text");
      if (effectiveMode === "text" && (!post.starterText || post.starterText.trim() === "")) {
        skipped++;
        continue;
      }

      toProcess.push(post);
    }

    // Process concurrently
    const queue = [...toProcess];
    const inFlight: Promise<void>[] = [];

    const processOne = async (post: PostDay) => {
      const docId = getPostDocId(post);

      try {
        await generatePostCopy({
          workspaceId,
          dateId: docId,
          regenerate: true,
          generationMode: post.generationMode,
          guidanceText: post.starterText,
          requestId: crypto.randomUUID(),
          emojiStyle: currentEmojiStyle,
          avoidWords: currentAvoidWords,
        });
        generated++;
      } catch (err) {
        console.error(`Generate error for ${docId}:`, err);
        failed++;
      }
    };

    while (queue.length > 0 || inFlight.length > 0) {
      while (queue.length > 0 && inFlight.length < CONCURRENCY_LIMIT) {
        const post = queue.shift()!;
        const promise = processOne(post).then(() => {
          const idx = inFlight.indexOf(promise);
          if (idx > -1) inFlight.splice(idx, 1);
        });
        inFlight.push(promise);
      }

      if (inFlight.length > 0) {
        await Promise.race(inFlight);
      }
    }

    setIsGenerating(false);

    if (generated === 0 && skipped > 0) {
      showToast("warn", `Skipped ${skipped} posts (past or missing data)`);
    } else if (failed > 0) {
      showToast("warn", `Generated ${generated}, failed ${failed}`);
    } else {
      showToast("success", `Generated ${generated} post${generated !== 1 ? "s" : ""}`);
    }
  }, [workspaceId, isGenerating, selectedIds, filteredPosts, aiSettings, showToast]);

  // Batch delete
  const handleBatchDelete = useCallback(async () => {
    if (!workspaceId || selectedIds.size === 0) return;

    setIsDeleting(true);

    try {
      const batch = writeBatch(db);
      for (const docId of selectedIds) {
        batch.delete(doc(db, "workspaces", workspaceId, "post_days", docId));
      }
      await batch.commit();

      const count = selectedIds.size;
      setSelectedIds(new Set());
      showToast("success", `Deleted ${count} post${count !== 1 ? "s" : ""}`);
    } catch (err) {
      console.error("Batch delete error:", err);
      showToast("error", "Failed to delete posts");
    } finally {
      setIsDeleting(false);
      setShowDeleteModal(false);
    }
  }, [workspaceId, selectedIds, showToast]);

  // Export complete handler
  const handleExportComplete = useCallback(
    (summary: { exported: number; skipped: number }) => {
      if (summary.skipped > 0) {
        showToast("warn", `Exported ${summary.exported}, skipped ${summary.skipped}`);
      } else {
        showToast("success", `Exported ${summary.exported} post${summary.exported !== 1 ? "s" : ""}`);
      }
    },
    [showToast]
  );

  // Get posts for export
  const getPostsForExport = useCallback(() => {
    if (selectedIds.size > 0) {
      return filteredPosts.filter((p) => selectedIds.has(getPostDocId(p)));
    }
    return filteredPosts;
  }, [selectedIds, filteredPosts]);

  // Batch action bar actions
  const batchActions = [
    {
      label: "Generate",
      icon: <Sparkles className="w-4 h-4" />,
      onClick: handleGenerateBatch,
      disabled: isGenerating,
    },
    {
      label: "Export",
      icon: <Download className="w-4 h-4" />,
      onClick: () => setShowExportModal(true),
    },
    {
      label: "Delete",
      icon: <Trash2 className="w-4 h-4" />,
      onClick: () => setShowDeleteModal(true),
      variant: "danger" as const,
    },
  ];

  // Loading state
  if (workspaceLoading || !workspaceId) {
    return (
      <div className="p-4 md:p-8 max-w-7xl mx-auto">
        <Surface bordered padding="lg">
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Loading workspace...</p>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-medium text-[var(--text-primary)]">Posts</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Manage your social media content
          </p>
        </div>

        <div className="flex items-center gap-3">
          <ViewToggle value={viewMode} onChange={setViewMode} />

          <button
            onClick={handleAddPost}
            disabled={isAdding}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] rounded-lg transition-colors disabled:opacity-50"
          >
            {isAdding ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Plus className="w-4 h-4" />
            )}
            Add Post
          </button>

          <button
            onClick={handleGenerateBatch}
            disabled={isGenerating || filteredPosts.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4 fill-current" />
            )}
            Generate {selectedIds.size > 0 ? "Selected" : "All"}
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            disabled={filteredPosts.length === 0}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Surface bordered padding="lg">
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Loading posts...</p>
          </div>
        </Surface>
      ) : viewMode === "calendar" ? (
        <PostsCalendarView
          posts={filteredPosts}
          workspaceId={workspaceId}
          currentMonth={currentMonth}
          onMonthChange={setCurrentMonth}
          selectedIds={selectedIds}
          onSelectPost={handleSelectPost}
          onPostClick={handlePostClick}
          onEmptyDayClick={handleEmptyDayClick}
          onPastDateBlocked={handlePastDateBlocked}
        />
      ) : (
        <PostsListView
          posts={filteredPosts}
          workspaceId={workspaceId}
          selectedIds={selectedIds}
          onSelectPost={handleSelectPost}
          onSelectAll={handleSelectAll}
          onPostClick={handlePostClick}
        />
      )}

      {/* Batch Action Bar */}
      <BatchActionBar
        selectedCount={selectedIds.size}
        onClear={handleClearSelection}
        actions={batchActions}
      />

      {/* Post Detail Panel */}
      <PostDetailPanel
        post={selectedPost}
        workspaceId={workspaceId}
        imageUrl={selectedPostImageUrl}
        isOpen={isPanelOpen}
        onClose={handleClosePanel}
      />

      {/* Export Modal */}
      <BufferExportModal
        open={showExportModal}
        posts={getPostsForExport()}
        imageUrls={imageUrls}
        imageUrlsLoading={false}
        onClose={() => setShowExportModal(false)}
        onExportComplete={handleExportComplete}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={showDeleteModal}
        title="Delete Selected Posts?"
        description={`Are you sure you want to delete ${selectedIds.size} post${selectedIds.size !== 1 ? "s" : ""}? This cannot be undone.`}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={handleBatchDelete}
        onCancel={() => setShowDeleteModal(false)}
        confirmVariant="danger"
      />

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
