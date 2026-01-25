"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions, storage } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, deleteDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import ReviewTable, { PlatformFilterValue } from "@/components/ReviewTable";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import Toast from "@/components/ui/Toast";
import PlatformFilter from "@/components/ui/PlatformFilter";
import BufferExportModal from "@/components/BufferExportModal";
import PostsPdfPrintRoot from "@/components/PostsPdfPrintRoot";
import MarkUploadedModal from "@/components/MarkUploadedModal";
import ImportTextCsvModal from "@/components/ImportTextCsvModal";
import LifecycleFilter, { LifecycleFilterValue } from "@/components/ui/LifecycleFilter";
import { PostDay, getPostDocId, GenerationMode } from "@/lib/types";
import { getLifecycleStatus, getLifecycleCounts, markPostsAsUploaded } from "@/lib/lifecycleService";
import { generateTextCsv, downloadTextCsv, getTextExportFilename } from "@/lib/textCsvUtils";
import { Play, Download, FileText, Loader2, Trash2, Upload, Instagram, Facebook, Calendar, Clock, FileUp, FileDown } from "lucide-react";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import { isPostPastDue } from "@/lib/utils";
import { EmojiStyle } from "@/lib/types";
import { PostsPdfExportProgress, getPhaseText as getPostsPhaseText } from "@/lib/postsPdfExport";

const CONCURRENCY_LIMIT = 3;

interface GeneratePostCopyResponse {
    success: boolean;
    status: "generated" | "already_generated" | "error";
    message?: string;
    avoidWordsUsage?: Record<string, number>;
}

