"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import Surface from "@/components/ui/Surface";
import StatCard from "@/components/dashboard/StatCard";
import NextActions from "@/components/dashboard/NextActions";
import WeekPreview from "@/components/dashboard/WeekPreview";
import Toast from "@/components/ui/Toast";
import AddPostModal from "@/components/AddPostModal";
import BufferExportModal from "@/components/BufferExportModal";
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import { useGenerateAllPosts } from "@/hooks/useGenerateAllPosts";
import { getIndustryProfile } from "@/lib/industryProfiles";
import WhyThisWorks from "@/components/ui/WhyThisWorks";
import { Calendar, Sparkles, CheckCircle, Image as ImageIcon, Play, FileText, Building2, Download, Loader2 } from "lucide-react";

export default function DashboardPage() {
  const router = useRouter();
  const { user, workspaceId, workspaceLoading } = useAuth();
  const { aiSettings } = useWorkspaceUiSettings();
  const [posts, setPosts] = useState<PostDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());

  // Modal states
  const [showAddPostModal, setShowAddPostModal] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ type: "success" | "warn" | "error"; message: string } | null>(null);

  // Get business type profile for display
  const businessTypeProfile = getIndustryProfile(aiSettings.businessType);

  // Use the reusable generate hook
  const { generateAll, isGenerating } = useGenerateAllPosts({
    workspaceId,
    emojiStyle: aiSettings.emojiStyle,
    avoidWords: aiSettings.avoidWords,
  });

  const showToast = useCallback((type: "success" | "warn" | "error", message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 4000);
  }, []);

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

  // Load image URLs for export
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

  // Calculate stats
  const today = getTodayInDenver();

  const stats = useMemo(() => {
    const futurePosts = posts.filter((p) => p.date >= today);
    const futureDates = new Set(futurePosts.map((p) => p.date));

    // Status counts by unique dates
    const statusByDate = new Map<string, PostDay>();
    posts.forEach((p) => {
      if (!statusByDate.has(p.date) || p.platform === "facebook") {
        statusByDate.set(p.date, p);
      }
    });

    const needsAI = Array.from(statusByDate.values()).filter(
      (p) => p.date >= today && p.status === "input"
    ).length;

    const ready = Array.from(statusByDate.values()).filter(
      (p) => p.date >= today && (p.status === "generated" || p.status === "edited")
    ).length;

    const posted = Array.from(statusByDate.values()).filter(
      (p) => p.status === "sent"
    ).length;

    // Posts missing images
    const datesMissingImages = new Set<string>();
    futurePosts.forEach((p) => {
      if (!p.imageAssetId) {
        datesMissingImages.add(p.date);
      }
    });

    return {
      upcoming: futureDates.size,
      needsAI,
      ready,
      posted,
      missingImages: datesMissingImages.size,
    };
  }, [posts, today]);

  // Get future posts for generation and export
  const futurePosts = useMemo(() => {
    return posts.filter((p) => p.date >= today);
  }, [posts, today]);

  // Existing dates for add post modal validation
  const existingDates = useMemo(() => {
    return new Set(posts.map((p) => p.date));
  }, [posts]);

  // Handle Generate All
  const handleGenerateAll = useCallback(async () => {
    if (futurePosts.length === 0) {
      showToast("warn", "No posts to generate");
      return;
    }

    const result = await generateAll(futurePosts);

    if (result.generated === 0 && result.skipped > 0) {
      showToast("warn", `Skipped ${result.skipped} posts (past or missing data)`);
    } else if (result.failed > 0) {
      showToast("warn", `Generated ${result.generated}, failed ${result.failed}`);
    } else if (result.generated > 0) {
      showToast("success", `Generated ${result.generated} post${result.generated !== 1 ? "s" : ""}`);
    } else {
      showToast("warn", "No posts were generated");
    }
  }, [futurePosts, generateAll, showToast]);

  // Handle export complete
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

  // Build next actions
  const nextActions = useMemo(() => {
    const actions = [];

    if (stats.missingImages > 0) {
      actions.push({
        id: "missing-images",
        icon: <ImageIcon className="w-4 h-4" />,
        title: `${stats.missingImages} post${stats.missingImages !== 1 ? "s" : ""} missing images`,
        description: "Add images before posts can be sent",
        href: "/posts",
        variant: "warning" as const,
      });
    }

    if (stats.needsAI > 0) {
      actions.push({
        id: "needs-ai",
        icon: <Sparkles className="w-4 h-4" />,
        title: `${stats.needsAI} post${stats.needsAI !== 1 ? "s" : ""} need AI generation`,
        description: "Generate captions for upcoming content",
        href: "/posts",
        variant: "info" as const,
      });
    }

    if (stats.ready > 0) {
      actions.push({
        id: "ready-to-export",
        icon: <FileText className="w-4 h-4" />,
        title: `${stats.ready} post${stats.ready !== 1 ? "s" : ""} ready to export`,
        description: "Export to Buffer for scheduling",
        href: "/posts",
        variant: "default" as const,
      });
    }

    if (actions.length === 0 && stats.upcoming === 0) {
      actions.push({
        id: "add-posts",
        icon: <Calendar className="w-4 h-4" />,
        title: "No upcoming posts",
        description: "Start planning your content calendar",
        href: "/posts",
        variant: "default" as const,
      });
    }

    return actions;
  }, [stats]);

  // Loading state
  if (workspaceLoading || !workspaceId) {
    return (
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
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
    <div className="p-4 md:p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-medium text-[var(--text-primary)]">Dashboard</h1>
            <p className="text-sm text-[var(--text-secondary)]">
              Overview of your content calendar
            </p>
          </div>
          {/* Industry Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 rounded-full text-sm self-start sm:self-auto">
            <Building2 className="w-4 h-4" />
            <span>Optimized for: <span className="font-medium">{businessTypeProfile.label}</span></span>
          </div>
        </div>
      </div>

      {loading ? (
        <Surface bordered padding="lg">
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Loading stats...</p>
          </div>
        </Surface>
      ) : (
        <div className="space-y-6">
          {/* Stats Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            <StatCard
              label="Upcoming"
              value={stats.upcoming}
              sublabel="scheduled posts"
              icon={<Calendar className="w-5 h-5" />}
              href="/posts"
            />
            <StatCard
              label="Need AI"
              value={stats.needsAI}
              sublabel="awaiting generation"
              icon={<Sparkles className="w-5 h-5" />}
              href="/posts"
              variant={stats.needsAI > 0 ? "warning" : "default"}
            />
            <StatCard
              label="Posted"
              value={stats.posted}
              sublabel="published"
              icon={<CheckCircle className="w-5 h-5" />}
              variant={stats.posted > 0 ? "success" : "default"}
            />
          </div>

          {/* Two columns: Actions & Week Preview */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Next Actions */}
            <Surface bordered padding="none">
              <div className="px-4 py-3 border-b border-[var(--border-secondary)]">
                <h2 className="text-sm font-medium text-[var(--text-primary)]">Next Actions</h2>
              </div>
              <NextActions actions={nextActions} />
            </Surface>

            {/* Week Preview */}
            <Surface bordered padding="md">
              <h2 className="text-sm font-medium text-[var(--text-primary)] mb-4">This Week</h2>
              <WeekPreview posts={posts.filter((p) => p.date >= today)} />
              <div className="mt-4 pt-4 border-t border-[var(--border-secondary)]">
                <button
                  onClick={() => router.push("/posts")}
                  className="w-full text-center text-sm text-[var(--accent-primary)] hover:underline"
                >
                  View full calendar
                </button>
              </div>
            </Surface>
          </div>

          {/* Quick Actions */}
          <Surface bordered padding="md">
            <h2 className="text-sm font-medium text-[var(--text-primary)] mb-4">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Add Post - opens modal */}
              <button
                onClick={() => setShowAddPostModal(true)}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] transition-colors text-left"
              >
                <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">Add Post</span>
              </button>

              {/* Generate All - runs generation inline */}
              <button
                onClick={handleGenerateAll}
                disabled={isGenerating || futurePosts.length === 0}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 text-purple-600 dark:text-purple-400 animate-spin" />
                ) : (
                  <Play className="w-4 h-4 text-purple-600 dark:text-purple-400 fill-current" />
                )}
                <span className="text-sm font-medium text-purple-600 dark:text-purple-400">
                  {isGenerating ? "Generating..." : "Generate All"}
                </span>
              </button>

              {/* Export - opens Buffer export modal */}
              <button
                onClick={() => setShowExportModal(true)}
                disabled={futurePosts.length === 0}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Export</span>
              </button>

              {/* AI Settings - navigates to settings */}
              <button
                onClick={() => router.push("/settings")}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] transition-colors text-left"
              >
                <Sparkles className="w-4 h-4 text-[var(--text-secondary)]" />
                <span className="text-sm font-medium text-[var(--text-primary)]">AI Settings</span>
              </button>
            </div>
          </Surface>

          {/* AI Transparency - Why This Works */}
          <WhyThisWorks industry={businessTypeProfile} />
        </div>
      )}

      {/* Add Post Modal */}
      <AddPostModal
        open={showAddPostModal}
        workspaceId={workspaceId}
        existingDates={existingDates}
        onClose={() => setShowAddPostModal(false)}
        onSuccess={(date) => {
          showToast("success", `Created post for ${date}`);
        }}
        onError={(message) => {
          showToast("error", message);
        }}
      />

      {/* Buffer Export Modal */}
      <BufferExportModal
        open={showExportModal}
        posts={futurePosts}
        imageUrls={imageUrls}
        imageUrlsLoading={false}
        onClose={() => setShowExportModal(false)}
        onExportComplete={handleExportComplete}
      />

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
