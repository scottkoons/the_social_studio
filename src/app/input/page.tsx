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
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { useHidePastUnsent } from "@/hooks/useHidePastUnsent";
import { randomTimeInWindow5Min } from "@/lib/postingTime";

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

    // Toast state
    const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

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
            const postsData = snapshot.docs.map((doc) => ({
                ...doc.data(),
            })) as PostDay[];
            setPosts(postsData);
            setLoading(false);

            // Clear any selected IDs that no longer exist
            setSelectedIds(prev => {
                const existingDates = new Set(postsData.map(p => p.date));
                const filtered = new Set([...prev].filter(id => existingDates.has(id)));
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
            setSelectedIds(new Set(filteredPosts.map(p => p.date)));
        } else {
            setSelectedIds(new Set());
        }
    };

    const addRow = async () => {
        if (!user || !workspaceId) return;

        // Find the next available date
        let nextDate = new Date();
        let dateStr = format(nextDate, "yyyy-MM-dd");
        const today = getTodayInDenver();
        if (dateStr < today) dateStr = today;

        const existingDates = new Set(posts.map(p => p.date));
        while (existingDates.has(dateStr)) {
            nextDate = addDays(nextDate, 1);
            dateStr = format(nextDate, "yyyy-MM-dd");
        }

        try {
            const docRef = doc(db, "workspaces", workspaceId, "post_days", dateStr);
            // Generate posting time using date as seed for stability
            const postingTime = randomTimeInWindow5Min(dateStr, dateStr);
            await setDoc(docRef, {
                date: dateStr,
                starterText: "",
                postingTime,
                postingTimeSource: "auto",
                status: "input",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error adding row:", error);
            showToast('error', "Failed to add row. This date might already be taken.");
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

            for (const dateId of selectedIds) {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", dateId);
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
                title="Content Input"
                subtitle="Plan your social media schedule here."
                actions={
                    <>
                        {selectedIds.size > 0 && (
                            <button
                                onClick={handleDeleteClick}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <Trash2 size={16} />
                                Delete ({selectedIds.size})
                            </button>
                        )}
                        <CSVImport />
                        <button
                            onClick={addRow}
                            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-3 py-2 rounded-lg text-sm font-medium transition-colors"
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
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-500 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-500">Loading your schedule...</p>
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
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                        {/* Header */}
                        <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">Delete posts?</h3>
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="px-5 py-5">
                            <p className="text-gray-600">
                                This will permanently delete <span className="font-semibold text-gray-900">{selectedIds.size}</span> scheduled post{selectedIds.size !== 1 ? 's' : ''}.
                            </p>
                            <p className="text-sm text-gray-500 mt-2">
                                This action cannot be undone. Associated images will not be deleted.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
