"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db, functions } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import ReviewTable from "@/components/ReviewTable";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import Toast from "@/components/ui/Toast";
import { PostDay } from "@/lib/types";
import { Play, Send, CheckCircle2 } from "lucide-react";
import { sendToBufferStub } from "@/lib/buffer-stubs";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";

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
    const [isSending, setIsSending] = useState(false);

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

    const handleGenerateBatch = async () => {
        if (!user || !workspaceId) return;

        const targets = selectedIds.size > 0
            ? filteredPosts.filter(p => selectedIds.has(p.date))
            : filteredPosts;

        if (targets.length === 0) return;

        setIsGenerating(true);

        const generatePostCopy = httpsCallable<
            { workspaceId: string; dateId: string; regenerate: boolean },
            GeneratePostCopyResponse
        >(functions, "generatePostCopy");

        let generated = 0;
        let skipped = 0;
        let failed = 0;

        // Process in batches with concurrency limit
        const queue = [...targets];
        const inFlight: Promise<void>[] = [];

        const processOne = async (post: PostDay) => {
            setGeneratingIds(prev => new Set(prev).add(post.date));

            try {
                const result = await generatePostCopy({
                    workspaceId,
                    dateId: post.date,
                    regenerate: false,
                });

                if (result.data.status === "generated") {
                    generated++;
                } else if (result.data.status === "already_generated") {
                    skipped++;
                }
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
                const post = queue.shift()!;
                const promise = processOne(post).then(() => {
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

        // Show summary toast
        if (failed > 0) {
            showToast('warn', `${generated} generated, ${skipped} skipped, ${failed} failed.`);
        } else if (skipped > 0) {
            showToast('success', `${generated} generated, ${skipped} already had content.`);
        } else {
            showToast('success', `Generated content for ${generated} post${generated !== 1 ? 's' : ''}.`);
        }
    };

    const handleSendToBuffer = async (onlySelected: boolean) => {
        if (!user || !workspaceId) return;
        const targets = onlySelected
            ? posts.filter(p => selectedIds.has(p.date))
            : posts;

        if (targets.length === 0) return;

        setIsSending(true);
        let successCount = 0;
        let failCount = 0;

        for (const post of targets) {
            const result = await sendToBufferStub(post);
            if (result.success) {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
                await updateDoc(docRef, {
                    status: "sent",
                    buffer: { pushedAt: result.pushedAt },
                    updatedAt: serverTimestamp()
                });
                successCount++;
            } else {
                failCount++;
            }
        }

        setIsSending(false);

        if (failCount > 0) {
            showToast('warn', `Sent ${successCount} posts. ${failCount} skipped (past date).`);
        } else {
            showToast('success', `Successfully sent ${successCount} post${successCount !== 1 ? 's' : ''} to Buffer.`);
        }
    };

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
                            onClick={() => handleSendToBuffer(true)}
                            disabled={selectedIds.size === 0 || isSending}
                            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send size={16} />
                            Send Selected
                        </button>

                        <button
                            onClick={() => handleSendToBuffer(false)}
                            disabled={isSending || posts.length === 0}
                            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSending ? (
                                <>
                                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                    Sending...
                                </>
                            ) : (
                                <>
                                    <CheckCircle2 size={16} />
                                    Send All
                                </>
                            )}
                        </button>
                    </>
                }
            />

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
        </div>
    );
}
