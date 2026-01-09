"use client";

import { useEffect, useState, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy, doc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore";
import ReviewTable from "@/components/ReviewTable";
import { PostDay } from "@/lib/types";
import { Play, Send, CheckCircle2, AlertCircle } from "lucide-react";
import { generateAiStub } from "@/lib/ai-stubs";
import { sendToBufferStub } from "@/lib/buffer-stubs";

export default function ReviewPage() {
    const { user } = useAuth();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [toast, setToast] = useState<{ type: 'success' | 'warn', message: string } | null>(null);

    useEffect(() => {
        if (!user) return;

        const q = query(collection(db, "users", user.uid, "post_days"), orderBy("date", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsData = snapshot.docs.map((doc) => ({
                ...doc.data(),
            })) as PostDay[];
            setPosts(postsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const showToast = useCallback((type: 'success' | 'warn', message: string) => {
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
        if (selected) setSelectedIds(new Set(posts.map(p => p.date)));
        else setSelectedIds(new Set());
    };

    const handleGenerateBatch = async () => {
        if (!user) return;
        const targets = selectedIds.size > 0
            ? posts.filter(p => selectedIds.has(p.date))
            : posts;

        if (targets.length === 0) return;

        const batch = writeBatch(db);
        for (const post of targets) {
            const updatedData = await generateAiStub(post);
            const docRef = doc(db, "users", user.uid, "post_days", post.date);
            batch.update(docRef, {
                ...updatedData,
                updatedAt: serverTimestamp()
            });
        }

        try {
            await batch.commit();
            showToast('success', `Generated content for ${targets.length} posts.`);
        } catch (err) {
            console.error("Batch generate error:", err);
            showToast('warn', "Failed to generate some posts.");
        }
    };

    const handleSendToBuffer = async (onlySelected: boolean) => {
        if (!user) return;
        const targets = onlySelected
            ? posts.filter(p => selectedIds.has(p.date))
            : posts;

        if (targets.length === 0) return;

        let successCount = 0;
        let failCount = 0;

        for (const post of targets) {
            const result = await sendToBufferStub(post);
            if (result.success) {
                const docRef = doc(db, "users", user.uid, "post_days", post.date);
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

        if (failCount > 0) {
            showToast('warn', `Sent ${successCount} posts. ${failCount} skipped (past date).`);
        } else {
            showToast('success', `Successfully sent ${successCount} posts to Buffer.`);
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Review & AI Generation</h1>
                    <p className="text-sm text-gray-500">Fine-tune AI output and push to social channels.</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleGenerateBatch}
                        className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <Play size={16} className="text-teal-600 fill-teal-600" />
                        Generate {selectedIds.size > 0 ? "Selected" : "Batch"}
                    </button>

                    <button
                        onClick={() => handleSendToBuffer(true)}
                        disabled={selectedIds.size === 0}
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Send size={16} />
                        Send Selected
                    </button>

                    <button
                        onClick={() => handleSendToBuffer(false)}
                        className="flex items-center gap-2 bg-navy-900 hover:bg-navy-800 text-white px-4 py-2 rounded-lg font-medium transition-colors shadow-sm"
                    >
                        <CheckCircle2 size={16} />
                        Send All
                    </button>
                </div>
            </div>

            {toast && (
                <div className={`fixed bottom-8 right-8 z-50 flex items-center gap-3 px-6 py-4 rounded-xl shadow-2xl animate-in slide-in-from-bottom border ${toast.type === 'success' ? 'bg-white border-green-100 text-green-700' : 'bg-white border-red-100 text-red-700'
                    }`}>
                    {toast.type === 'success' ? <CheckCircle2 className="text-green-500" /> : <AlertCircle className="text-red-500" />}
                    <p className="font-semibold text-sm">{toast.message}</p>
                </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-teal-500 mx-auto mb-4"></div>
                        <p className="text-gray-500">Loading posts for review...</p>
                    </div>
                ) : (
                    <ReviewTable
                        posts={posts}
                        selectedIds={selectedIds}
                        onSelectRow={onSelectRow}
                        onSelectAll={onSelectAll}
                    />
                )}
            </div>
        </div>
    );
}
