"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { isPastOrTodayInDenver, formatDisplayDate } from "@/lib/utils";
import { movePostDay } from "@/lib/postDayMove";
import { PostDay, getPostDocId } from "@/lib/types";
import ImageUpload from "./ImageUpload";
import StatusPill from "./ui/StatusPill";
import ConfirmModal from "./ui/ConfirmModal";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface TableRowProps {
    post: PostDay;
    allPostDates: string[];
    isSelected: boolean;
    onSelect: (id: string, selected: boolean) => void;
    isHighlighted: boolean;
    onHighlightClear: () => void;
}

// Platform badge component
function PlatformBadge({ platform }: { platform?: string }) {
    const platformName = platform || "facebook";
    const isFacebook = platformName === "facebook";

    return (
        <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                isFacebook
                    ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                    : "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400"
            }`}
        >
            {isFacebook ? "FB" : "IG"}
        </span>
    );
}

export default function TableRow({ post, allPostDates, isSelected, onSelect, isHighlighted, onHighlightClear }: TableRowProps) {
    const { user, workspaceId } = useAuth();
    const [starterText, setStarterText] = useState(post.starterText || "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const rowRef = useRef<HTMLTableRowElement>(null);

    // Get the document ID for this post
    const docId = getPostDocId(post);

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
                const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);
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
    }, [starterText, docId, post.starterText, user, workspaceId]);

    const handleDateChange = async (newDate: string) => {
        if (newDate === post.date || !user || !workspaceId) return;

        setIsSaving(true);
        setError(null);

        // For platform-aware posts, we need to update the movePostDay logic
        // For now, just update the date field in the existing document
        const result = await movePostDay(workspaceId, docId, newDate, { overwrite: false, platform: post.platform });

        if (result.needsConfirmOverwrite) {
            setPendingNewDate(newDate);
            setShowOverwriteModal(true);
            setIsSaving(false);
            return;
        }

        if (!result.ok) {
            setError(result.error || "Failed to change date.");
        }

        setIsSaving(false);
    };

    const handleOverwriteConfirm = async () => {
        if (!pendingNewDate || !workspaceId) return;

        setShowOverwriteModal(false);
        setIsSaving(true);
        setError(null);

        const result = await movePostDay(workspaceId, docId, pendingNewDate, { overwrite: true, platform: post.platform });

        if (!result.ok) {
            setError(result.error || "Failed to change date.");
        }

        setPendingNewDate(null);
        setIsSaving(false);
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
                ${isSelected ? 'bg-[var(--table-row-selected)]' : 'hover:bg-[var(--table-row-hover)]'}
                ${isHighlighted ? 'ring-2 ring-[var(--accent-primary)] ring-inset bg-[var(--accent-bg)]' : ''}
            `}
        >
            {/* Checkbox */}
            <td className="px-3 md:px-4 py-3 md:py-4 align-top">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(docId, e.target.checked)}
                    className="h-5 w-5 md:h-4 md:w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] focus:ring-offset-0 cursor-pointer bg-[var(--input-bg)]"
                />
            </td>

            {/* Platform */}
            <td className="px-2 md:px-4 py-3 md:py-4 align-top">
                <PlatformBadge platform={post.platform} />
            </td>

            {/* Date */}
            <td className="px-2 md:px-4 py-3 md:py-4 align-top">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-1 md:gap-2">
                        <span className="text-xs md:text-sm font-medium text-[var(--text-primary)] whitespace-nowrap">
                            {formatDisplayDate(post.date)}
                        </span>
                        <input
                            type="date"
                            value={post.date}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className="w-6 h-6 md:w-5 md:h-5 opacity-50 md:opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title="Change date"
                        />
                    </div>
                    {isPast && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-semibold bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 w-fit uppercase tracking-wide">
                            Past
                        </span>
                    )}
                    {error && (
                        <span className="text-[9px] md:text-[10px] text-[var(--status-error)] flex items-center gap-1">
                            <AlertCircle size={10} />
                            {error}
                        </span>
                    )}
                </div>
            </td>

            {/* Image */}
            <td className="px-2 md:px-4 py-3 md:py-4 align-top">
                <ImageUpload
                    post={post}
                    onUploadStart={() => setIsSaving(true)}
                    onUploadEnd={() => setIsSaving(false)}
                />
            </td>

            {/* Starter Text - hidden on mobile */}
            <td className="px-2 md:px-4 py-3 md:py-4 align-top hidden sm:table-cell">
                <textarea
                    value={starterText}
                    onChange={(e) => setStarterText(e.target.value)}
                    placeholder="What's the post about?"
                    className="w-full text-sm text-[var(--text-primary)] border-none bg-transparent focus:ring-0 resize-none min-h-[72px] p-0 placeholder:text-[var(--text-muted)] leading-relaxed"
                />
            </td>

            {/* Status */}
            <td className="px-2 md:px-4 py-3 md:py-4 align-top text-right">
                <div className="flex items-center justify-end">
                    {isSaving ? (
                        <Loader2 className="animate-spin text-[var(--accent-primary)]" size={16} />
                    ) : (
                        <StatusPill status={post.status} />
                    )}
                </div>
            </td>
        </tr>

        {/* Overwrite Confirmation Modal */}
        <ConfirmModal
            open={showOverwriteModal}
            title="Overwrite Existing Post?"
            description={`A post already exists for ${pendingNewDate ? formatDisplayDate(pendingNewDate) : ""}. Do you want to replace it with this one?`}
            confirmText="Overwrite"
            cancelText="Cancel"
            onConfirm={handleOverwriteConfirm}
            onCancel={handleOverwriteCancel}
        />
        </>
    );
}
