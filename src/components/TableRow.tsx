"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { isPastOrTodayInDenver, stripUndefined } from "@/lib/utils";
import { PostDay } from "@/lib/types";
import ImageUpload from "./ImageUpload";
import StatusPill from "./ui/StatusPill";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface TableRowProps {
    post: PostDay;
    allPostDates: string[];
    isSelected: boolean;
    onSelect: (id: string, selected: boolean) => void;
    isHighlighted: boolean;
    onHighlightClear: () => void;
}

export default function TableRow({ post, allPostDates, isSelected, onSelect, isHighlighted, onHighlightClear }: TableRowProps) {
    const { user, workspaceId } = useAuth();
    const [starterText, setStarterText] = useState(post.starterText || "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const rowRef = useRef<HTMLTableRowElement>(null);

    // Overwrite confirmation modal state
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [pendingNewDate, setPendingNewDate] = useState<string | null>(null);

    const isPast = isPastOrTodayInDenver(post.date);

    // Scroll to row when highlighted
    useEffect(() => {
        if (isHighlighted && rowRef.current) {
            rowRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
            // Clear highlight after a delay
            const timer = setTimeout(() => {
                onHighlightClear();
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [isHighlighted, onHighlightClear]);

    // Autosave starterText
    useEffect(() => {
        if (starterText === post.starterText) return;

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(async () => {
            if (!user || !workspaceId) return;
            setIsSaving(true);
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
                await updateDoc(docRef, {
                    starterText,
                    updatedAt: serverTimestamp(),
                });
            } catch (err) {
                console.error("Autosave error:", err);
            } finally {
                setIsSaving(false);
            }
        }, 1000);

        return () => {
            if (debounceTimer.current) clearTimeout(debounceTimer.current);
        };
    }, [starterText, post.date, post.starterText, user, workspaceId]);

    const handleDateChange = async (newDate: string) => {
        if (newDate === post.date || !user || !workspaceId) return;

        // Check if target date already exists
        if (allPostDates.includes(newDate)) {
            // Show overwrite confirmation modal
            setPendingNewDate(newDate);
            setShowOverwriteModal(true);
            return;
        }

        await performDateChange(newDate, false);
    };

    const performDateChange = async (newDate: string, overwrite: boolean) => {
        if (!user || !workspaceId) return;

        setIsSaving(true);
        try {
            const oldDocRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
            const newDocRef = doc(db, "workspaces", workspaceId, "post_days", newDate);

            // If not overwriting, check if destination exists
            if (!overwrite) {
                const newDocSnap = await getDoc(newDocRef);
                if (newDocSnap.exists()) {
                    setPendingNewDate(newDate);
                    setShowOverwriteModal(true);
                    setIsSaving(false);
                    return;
                }
            }

            // Copy data to new doc (preserving imageAssetId) - stripUndefined to avoid Firestore errors
            await setDoc(newDocRef, stripUndefined({
                ...post,
                date: newDate,
                updatedAt: serverTimestamp(),
            }));

            // Delete old doc
            await deleteDoc(oldDocRef);

        } catch (err) {
            console.error("Date change error:", err);
            setError("Failed to change date.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleOverwriteConfirm = async () => {
        if (!pendingNewDate) return;
        setShowOverwriteModal(false);
        await performDateChange(pendingNewDate, true);
        setPendingNewDate(null);
    };

    const handleOverwriteCancel = () => {
        setShowOverwriteModal(false);
        setPendingNewDate(null);
    };

    return (
        <>
        <tr
            ref={rowRef}
            className={`
                transition-colors
                ${isSelected ? 'bg-teal-50/50' : 'hover:bg-gray-50/50'}
                ${isHighlighted ? 'ring-2 ring-teal-500 ring-inset bg-teal-50' : ''}
            `}
        >
            {/* Checkbox */}
            <td className="px-4 py-4 align-top">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(post.date, e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500 focus:ring-offset-0 cursor-pointer"
                />
            </td>

            {/* Date */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col gap-1.5">
                    <input
                        type="date"
                        value={post.date}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className="font-mono text-sm font-medium text-gray-900 border-none bg-transparent focus:ring-0 p-0 cursor-pointer w-32"
                    />
                    {isPast && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 w-fit uppercase tracking-wide">
                            Past date
                        </span>
                    )}
                    {error && (
                        <span className="text-[10px] text-red-600 flex items-center gap-1">
                            <AlertCircle size={10} />
                            {error}
                        </span>
                    )}
                </div>
            </td>

            {/* Image */}
            <td className="px-4 py-4 align-top">
                <ImageUpload
                    post={post}
                    onUploadStart={() => setIsSaving(true)}
                    onUploadEnd={() => setIsSaving(false)}
                />
            </td>

            {/* Starter Text */}
            <td className="px-4 py-4 align-top">
                <textarea
                    value={starterText}
                    onChange={(e) => setStarterText(e.target.value)}
                    placeholder="What's the post about?"
                    className="w-full text-sm text-gray-700 border-none bg-transparent focus:ring-0 resize-none min-h-[72px] p-0 placeholder:text-gray-400 leading-relaxed"
                />
            </td>

            {/* Status */}
            <td className="px-4 py-4 align-top text-right">
                <div className="flex items-center justify-end">
                    {isSaving ? (
                        <Loader2 className="animate-spin text-teal-500" size={16} />
                    ) : (
                        <StatusPill status={post.status} />
                    )}
                </div>
            </td>
        </tr>

        {/* Overwrite Confirmation Modal */}
        {showOverwriteModal && pendingNewDate && (
            <tr>
                <td colSpan={5} className="p-0">
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden">
                            {/* Header */}
                            <div className="bg-gray-50 px-5 py-4 border-b border-gray-200 flex items-center justify-between">
                                <h3 className="font-semibold text-gray-900">Date already exists</h3>
                                <button
                                    onClick={handleOverwriteCancel}
                                    className="text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="px-5 py-5">
                                <p className="text-gray-600">
                                    A post already exists for <span className="font-semibold text-gray-900 font-mono">{pendingNewDate}</span>.
                                </p>
                                <p className="text-sm text-gray-500 mt-2">
                                    Do you want to overwrite it? This will replace the existing post with this one.
                                </p>
                            </div>

                            {/* Actions */}
                            <div className="px-5 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
                                <button
                                    onClick={handleOverwriteCancel}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleOverwriteConfirm}
                                    className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                                >
                                    Overwrite
                                </button>
                            </div>
                        </div>
                    </div>
                </td>
            </tr>
        )}
        </>
    );
}
