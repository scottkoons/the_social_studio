"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, setDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import InputTable from "@/components/InputTable";
import CSVImport from "@/components/CSVImport";
import { Plus, Trash2, X, CheckCircle2 } from "lucide-react";
import { format, addDays } from "date-fns";
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";

export default function InputPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Delete modal state
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    // Toast state
    const [toast, setToast] = useState<string | null>(null);

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
            setSelectedIds(new Set(posts.map(p => p.date)));
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
            await setDoc(docRef, {
                date: dateStr,
                starterText: "",
                status: "input",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        } catch (error) {
            console.error("Error adding row:", error);
            alert("Failed to add row. This date might already be taken.");
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
            showToast(`Deleted ${deletedCount} post${deletedCount !== 1 ? 's' : ''}.`);
        } catch (error) {
            console.error("Error deleting posts:", error);
            alert("Failed to delete posts. Please try again.");
        } finally {
            setIsDeleting(false);
        }
    };

    const showToast = (message: string) => {
        setToast(message);
        setTimeout(() => setToast(null), 4000);
    };

    // Show loading while workspace is being resolved
    if (workspaceLoading || !workspaceId) {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mx-auto mb-4"></div>
                        <p className="text-gray-500">Setting up your workspace...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Content Input</h1>
                    <p className="text-sm text-gray-500">Plan your social media schedule here.</p>
                </div>

                <div className="flex items-center gap-3">
                    {selectedIds.size > 0 && (
                        <button
                            onClick={handleDeleteClick}
                            disabled={isDeleting}
                            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Trash2 size={18} />
                            Delete ({selectedIds.size})
                        </button>
                    )}
                    <CSVImport />
                    <button
                        onClick={addRow}
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Plus size={18} />
                        Add Row
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading your schedule...</p>
                    </div>
                ) : (
                    <InputTable
                        posts={posts}
                        selectedIds={selectedIds}
                        onSelectRow={onSelectRow}
                        onSelectAll={onSelectAll}
                    />
                )}
            </div>

            {/* Toast */}
            {toast && (
                <div className="fixed bottom-8 right-8 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl bg-white border border-green-100 text-green-700">
                    <CheckCircle2 className="text-green-500" size={20} />
                    <p className="font-semibold text-sm">{toast}</p>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
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
                        <div className="px-6 py-6">
                            <p className="text-gray-600">
                                This will permanently delete <span className="font-bold text-gray-900">{selectedIds.size}</span> scheduled post{selectedIds.size !== 1 ? 's' : ''}.
                            </p>
                            <p className="text-sm text-gray-500 mt-2">
                                This action cannot be undone. Associated images will not be deleted.
                            </p>
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteConfirm}
                                disabled={isDeleting}
                                className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isDeleting ? (
                                    <>
                                        <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white" />
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
