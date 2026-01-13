"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions, storage } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, deleteDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import { httpsCallable } from "firebase/functions";
import ReviewTable from "@/components/ReviewTable";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import Toast from "@/components/ui/Toast";
import BufferExportModal from "@/components/BufferExportModal";
import { PostDay } from "@/lib/types";
import { Play, Download } from "lucide-react";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";
import { isPastOrTodayInDenver } from "@/lib/utils";

const CONCURRENCY_LIMIT = 3;

interface GeneratePostCopyResponse {
    success: boolean;
    status: "generated" | "already_generated" | "error";
    message?: string;
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

    // Use shared hook for filtering past unsent posts (controlled from Settings)
    const { filteredPosts, hidePastUnsent } = useHidePastUnsent(posts);

    // When filter is enabled, deselect any posts that become hidden
    useEffect(() => {
        if (!hidePastUnsent) return;
        const visibleDates = new Set(filteredPosts.map(p => p.date));
        setSelectedIds(prev => {
            const filtered = new Set([...prev].filter(id => visibleDates.has(id)));
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
            const postsData = snapshot.docs.map((doc) => ({
                ...doc.data(),
            })) as PostDay[];
            setPosts(postsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, workspaceId]);

    // Fetch image URLs from assets collection for Buffer export
    // Resolves URLs for all assets (both imported with downloadUrl and uploaded with storagePath)
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
                    // Imported images have downloadUrl stored directly
                    urls.set(assetId, data.downloadUrl);
                } else if (data.storagePath) {
                    // Uploaded images need URL resolved from storagePath
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

            // Wait for all URL resolutions to complete
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
        if (selected) setSelectedIds(new Set(filteredPosts.map(p => p.date)));
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
            },
            GeneratePostCopyResponse
        >(functions, "generatePostCopy");

        try {
            const result = await generatePostCopy({
                workspaceId,
                dateId,
                regenerate: true,
                previousOutputs,
                requestId: crypto.randomUUID(),
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
    }, [user, workspaceId, showToast]);

    const handleDelete = useCallback(async (dateId: string) => {
        if (!workspaceId) return;

        try {
            const docRef = doc(db, "workspaces", workspaceId, "post_days", dateId);
            await deleteDoc(docRef);

            // Remove from selection state if selected
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

    const handleGenerateBatch = async () => {
        if (!user || !workspaceId) return;

        const targets = selectedIds.size > 0
            ? filteredPosts.filter(p => selectedIds.has(p.date))
            : filteredPosts;

        if (targets.length === 0) return;

        setIsGenerating(true);

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
            },
            GeneratePostCopyResponse
        >(functions, "generatePostCopy");

        // Track counts
        let generated = 0;      // New posts (had no AI before)
        let regenerated = 0;    // Existing posts (had AI before)
        let skippedMissingImage = 0;
        let skippedPastUnsent = 0;
        let failed = 0;

        // Filter out posts that should be skipped and categorize the rest
        const toProcess: { post: PostDay; hadExistingAi: boolean }[] = [];

        for (const post of targets) {
            // Skip rule 1: Missing image
            if (!post.imageAssetId) {
                skippedMissingImage++;
                continue;
            }

            // Skip rule 2: Past date and not sent
            const isPast = isPastOrTodayInDenver(post.date);
            if (isPast && post.status !== "sent") {
                skippedPastUnsent++;
                continue;
            }

            // Check if post already has AI content
            const hadExistingAi = !!(post.ai?.ig?.caption || post.ai?.fb?.caption);
            toProcess.push({ post, hadExistingAi });
        }

        // Process in batches with concurrency limit
        const queue = [...toProcess];
        const inFlight: Promise<void>[] = [];

        const processOne = async (item: { post: PostDay; hadExistingAi: boolean }) => {
            const { post, hadExistingAi } = item;
            setGeneratingIds(prev => new Set(prev).add(post.date));

            try {
                // Always regenerate - pass previous outputs if they exist
                const previousOutputs = hadExistingAi ? {
                    igCaption: post.ai?.ig?.caption,
                    igHashtags: post.ai?.ig?.hashtags,
                    fbCaption: post.ai?.fb?.caption,
                    fbHashtags: post.ai?.fb?.hashtags,
                } : undefined;

                const result = await generatePostCopy({
                    workspaceId,
                    dateId: post.date,
                    regenerate: true, // Always regenerate to overwrite existing
                    previousOutputs,
                    requestId: crypto.randomUUID(),
                });

                if (result.data.status === "generated") {
                    if (hadExistingAi) {
                        regenerated++;
                    } else {
                        generated++;
                    }
                }
                // Note: "already_generated" should not happen with regenerate=true
            } catch (err) {
                console.error(`Generate error for ${post.date}:`, err);
                failed++;
            } finally {
                setGeneratingIds(prev => {
                    const next = new Set(prev);
                    next.delete(post.date);
                    return next;
                });
            }
        };

        while (queue.length > 0 || inFlight.length > 0) {
            // Fill up to concurrency limit
            while (queue.length > 0 && inFlight.length < CONCURRENCY_LIMIT) {
                const item = queue.shift()!;
                const promise = processOne(item).then(() => {
                    const idx = inFlight.indexOf(promise);
                    if (idx > -1) inFlight.splice(idx, 1);
                });
                inFlight.push(promise);
            }

            // Wait for at least one to complete
            if (inFlight.length > 0) {
                await Promise.race(inFlight);
            }
        }

        setIsGenerating(false);

        // Build summary toast
        const totalSkipped = skippedMissingImage + skippedPastUnsent;
        const totalProcessed = generated + regenerated;

        if (totalProcessed === 0 && totalSkipped > 0) {
            // Nothing processed, only skips
            const skipReasons: string[] = [];
            if (skippedMissingImage > 0) skipReasons.push(`${skippedMissingImage} missing image`);
            if (skippedPastUnsent > 0) skipReasons.push(`${skippedPastUnsent} past unsent`);
            showToast('warn', `Skipped all: ${skipReasons.join(', ')}.`);
        } else if (failed > 0 || totalSkipped > 0) {
            // Mixed results
            const parts: string[] = [];
            if (generated > 0) parts.push(`Generated ${generated}`);
            if (regenerated > 0) parts.push(`Regenerated ${regenerated}`);
            if (skippedMissingImage > 0) parts.push(`Skipped ${skippedMissingImage} (missing image)`);
            if (skippedPastUnsent > 0) parts.push(`Skipped ${skippedPastUnsent} (past unsent)`);
            if (failed > 0) parts.push(`Failed ${failed}`);
            showToast('warn', parts.join(' • '));
        } else if (generated > 0 && regenerated > 0) {
            // Both generated and regenerated
            showToast('success', `Generated ${generated}, regenerated ${regenerated}.`);
        } else if (regenerated > 0) {
            // Only regenerated
            showToast('success', `Regenerated ${regenerated} post${regenerated !== 1 ? 's' : ''}.`);
        } else {
            // Only generated
            showToast('success', `Generated ${generated} post${generated !== 1 ? 's' : ''}.`);
        }
    };

    // Handle export completion
    const handleExportComplete = useCallback((summary: { exported: number; skipped: number }) => {
        if (summary.skipped > 0) {
            showToast('warn', `Exported ${summary.exported} posts. Skipped ${summary.skipped} (missing image or caption).`);
        } else {
            showToast('success', `Exported ${summary.exported} post${summary.exported !== 1 ? 's' : ''} for Buffer.`);
        }
    }, [showToast]);

    // Get posts for export (selected or all)
    const getPostsForExport = useCallback(() => {
        if (selectedIds.size > 0) {
            return filteredPosts.filter(p => selectedIds.has(p.date));
        }
        return filteredPosts;
    }, [selectedIds, filteredPosts]);

    // Show loading while workspace is being resolved
    if (workspaceLoading || !workspaceId) {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                <DashboardCard>
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-500 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-500">Setting up your workspace...</p>
                    </div>
                </DashboardCard>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <PageHeader
                title="Review & AI Generation"
                subtitle="Fine-tune AI output and push to social channels."
                actions={
                    <>
                        <button
                            onClick={handleGenerateBatch}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGenerating ? (
                                <>
                                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-teal-500" />
                                    Generating...
                                </>
                            ) : (
                                <>
                                    <Play size={16} className="text-teal-600 fill-teal-600" />
                                    Generate {selectedIds.size > 0 ? "Selected" : "All"}
                                </>
                            )}
                        </button>

                        <button
                            onClick={() => setShowExportModal(true)}
                            disabled={filteredPosts.length === 0}
                            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Download size={16} />
                            Export for Buffer
                        </button>
                    </>
                }
            />

            {/* AI behavior note */}
            <p className="text-xs text-gray-400 mb-3">
                AI generates captions from your description only. Images are ignored.
            </p>

            <DashboardCard noPadding>
                {loading ? (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-500 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-500">Loading posts for review...</p>
                    </div>
                ) : (
                    <ReviewTable
                        posts={filteredPosts}
                        selectedIds={selectedIds}
                        generatingIds={generatingIds}
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
        </div>
    );
}
