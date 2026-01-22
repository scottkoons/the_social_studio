"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import InputTable from "@/components/InputTable";
import CSVImport from "@/components/CSVImport";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import Toast from "@/components/ui/Toast";
import { Plus, Trash2, X } from "lucide-react";
import { format, addDays } from "date-fns";
import { PostDay, getPostDocId } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";
import { generatePlatformPostingTimes } from "@/lib/postingTime";

export default function InputPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const searchParams = useSearchParams();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Date from query param for highlighting/scrolling
    const [highlightedDate, setHighlightedDate] = useState<string | null>(null);

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Add row state
    const [isAdding, setIsAdding] = useState(false);

    // Toast state
    const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Use shared hook for filtering past unsent posts (controlled from Settings)
    const { filteredPosts, hidePastUnsent } = useHidePastUnsent(posts);

    // When filter is enabled, deselect any posts that become hidden
    useEffect(() => {
        if (!hidePastUnsent) return;
        const visibleIds = new Set(filteredPosts.map(p => getPostDocId(p)));
        setSelectedIds(prev => {
            const filtered = new Set([...prev].filter(id => visibleIds.has(id)));
            return filtered.size !== prev.size ? filtered : prev;
        });
    }, [hidePastUnsent, filteredPosts]);

    // Read date query param on mount
    useEffect(() => {
        const dateParam = searchParams.get("date");
        if (dateParam) {
            setHighlightedDate(dateParam);
        }
    }, [searchParams]);

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

            // Clear any selected IDs that no longer exist
            setSelectedIds(prev => {
                const existingIds = new Set(postsData.map(p => getPostDocId(p)));
                const filtered = new Set([...prev].filter(id => existingIds.has(id)));
                return filtered.size !== prev.size ? filtered : prev;
            });
        });

        return () => unsubscribe();
    }, [user, workspaceId]);

    const onSelectRow = (id: string, selected: boolean) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (selected) next.add(id);
            else next.delete(id);
            return next;
        });
    };

    const onSelectAll = (selected: boolean) => {
        if (selected) {
            setSelectedIds(new Set(filteredPosts.map(p => getPostDocId(p))));
        } else {
            setSelectedIds(new Set());
        }
    };

    const handleAddRow = async () => {
        if (!user || !workspaceId || isAdding) return;

        setIsAdding(true);

        // Find the next available date
        let nextDate = new Date();
        let dateStr = format(nextDate, "yyyy-MM-dd");
        const today = getTodayInDenver();
        if (dateStr < today) dateStr = today;

        // Get existing dates
        const existingDates = new Set(posts.map(p => p.date));

        // Find next available date
        while (existingDates.has(dateStr)) {
            nextDate = addDays(nextDate, 1);
            dateStr = format(nextDate, "yyyy-MM-dd");
        }

        try {
            // Create ONE document per date (posts to both FB & IG)
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

            showToast('success', `Added post for ${dateStr}.`);
        } catch (error) {
            console.error("Error adding row:", error);
            showToast('error', "Failed to add row. Please try again.");
        } finally {
            setIsAdding(false);
        }
    };

    const handleDeleteClick = () => {
        if (selectedIds.size === 0) return;
        setShowDeleteModal(true);
    };

    const handleDeleteConfirm = async () => {
        if (!workspaceId || selectedIds.size === 0) return;

        setIsDeleting(true);

        try {
            const batch = writeBatch(db);

            for (const docId of selectedIds) {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);
                batch.delete(docRef);
            }

            await batch.commit();

            const deletedCount = selectedIds.size;
            setSelectedIds(new Set());
            setShowDeleteModal(false);
            showToast('success', `Deleted ${deletedCount} post${deletedCount !== 1 ? 's' : ''}.`);
        } catch (error) {
            console.error("Error deleting posts:", error);
            showToast('error', "Failed to delete posts. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

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
                title="Content Input"
                subtitle="Edit and manage your scheduled posts."
                actions={
                    <>
                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleDeleteClick}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-2 bg-[var(--status-error)] hover:opacity-90 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Trash2 size={16} />
                                Delete ({selectedIds.size})
                            </button>
                        )}
                        <button
                            onClick={handleAddRow}
                            disabled={isAdding}
                            className="inline-flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isAdding ? (
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                            ) : (
                                <Plus size={16} />
                            )}
                            {isAdding ? "Adding..." : "Add Row"}
                        </button>
                    </>
                }
            />

            {/* CSV Import Drop Zone */}
            <div className="mb-6">
                <CSVImport />
            </div>

            <DashboardCard noPadding>
                {loading ? (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Loading your schedule...</p>
                    </div>
                ) : (
                    <InputTable
                        posts={filteredPosts}
                        selectedIds={selectedIds}
                        onSelectRow={onSelectRow}
                        onSelectAll={onSelectAll}
                        highlightedDate={highlightedDate}
                        onHighlightClear={() => setHighlightedDate(null)}
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

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        <div className="bg-[var(--bg-secondary)] px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between">
                            <h3 className="font-semibold text-[var(--text-primary)]">Delete posts?</h3>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-5 py-5">
                            <p className="text-[var(--text-secondary)]">
                                This will permanently delete <span className="font-semibold text-[var(--text-primary)]">{selectedIds.size}</span> scheduled post{selectedIds.size !== 1 ? 's' : ''}.
                            </p>
                            <p className="text-sm text-[var(--text-tertiary)] mt-2">
                                This action cannot be undone. Associated images will not be deleted.
                            </p>
                        </div>

                        <div className="px-5 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--status-error)] hover:opacity-90 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <>
                                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                        Deleting...
                                    </>
                                ) : (
                                    <>
                                        <Trash2 size={16} />
                                        Delete
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
