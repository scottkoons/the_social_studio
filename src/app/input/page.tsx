"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import InputTable from "@/components/InputTable";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import Toast from "@/components/ui/Toast";
import { Plus, Trash2, X } from "lucide-react";
import { format, addDays } from "date-fns";
import { PostDay, PostPlatform, getPostDocId } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";
import { randomTimeInWindow5Min } from "@/lib/postingTime";

type PlatformFilter = "all" | "facebook" | "instagram";

export default function InputPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const searchParams = useSearchParams();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Platform filter
    const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");

    // Date from query param for highlighting/scrolling
    const [highlightedDate, setHighlightedDate] = useState<string | null>(null);

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Add row modal state
    const [showAddModal, setShowAddModal] = useState(false);
    const [newPostPlatform, setNewPostPlatform] = useState<PostPlatform>("facebook");
    const [isAdding, setIsAdding] = useState(false);

    // Toast state
    const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Use shared hook for filtering past unsent posts (controlled from Settings)
    const { filteredPosts: postsWithoutPast, hidePastUnsent } = useHidePastUnsent(posts);

    // Apply platform filter
    const filteredPosts = postsWithoutPast.filter(p => {
        if (platformFilter === "all") return true;
        // Legacy posts without platform default to "facebook"
        const postPlatform = p.platform || "facebook";
        return postPlatform === platformFilter;
    });

    // When filter is enabled, deselect any posts that become hidden
    useEffect(() => {
        if (!hidePastUnsent && platformFilter === "all") return;
        const visibleIds = new Set(filteredPosts.map(p => getPostDocId(p)));
        setSelectedIds(prev => {
            const filtered = new Set([...prev].filter(id => visibleIds.has(id)));
            return filtered.size !== prev.size ? filtered : prev;
        });
    }, [hidePastUnsent, filteredPosts, platformFilter]);

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
                docId: docSnap.id, // Store the actual Firestore doc ID
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

    const handleAddClick = () => {
        setShowAddModal(true);
    };

    const handleAddConfirm = async () => {
        if (!user || !workspaceId) return;

        setIsAdding(true);

        // Find the next available date for this platform
        let nextDate = new Date();
        let dateStr = format(nextDate, "yyyy-MM-dd");
        const today = getTodayInDenver();
        if (dateStr < today) dateStr = today;

        // Get existing dates for this platform
        const existingDatesForPlatform = new Set(
            posts
                .filter(p => (p.platform || "facebook") === newPostPlatform)
                .map(p => p.date)
        );

        while (existingDatesForPlatform.has(dateStr)) {
            nextDate = addDays(nextDate, 1);
            dateStr = format(nextDate, "yyyy-MM-dd");
        }

        try {
            // New doc ID format: date-platform
            const docId = `${dateStr}-${newPostPlatform}`;
            const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);
            const postingTime = randomTimeInWindow5Min(dateStr, `${newPostPlatform}-${dateStr}`);

            await setDoc(docRef, {
                date: dateStr,
                platform: newPostPlatform,
                starterText: "",
                postingTime,
                postingTimeSource: "auto",
                status: "input",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });

            setShowAddModal(false);
            showToast('success', `Added new ${newPostPlatform === 'facebook' ? 'Facebook' : 'Instagram'} post for ${dateStr}.`);
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
                secondaryActions={
                    <div className="flex items-center gap-1 bg-[var(--bg-tertiary)] rounded-lg p-1">
                        {(["all", "facebook", "instagram"] as PlatformFilter[]).map((filter) => (
                            <button
                                key={filter}
                                onClick={() => setPlatformFilter(filter)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                                    platformFilter === filter
                                        ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                                }`}
                            >
                                {filter === "all" ? "All" : filter === "facebook" ? "Facebook" : "Instagram"}
                            </button>
                        ))}
                    </div>
                }
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
                            onClick={handleAddClick}
                            className="inline-flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
                        >
                            <Plus size={16} />
                            Add Row
                        </button>
                    </>
                }
            />

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

            {/* Add Row Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl max-w-sm w-full overflow-hidden">
                        <div className="bg-[var(--bg-secondary)] px-5 py-4 border-b border-[var(--border-primary)] flex items-center justify-between">
                            <h3 className="font-semibold text-[var(--text-primary)]">Add New Post</h3>
                            <button
                                onClick={() => setShowAddModal(false)}
                                disabled={isAdding}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="px-5 py-5">
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                Platform
                            </label>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setNewPostPlatform("facebook")}
                                    disabled={isAdding}
                                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors border ${
                                        newPostPlatform === "facebook"
                                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                                            : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--bg-card-hover)]"
                                    }`}
                                >
                                    Facebook
                                </button>
                                <button
                                    onClick={() => setNewPostPlatform("instagram")}
                                    disabled={isAdding}
                                    className={`flex-1 px-4 py-3 rounded-lg text-sm font-medium transition-colors border ${
                                        newPostPlatform === "instagram"
                                            ? "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300 border-pink-300 dark:border-pink-700"
                                            : "bg-[var(--bg-tertiary)] text-[var(--text-secondary)] border-[var(--border-primary)] hover:bg-[var(--bg-card-hover)]"
                                    }`}
                                >
                                    Instagram
                                </button>
                            </div>
                            <p className="text-xs text-[var(--text-muted)] mt-3">
                                A new post will be created for the next available date.
                            </p>
                        </div>

                        <div className="px-5 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-end gap-3">
                            <button
                                onClick={() => setShowAddModal(false)}
                                disabled={isAdding}
                                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddConfirm}
                                disabled={isAdding}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isAdding ? (
                                    <>
                                        <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                        Adding...
                                    </>
                                ) : (
                                    <>
                                        <Plus size={16} />
                                        Add Post
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>
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