export default function ReviewPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ type: 'success' | 'warn' | 'error', message: string } | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
    const [showExportModal, setShowExportModal] = useState(false);
    const [imageUrls, setImageUrls] = useState<Map<string, string>>(new Map());
    const [imageUrlsLoading, setImageUrlsLoading] = useState(true);
    const [platformFilter, setPlatformFilter] = useState<PlatformFilterValue>("all");

    // Posts PDF export state
    const [isExportingPostsPdf, setIsExportingPostsPdf] = useState(false);
    const [postsPdfProgress, setPostsPdfProgress] = useState<PostsPdfExportProgress | null>(null);
    const [postsPdfError, setPostsPdfError] = useState<string | null>(null);
    const [postsPdfWarning, setPostsPdfWarning] = useState<string | null>(null);
    const [pdfIncludeImages, setPdfIncludeImages] = useState(true);

    // Bulk delete state
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // Image-only generation confirmation state
    const [showImageOnlyModal, setShowImageOnlyModal] = useState(false);
    const [imageOnlyCount, setImageOnlyCount] = useState(0);
    const [pendingGenerateTargets, setPendingGenerateTargets] = useState<PostDay[]>([]);

    // Lifecycle filter state
    const [lifecycleFilter, setLifecycleFilter] = useState<LifecycleFilterValue>("all");
    const [showMarkUploadedModal, setShowMarkUploadedModal] = useState(false);

    // Text CSV import/export state
    const [showImportTextModal, setShowImportTextModal] = useState(false);

    // Generation mode: "fast" (concurrent) or "sequential" (for avoid-words tracking)
    const [generationMode, setGenerationMode] = useState<"fast" | "sequential">("fast");

    // Use shared hook for filtering past unsent posts
    const { filteredPosts: postsWithoutPastUnsent, hidePastUnsent } = useHidePastUnsent(posts);

    // Apply lifecycle filter
    const filteredPosts = lifecycleFilter === "all"
        ? postsWithoutPastUnsent
        : postsWithoutPastUnsent.filter(
              (p) => getLifecycleStatus(p) === lifecycleFilter
          );

    // Compute lifecycle counts for the filter badges
    const lifecycleCounts = getLifecycleCounts(postsWithoutPastUnsent);

    // Count exported posts for "Mark as Uploaded" button
    const exportedCount = lifecycleCounts.exported;

    // Get current AI settings to pass emojiStyle to generate calls
    const { aiSettings } = useWorkspaceUiSettings();

    // When filter is enabled, deselect any posts that become hidden
    useEffect(() => {
        if (!hidePastUnsent) return;
        const visibleIds = new Set(filteredPosts.map(p => getPostDocId(p)));
        setSelectedIds(prev => {
            const filtered = new Set([...prev].filter(id => visibleIds.has(id)));
            return filtered.size !== prev.size ? filtered : prev;
        });
    }, [hidePastUnsent, filteredPosts]);

    useEffect(() => {
        if (!user || !workspaceId) return;

        const q = query(
            collection(db, "workspaces", workspaceId, "post_days"),
            orderBy("date", "asc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsData = snapshot.docs.map((docSnap) => ({
                docId: docSnap.id, // Store the actual Firestore doc ID
                ...docSnap.data(),
            })) as PostDay[];
            setPosts(postsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, workspaceId]);

    // Fetch image URLs from assets collection
    useEffect(() => {
        if (!workspaceId) return;

        setImageUrlsLoading(true);
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
                        .then((url) => {
                            urls.set(assetId, url);
                        })
                        .catch((err) => {
                            console.warn(`Failed to resolve URL for asset ${assetId}:`, err);
                        });
                    resolvePromises.push(promise);
                }
            });

            await Promise.all(resolvePromises);
            setImageUrls(urls);
            setImageUrlsLoading(false);
        });

        return () => unsubscribe();
    }, [workspaceId]);

    const showToast = useCallback((type: 'success' | 'warn' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const onSelectRow = (id: string, selected: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (selected) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const onSelectAll = (selected: boolean) => {
        if (selected) setSelectedIds(new Set(filteredPosts.map(p => getPostDocId(p))));
        else setSelectedIds(new Set());
    };

    const handleRegenerateSingle = useCallback(async (dateId: string, previousOutputs?: {
        igCaption?: string;
        igHashtags?: string[];
        fbCaption?: string;
        fbHashtags?: string[];
    }) => {
        if (!user || !workspaceId) return;

        setGeneratingIds(prev => new Set(prev).add(dateId));

        const generatePostCopy = httpsCallable<
            {
                workspaceId: string;
                dateId: string;
                regenerate: boolean;
                previousOutputs?: {
                    igCaption?: string;
                    igHashtags?: string[];
                    fbCaption?: string;
                    fbHashtags?: string[];
                };
                requestId?: string;
                emojiStyle?: EmojiStyle;
                avoidWords?: string;
                avoidWordsUsage?: Record<string, number>;
            },
            GeneratePostCopyResponse
        >(functions, "generatePostCopy");

        // Pass current settings to ensure fresh values are used
        const currentEmojiStyle = aiSettings.emojiStyle;
        const currentAvoidWords = aiSettings.avoidWords;

        try {
            const result = await generatePostCopy({
                workspaceId,
                dateId,
                regenerate: true,
                previousOutputs,
                requestId: crypto.randomUUID(),
                emojiStyle: currentEmojiStyle,
                avoidWords: currentAvoidWords,
            });

            if (result.data.status === "generated") {
                showToast('success', `Regenerated ${dateId}`);
            } else if (result.data.status === "error") {
                showToast('error', result.data.message || `Failed to regenerate ${dateId}`);
            }
        } catch (err) {
            console.error(`Regenerate error for ${dateId}:`, err);
            showToast('error', `Failed to regenerate ${dateId}`);
        } finally {
            setGeneratingIds(prev => {
                const next = new Set(prev);
                next.delete(dateId);
                return next;
            });
        }
    }, [user, workspaceId, showToast, aiSettings.emojiStyle, aiSettings.avoidWords]);

    const handleDelete = useCallback(async (dateId: string) => {
        if (!workspaceId) return;

        try {
            const docRef = doc(db, "workspaces", workspaceId, "post_days", dateId);
            await deleteDoc(docRef);

            setSelectedIds(prev => {
                if (prev.has(dateId)) {
                    const next = new Set(prev);
                    next.delete(dateId);
                    return next;
                }
                return prev;
            });

            showToast('success', `Deleted post for ${dateId}`);
        } catch (err) {
            console.error("Delete error:", err);
            showToast('error', `Failed to delete post for ${dateId}`);
        }
    }, [workspaceId, showToast]);

    const handleBulkDelete = useCallback(async () => {
        if (!workspaceId || selectedIds.size === 0) return;

        setIsBulkDeleting(true);
        let deleted = 0;
        let failed = 0;

        for (const dateId of selectedIds) {
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", dateId);
                await deleteDoc(docRef);
                deleted++;
            } catch (err) {
                console.error(`Delete error for ${dateId}:`, err);
                failed++;
            }
        }

        setSelectedIds(new Set());
        setShowBulkDeleteModal(false);
        setIsBulkDeleting(false);

        if (failed > 0) {
            showToast('warn', `Deleted ${deleted} posts, ${failed} failed.`);
        } else {
            showToast('success', `Deleted ${deleted} post${deleted !== 1 ? 's' : ''}.`);
        }
    }, [workspaceId, selectedIds, showToast]);

    const handleGenerateClick = () => {
        handleGenerateBatch();
    };

    const handleGenerateBatch = async (confirmedTargets?: PostDay[]) => {
        if (!user || !workspaceId) return;

        const targets = confirmedTargets || (selectedIds.size > 0
            ? filteredPosts.filter(p => selectedIds.has(getPostDocId(p)))
            : filteredPosts);

        if (targets.length === 0) return;

        // Check for image-only posts (have image but no starter text)
        // Only show confirmation if this is not already a confirmed call
        if (!confirmedTargets) {
            const imageOnlyPosts = targets.filter(p =>
                p.imageAssetId && (!p.starterText || p.starterText.trim() === "")
            );

            if (imageOnlyPosts.length > 0) {
                setImageOnlyCount(imageOnlyPosts.length);
                setPendingGenerateTargets(targets);
                setShowImageOnlyModal(true);
                return;
            }
        }

        setIsGenerating(true);

        const generatePostCopy = httpsCallable<
            {
                workspaceId: string;
                dateId: string;
                regenerate: boolean;
                generationMode?: GenerationMode;
                guidanceText?: string;
                previousOutputs?: {
                    igCaption?: string;
                    igHashtags?: string[];
                    fbCaption?: string;
                    fbHashtags?: string[];
                };
                requestId?: string;
                emojiStyle?: EmojiStyle;
                avoidWords?: string;
                avoidWordsUsage?: Record<string, number>;
            },
            GeneratePostCopyResponse
        >(functions, "generatePostCopy");

        // Capture current settings at start of batch to ensure consistency
        const currentEmojiStyle = aiSettings.emojiStyle;
        const currentAvoidWords = aiSettings.avoidWords;

        // Track avoid words usage across the entire batch (only used in sequential mode)
        let batchAvoidWordsUsage: Record<string, number> = {};

        let generated = 0;
        let regenerated = 0;
        let skippedPastUnsent = 0;
        let skippedTextOnlyEmpty = 0;
        let failed = 0;

        const toProcess: { post: PostDay; hadExistingAi: boolean }[] = [];

        for (const post of targets) {
            const isPast = isPostPastDue(post);
            if (isPast && post.status !== "sent") {
                skippedPastUnsent++;
                continue;
            }

            // Skip text-only posts with empty guidance text
            const effectiveMode = post.generationMode || (post.imageAssetId ? (post.starterText ? "hybrid" : "image") : "text");
            if (effectiveMode === "text" && (!post.starterText || post.starterText.trim() === "")) {
                skippedTextOnlyEmpty++;
                continue;
            }

            const hadExistingAi = !!(post.ai?.ig?.caption || post.ai?.fb?.caption);
            toProcess.push({ post, hadExistingAi });
        }

        if (generationMode === "sequential") {
            // Sequential mode: Process posts one at a time to track avoid-words usage across batch
            for (const item of toProcess) {
                const { post, hadExistingAi } = item;
                const docId = getPostDocId(post);
                setGeneratingIds(prev => new Set(prev).add(docId));

                try {
                    const previousOutputs = hadExistingAi ? {
                        igCaption: post.ai?.ig?.caption,
                        igHashtags: post.ai?.ig?.hashtags,
                        fbCaption: post.ai?.fb?.caption,
                        fbHashtags: post.ai?.fb?.hashtags,
                    } : undefined;

                    const result = await generatePostCopy({
                        workspaceId,
                        dateId: docId,
                        regenerate: true,
                        generationMode: post.generationMode,
                        guidanceText: post.starterText,
                        previousOutputs,
                        requestId: crypto.randomUUID(),
                        emojiStyle: currentEmojiStyle,
                        avoidWords: currentAvoidWords,
                        avoidWordsUsage: batchAvoidWordsUsage,
                    });

                    if (result.data.status === "generated") {
                        if (hadExistingAi) {
                            regenerated++;
                        } else {
                            generated++;
                        }
                        // Update batch usage from response for next iteration
                        if (result.data.avoidWordsUsage) {
                            batchAvoidWordsUsage = result.data.avoidWordsUsage;
                        }
                    }
                } catch (err) {
                    console.error(`Generate error for ${docId}:`, err);
                    failed++;
                } finally {
                    setGeneratingIds(prev => {
                        const next = new Set(prev);
                        next.delete(docId);
                        return next;
                    });
                }
            }
        } else {
            // Fast mode: Process posts concurrently (no cross-batch avoid-words tracking)
            const queue = [...toProcess];
            const inFlight: Promise<void>[] = [];

            const processOne = async (item: { post: PostDay; hadExistingAi: boolean }) => {
                const { post, hadExistingAi } = item;
                const docId = getPostDocId(post);
                setGeneratingIds(prev => new Set(prev).add(docId));

                try {
                    const previousOutputs = hadExistingAi ? {
                        igCaption: post.ai?.ig?.caption,
                        igHashtags: post.ai?.ig?.hashtags,
                        fbCaption: post.ai?.fb?.caption,
                        fbHashtags: post.ai?.fb?.hashtags,
                    } : undefined;

                    const result = await generatePostCopy({
                        workspaceId,
                        dateId: docId,
                        regenerate: true,
                        generationMode: post.generationMode,
                        guidanceText: post.starterText,
                        previousOutputs,
                        requestId: crypto.randomUUID(),
                        emojiStyle: currentEmojiStyle,
                        avoidWords: currentAvoidWords,
                        // No batch usage tracking in fast mode
                    });

                    if (result.data.status === "generated") {
                        if (hadExistingAi) {
                            regenerated++;
                        } else {
                            generated++;
                        }
                    }
                } catch (err) {
                    console.error(`Generate error for ${docId}:`, err);
                    failed++;
                } finally {
                    setGeneratingIds(prev => {
                        const next = new Set(prev);
                        next.delete(docId);
                        return next;
                    });
                }
            };

            while (queue.length > 0 || inFlight.length > 0) {
                while (queue.length > 0 && inFlight.length < CONCURRENCY_LIMIT) {
                    const item = queue.shift()!;
                    const promise = processOne(item).then(() => {
                        const idx = inFlight.indexOf(promise);
                        if (idx > -1) inFlight.splice(idx, 1);
                    });
                    inFlight.push(promise);
                }

                if (inFlight.length > 0) {
                    await Promise.race(inFlight);
                }
            }
        }

        setIsGenerating(false);

        const totalProcessed = generated + regenerated;
        const totalSkipped = skippedPastUnsent + skippedTextOnlyEmpty;

        if (totalProcessed === 0 && totalSkipped > 0) {
            const skipReasons: string[] = [];
            if (skippedPastUnsent > 0) skipReasons.push(`${skippedPastUnsent} past unsent`);
            if (skippedTextOnlyEmpty > 0) skipReasons.push(`${skippedTextOnlyEmpty} text-only without guidance`);
            showToast('warn', `Skipped all: ${skipReasons.join(', ')}.`);
        } else if (failed > 0 || totalSkipped > 0) {
            const parts: string[] = [];
            if (generated > 0) parts.push(`Generated ${generated}`);
            if (regenerated > 0) parts.push(`Regenerated ${regenerated}`);
            if (skippedPastUnsent > 0) parts.push(`Skipped ${skippedPastUnsent} (past unsent)`);
            if (skippedTextOnlyEmpty > 0) parts.push(`Skipped ${skippedTextOnlyEmpty} (text-only, no guidance)`);
            if (failed > 0) parts.push(`Failed ${failed}`);
            showToast('warn', parts.join(' • '));
        } else if (generated > 0 && regenerated > 0) {
            showToast('success', `Generated ${generated}, regenerated ${regenerated}.`);
        } else if (regenerated > 0) {
            showToast('success', `Regenerated ${regenerated} post${regenerated !== 1 ? 's' : ''}.`);
        } else {
            showToast('success', `Generated ${generated} post${generated !== 1 ? 's' : ''}.`);
        }
    };

    const handleExportComplete = useCallback((summary: { exported: number; skipped: number; exportedPostIds: string[] }) => {
        if (summary.skipped > 0) {
            showToast('warn', `Exported ${summary.exported} posts. Skipped ${summary.skipped} (missing image or caption).`);
        } else {
            showToast('success', `Exported ${summary.exported} post${summary.exported !== 1 ? 's' : ''} for Buffer.`);
        }
    }, [showToast]);

    // Handler for marking exported posts as uploaded
    const handleMarkAsUploaded = useCallback(async () => {
        if (!workspaceId) return;
        const result = await markPostsAsUploaded({ workspaceId });
        showToast('success', `Marked ${result.updatedCount} post${result.updatedCount !== 1 ? 's' : ''} as uploaded.`);
    }, [workspaceId, showToast]);

    // Find next planned posts (first future post with status uploaded or exported for each platform)
    const getNextPlannedPost = useCallback((platform: "instagram" | "facebook") => {
        const today = new Date().toISOString().split('T')[0];
        const futurePosts = postsWithoutPastUnsent
            .filter(p => p.date >= today)
            .filter(p => !p.platform || p.platform === platform)
            .filter(p => {
                const status = getLifecycleStatus(p);
                return status === "exported" || status === "uploaded";
            })
            .sort((a, b) => a.date.localeCompare(b.date));

        return futurePosts[0];
    }, [postsWithoutPastUnsent]);

    // Text CSV export handler
    const handleExportTextCsv = useCallback(() => {
        const postsToExport = selectedIds.size > 0
            ? filteredPosts.filter(p => selectedIds.has(getPostDocId(p)))
            : filteredPosts;

        const csv = generateTextCsv(postsToExport);
        const filename = getTextExportFilename();
        downloadTextCsv(csv, filename);

        showToast('success', `Exported text for ${postsToExport.length} post${postsToExport.length !== 1 ? 's' : ''}.`);
    }, [selectedIds, filteredPosts, showToast]);

    // Text CSV import complete handler
    const handleImportTextComplete = useCallback((summary: { updated: number; skipped: number }) => {
        if (summary.skipped > 0) {
            showToast('warn', `Updated ${summary.updated} caption${summary.updated !== 1 ? 's' : ''}. ${summary.skipped} row${summary.skipped !== 1 ? 's' : ''} skipped (not found).`);
        } else {
            showToast('success', `Updated ${summary.updated} caption${summary.updated !== 1 ? 's' : ''}.`);
        }
    }, [showToast]);

    const getPostsForExport = useCallback(() => {
        if (selectedIds.size > 0) {
            return filteredPosts.filter(p => selectedIds.has(getPostDocId(p)));
        }
        return filteredPosts;
    }, [selectedIds, filteredPosts]);

    // Posts PDF export handlers
    const handleExportPostsPdf = useCallback(() => {
        setPostsPdfError(null);
        setPostsPdfWarning(null);
        setIsExportingPostsPdf(true);
        setPostsPdfProgress(null);
    }, []);

    const handlePostsPdfComplete = useCallback((warning?: string) => {
        setIsExportingPostsPdf(false);
        setPostsPdfProgress(null);
        setPostsPdfError(null);
        setPostsPdfWarning(warning || null);
    }, []);

    const handlePostsPdfError = useCallback((error: string, stack?: string) => {
        console.error("[Posts PDF] Export failed:", error);
        if (stack) {
            console.error("[Posts PDF] Stack trace:", stack);
        }
        setIsExportingPostsPdf(false);
        setPostsPdfProgress(null);
        setPostsPdfError(error);
    }, []);

    const handlePostsPdfProgress = useCallback((progress: PostsPdfExportProgress) => {
        setPostsPdfProgress((prev) => {
            if (!prev) return progress;
            if (prev.phase === progress.phase &&
                prev.current === progress.current &&
                prev.total === progress.total) {
                return prev;
            }
            return progress;
        });
    }, []);

    // Show loading while workspace is being resolved
    if (workspaceLoading || !workspaceId) {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                <DashboardCard>
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Setting up your workspace...</p>
                    </div>
                </DashboardCard>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <PageHeader
                title="Review & Generate"
                subtitle="Fine-tune AI output and push to social channels."
                actions={
                    <>
                        {/* Generation Mode Toggle */}
                        <div className="flex items-center gap-2 mr-2">
                            <button
                                onClick={() => setGenerationMode(generationMode === "fast" ? "sequential" : "fast")}
                                disabled={isGenerating}
                                className={`
                                    relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                                    transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2
                                    disabled:opacity-50 disabled:cursor-not-allowed
                                    ${generationMode === "sequential" ? 'bg-purple-500' : 'bg-[var(--bg-tertiary)]'}
                                `}
                                title={generationMode === "sequential" ? "Sequential mode: Tracks avoid-words across batch" : "Fast mode: Concurrent processing"}
                            >
                                <span
                                    className={`
                                        pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                                        transition duration-200 ease-in-out
                                        ${generationMode === "sequential" ? 'translate-x-5' : 'translate-x-0'}
                                    `}
                                />
                            </button>
                            <span className="text-xs text-[var(--text-secondary)]" title={generationMode === "sequential" ? "Processes posts one at a time to enforce avoid-words limits across batch" : "Processes multiple posts at once (faster)"}>
                                {generationMode === "sequential" ? "Sequential" : "Fast"}
                            </span>
                        </div>

                        <button
                            onClick={handleGenerateClick}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Play size={16} className="fill-current" />
                                    Generate {selectedIds.size > 0 ? "Selected" : "All"}
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => setShowExportModal(true)}
                            disabled={filteredPosts.length === 0}
                            className="inline-flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={16} />
                            Export for Buffer
                        </button>

                        {exportedCount > 0 && (
                            <button
                                onClick={() => setShowMarkUploadedModal(true)}
                                className="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Upload size={16} />
                                Mark Uploaded ({exportedCount})
                            </button>
                        )}

                        {selectedIds.size > 0 && (
                            <button
                                onClick={() => setShowBulkDeleteModal(true)}
                                className="inline-flex items-center gap-2 bg-red-500 hover:bg-red-600 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                <Trash2 size={16} />
                                Delete ({selectedIds.size})
                            </button>
                        )}
                    </>
                }
            />

            {/* Workflow Summary */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                {/* Status Counts */}
                <div className="bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-primary)]">
                    <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                        Workflow Status
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex justify-between">
                            <span className="text-[var(--text-muted)]">Draft</span>
                            <span className="font-medium text-[var(--text-primary)]">{lifecycleCounts.draft}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-amber-600 dark:text-amber-400">Exported</span>
                            <span className="font-medium text-amber-600 dark:text-amber-400">{lifecycleCounts.exported}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-blue-600 dark:text-blue-400">Uploaded</span>
                            <span className="font-medium text-blue-600 dark:text-blue-400">{lifecycleCounts.uploaded}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-emerald-600 dark:text-emerald-400">Posted</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">{lifecycleCounts.posted}</span>
                        </div>
                    </div>
                </div>

                {/* Next Planned IG Post */}
                <div className="bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-primary)]">
                    <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Instagram size={14} className="text-pink-500" />
                        Next Instagram Post
                    </h4>
                    {(() => {
                        const nextIg = getNextPlannedPost("instagram");
                        if (nextIg) {
                            return (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar size={14} className="text-[var(--text-muted)]" />
                                        <span className="font-medium text-[var(--text-primary)]">
                                            {new Date(nextIg.date + 'T12:00:00').toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                        </span>
                                    </div>
                                    {nextIg.postingTimeIg && (
                                        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                            <Clock size={14} className="text-[var(--text-muted)]" />
                                            <span>{nextIg.postingTimeIg}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <p className="text-sm text-[var(--text-muted)]">No scheduled posts</p>
                        );
                    })()}
                </div>

                {/* Next Planned FB Post */}
                <div className="bg-[var(--bg-card)] rounded-lg p-4 border border-[var(--border-primary)]">
                    <h4 className="text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3 flex items-center gap-2">
                        <Facebook size={14} className="text-blue-500" />
                        Next Facebook Post
                    </h4>
                    {(() => {
                        const nextFb = getNextPlannedPost("facebook");
                        if (nextFb) {
                            return (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 text-sm">
                                        <Calendar size={14} className="text-[var(--text-muted)]" />
                                        <span className="font-medium text-[var(--text-primary)]">
                                            {new Date(nextFb.date + 'T12:00:00').toLocaleDateString('en-US', {
                                                weekday: 'short',
                                                month: 'short',
                                                day: 'numeric',
                                            })}
                                        </span>
                                    </div>
                                    {nextFb.postingTimeFb && (
                                        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                                            <Clock size={14} className="text-[var(--text-muted)]" />
                                            <span>{nextFb.postingTimeFb}</span>
                                        </div>
                                    )}
                                </div>
                            );
                        }
                        return (
                            <p className="text-sm text-[var(--text-muted)]">No scheduled posts</p>
                        );
                    })()}
                </div>
            </div>

            {/* Secondary actions row with filters and PDF export */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
                <div className="flex flex-wrap items-center gap-3">
                    <PlatformFilter value={platformFilter} onChange={setPlatformFilter} />
                    <LifecycleFilter
                        value={lifecycleFilter}
                        onChange={setLifecycleFilter}
                        counts={lifecycleCounts}
                    />
                </div>

                <div className="flex items-center gap-3">
                    {/* Text CSV Export/Import */}
                    <button
                        onClick={handleExportTextCsv}
                        disabled={filteredPosts.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                        title="Export post text to CSV"
                    >
                        <FileDown size={14} />
                        Export Text
                    </button>
                    <button
                        onClick={() => setShowImportTextModal(true)}
                        disabled={filteredPosts.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                        title="Import post text from CSV"
                    >
                        <FileUp size={14} />
                        Import Text
                    </button>

                    <div className="w-px h-6 bg-[var(--border-primary)]" />

                    {/* PDF Export */}
                    <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                        <input
                            type="checkbox"
                            checked={pdfIncludeImages}
                            onChange={(e) => setPdfIncludeImages(e.target.checked)}
                            disabled={isExportingPostsPdf}
                            className="h-3.5 w-3.5 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] disabled:opacity-50"
                        />
                        Include images
                    </label>
                    <button
                        onClick={handleExportPostsPdf}
                        disabled={isExportingPostsPdf || filteredPosts.length === 0}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                    >
                        {isExportingPostsPdf ? (
                            <>
                                <Loader2 size={14} className="animate-spin" />
                                <span className="max-w-[180px] truncate">
                                    {postsPdfProgress
                                        ? getPostsPhaseText(postsPdfProgress)
                                        : "Preparing..."}
                                </span>
                            </>
                        ) : (
                            <>
                                <FileText size={14} />
                                Posts PDF
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* AI behavior note */}
            <p className="text-xs text-[var(--text-muted)] mb-3">
                AI generates captions based on each post&apos;s generation mode: Image (analyze image), Hybrid (image + guidance), or Text (guidance only).
            </p>

            {/* Posts PDF Error/Warning Display */}
            {postsPdfError && (
                <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-start gap-2">
                        <span className="text-red-600 dark:text-red-400 text-sm font-medium">PDF Export Failed:</span>
                        <span className="text-red-700 dark:text-red-300 text-sm flex-1">{postsPdfError}</span>
                        <button
                            onClick={() => setPostsPdfError(null)}
                            className="text-red-500 hover:text-red-700 dark:hover:text-red-300 text-sm"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            {postsPdfWarning && !postsPdfError && (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                    <div className="flex items-start gap-2">
                        <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">PDF Exported with Warning:</span>
                        <span className="text-amber-700 dark:text-amber-300 text-sm flex-1">{postsPdfWarning}</span>
                        <button
                            onClick={() => setPostsPdfWarning(null)}
                            className="text-amber-500 hover:text-amber-700 dark:hover:text-amber-300 text-sm"
                        >
                            Dismiss
                        </button>
                    </div>
                </div>
            )}

            <DashboardCard noPadding>
                {loading ? (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Loading posts for review...</p>
                    </div>
                ) : (
                    <ReviewTable
                        posts={filteredPosts}
                        selectedIds={selectedIds}
                        generatingIds={generatingIds}
                        platformFilter={platformFilter}
                        onSelectRow={onSelectRow}
                        onSelectAll={onSelectAll}
                        onRegenerate={handleRegenerateSingle}
                        onDelete={handleDelete}
                    />
                )}
            </DashboardCard>

            {/* Toast */}
            {toast && (
                <Toast
                    type={toast.type}
                    message={toast.message}
                    onClose={() => setToast(null)}
                />
            )}

            {/* Buffer Export Modal */}
            <BufferExportModal
                open={showExportModal}
                posts={getPostsForExport()}
                imageUrls={imageUrls}
                imageUrlsLoading={imageUrlsLoading}
                onClose={() => setShowExportModal(false)}
                onExportComplete={handleExportComplete}
            />

            {/* Posts PDF Export - Offscreen Render */}
            {isExportingPostsPdf && (
                <PostsPdfPrintRoot
                    posts={filteredPosts}
                    workspaceId={workspaceId}
                    includeImages={pdfIncludeImages}
                    onComplete={handlePostsPdfComplete}
                    onError={handlePostsPdfError}
                    onProgress={handlePostsPdfProgress}
                />
            )}

            {/* Bulk Delete Confirmation Modal */}
            <ConfirmModal
                open={showBulkDeleteModal}
                title="Delete Selected Posts?"
                description={`Are you sure you want to delete ${selectedIds.size} post${selectedIds.size !== 1 ? 's' : ''}? This action cannot be undone.`}
                confirmText={isBulkDeleting ? "Deleting..." : "Delete"}
                cancelText="Cancel"
                onConfirm={handleBulkDelete}
                onCancel={() => setShowBulkDeleteModal(false)}
                confirmVariant="danger"
            />

            {/* Image-Only Generation Confirmation Modal */}
            <ConfirmModal
                open={showImageOnlyModal}
                title="Generate from Images?"
                description={`${imageOnlyCount} post${imageOnlyCount !== 1 ? 's have' : ' has'} no description text but ${imageOnlyCount !== 1 ? 'have images' : 'has an image'}. The AI will analyze the image${imageOnlyCount !== 1 ? 's' : ''} to generate post content. This uses vision AI and may take longer.`}
                confirmText="Yes, Analyze Images"
                cancelText="Cancel"
                onConfirm={() => {
                    setShowImageOnlyModal(false);
                    handleGenerateBatch(pendingGenerateTargets);
                }}
                onCancel={() => {
                    setShowImageOnlyModal(false);
                    setPendingGenerateTargets([]);
                }}
            />

            {/* Mark as Uploaded Modal */}
            <MarkUploadedModal
                open={showMarkUploadedModal}
                exportedCount={exportedCount}
                onClose={() => setShowMarkUploadedModal(false)}
                onConfirm={handleMarkAsUploaded}
            />

            {/* Import Text CSV Modal */}
            {workspaceId && (
                <ImportTextCsvModal
                    open={showImportTextModal}
                    posts={filteredPosts}
                    workspaceId={workspaceId}
                    onClose={() => setShowImportTextModal(false)}
                    onImportComplete={handleImportTextComplete}
                />
            )}
        </div>
    );
}
