"use client";

import { useState, useEffect, useRef } from "react";
import { PostDay, PostDayAI } from "@/lib/types";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import ImageUpload from "./ImageUpload";
import StatusPill from "./ui/StatusPill";
import ConfirmModal from "./ui/ConfirmModal";
import { Loader2, RefreshCw, Trash2, AlertCircle } from "lucide-react";
import { isPastOrTodayInDenver, formatDisplayDate } from "@/lib/utils";
import { movePostDay } from "@/lib/postDayMove";
import { useAuth } from "@/context/AuthContext";
import { formatTimeForDisplay, randomTimeInWindow5Min } from "@/lib/postingTime";
import type { PlatformFilterValue } from "./ReviewTable";

interface ReviewRowProps {
    post: PostDay;
    isSelected: boolean;
    isGenerating?: boolean;
    platformFilter?: PlatformFilterValue;
    onSelect: (id: string, selected: boolean) => void;
    onRegenerate?: (dateId: string, previousOutputs?: {
        igCaption?: string;
        igHashtags?: string[];
        fbCaption?: string;
        fbHashtags?: string[];
    }) => void;
    onDelete?: (dateId: string) => void;
}

const DEFAULT_AI: Omit<PostDayAI, 'meta'> & { meta?: PostDayAI['meta'] } = {
    ig: { caption: "", hashtags: [] },
    fb: { caption: "", hashtags: [] },
};

export default function ReviewRow({ post, isSelected, isGenerating, platformFilter = "all", onSelect, onRegenerate, onDelete }: ReviewRowProps) {
    const { user, workspaceId } = useAuth();
    const [localAi, setLocalAi] = useState<typeof DEFAULT_AI>(() => {
        if (post.ai) {
            return {
                ig: post.ai.ig || DEFAULT_AI.ig,
                fb: post.ai.fb || DEFAULT_AI.fb,
                meta: post.ai.meta,
            };
        }
        return DEFAULT_AI;
    });
    const [isSaving, setIsSaving] = useState(false);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Date change state
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [pendingNewDate, setPendingNewDate] = useState<string | null>(null);
    const [dateError, setDateError] = useState<string | null>(null);

    // Delete confirmation state
    const [showDeleteModal, setShowDeleteModal] = useState(false);

    // Live check if date is in the past
    const isPast = isPastOrTodayInDenver(post.date);

    const showInstagram = platformFilter === "all" || platformFilter === "instagram";
    const showFacebook = platformFilter === "all" || platformFilter === "facebook";

    // Re-sync local state if post updates
    useEffect(() => {
        if (post.ai) {
            setLocalAi({
                ig: post.ai.ig || DEFAULT_AI.ig,
                fb: post.ai.fb || DEFAULT_AI.fb,
                meta: post.ai.meta,
            });
        }
    }, [post.ai]);

    const updatePlatformField = (platform: 'ig' | 'fb', field: 'caption' | 'hashtags', value: string | string[]) => {
        const newAi = {
            ...localAi,
            [platform]: {
                ...localAi[platform],
                [field]: value,
            },
        };
        setLocalAi(newAi);

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(async () => {
            if (!user || !workspaceId) return;
            setIsSaving(true);
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", post.date);

                await updateDoc(docRef, {
                    [`ai.${platform}.${field}`]: value,
                    status: post.status === "sent" ? post.status : "edited",
                    updatedAt: serverTimestamp(),
                });
            } catch (err) {
                console.error("Autosave error:", err);
            } finally {
                setIsSaving(false);
            }
        }, 1000);
    };

    const countWords = (text: string): number => {
        return text.split(/\s+/).filter(word => word !== "").length;
    };

    // Convert hashtag array to comma-separated string for display
    const hashtagsToString = (hashtags: string[]): string => {
        return hashtags.join(", ");
    };

    // Convert comma-separated string to hashtag array for storage
    const stringToHashtags = (str: string): string[] => {
        return str.split(",").map(tag => tag.trim()).filter(tag => tag.length > 0);
    };

    // Date change handler
    const handleDateChange = async (newDate: string) => {
        if (newDate === post.date || !user || !workspaceId) return;

        setIsSaving(true);
        setDateError(null);

        const result = await movePostDay(workspaceId, post.date, newDate, { overwrite: false });

        if (result.needsConfirmOverwrite) {
            setPendingNewDate(newDate);
            setShowOverwriteModal(true);
            setIsSaving(false);
            return;
        }

        if (!result.ok) {
            setDateError(result.error || "Failed to change date.");
        }

        setIsSaving(false);
    };

    const handleOverwriteConfirm = async () => {
        if (!pendingNewDate || !workspaceId) return;

        setShowOverwriteModal(false);
        setIsSaving(true);
        setDateError(null);

        const result = await movePostDay(workspaceId, post.date, pendingNewDate, { overwrite: true });

        if (!result.ok) {
            setDateError(result.error || "Failed to change date.");
        }

        setPendingNewDate(null);
        setIsSaving(false);
    };

    const handleOverwriteCancel = () => {
        setShowOverwriteModal(false);
        setPendingNewDate(null);
    };

    return (
        <tr className={`transition-colors ${isSelected ? 'bg-[var(--table-row-selected)]' : 'hover:bg-[var(--table-row-hover)]'}`}>
            {/* Checkbox */}
            <td className="px-4 py-4 align-top">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(post.date, e.target.checked)}
                    className="h-4 w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] focus:ring-offset-0 cursor-pointer bg-[var(--input-bg)]"
                />
            </td>

            {/* Date */}
            <td className="px-4 py-4 align-top">
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--text-primary)]">
                            {formatDisplayDate(post.date)}
                        </span>
                        <input
                            type="date"
                            value={post.date}
                            onChange={(e) => handleDateChange(e.target.value)}
                            className="w-5 h-5 opacity-0 hover:opacity-100 focus:opacity-100 cursor-pointer"
                            title="Change date"
                        />
                    </div>
                    <span className="text-xs text-[var(--text-tertiary)]">
                        {formatTimeForDisplay(post.postingTime || randomTimeInWindow5Min(post.date, post.date))}
                    </span>
                    <div className="flex flex-wrap gap-1">
                        {isPast && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                                Past date
                            </span>
                        )}
                        {!post.imageAssetId && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400">
                                Missing image
                            </span>
                        )}
                        {localAi.meta?.needsInfo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                Needs info
                            </span>
                        )}
                    </div>
                    {dateError && (
                        <span className="text-[10px] text-[var(--status-error)] flex items-center gap-1">
                            <AlertCircle size={10} />
                            {dateError}
                        </span>
                    )}
                </div>

                {/* Overwrite confirmation modal */}
                <ConfirmModal
                    open={showOverwriteModal}
                    title="Overwrite Existing Post?"
                    description={`A post already exists for ${pendingNewDate ? formatDisplayDate(pendingNewDate) : ""}. Do you want to replace it with this one?`}
                    confirmText="Overwrite"
                    cancelText="Cancel"
                    onConfirm={handleOverwriteConfirm}
                    onCancel={handleOverwriteCancel}
                />
            </td>

            {/* Image */}
            <td className="px-4 py-4 align-top">
                <ImageUpload
                    post={post}
                    onUploadStart={() => setIsSaving(true)}
                    onUploadEnd={() => setIsSaving(false)}
                />
            </td>

            {/* Instagram Content */}
            {showInstagram && (
                <td className="px-4 py-4 align-top min-w-[280px]">
                    {isGenerating ? (
                        <div className="flex items-center justify-center h-[140px] text-[var(--text-tertiary)]">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="animate-spin text-[var(--accent-primary)]" size={24} />
                                <span className="text-xs">Generating...</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Caption</label>
                                <textarea
                                    value={localAi.ig.caption}
                                    onChange={(e) => updatePlatformField('ig', 'caption', e.target.value)}
                                    className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-2.5 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] min-h-[72px] resize-none leading-relaxed"
                                    placeholder="AI will generate caption..."
                                />
                                <div className="text-right mt-1">
                                    <span className="text-xs text-[var(--text-muted)]">{countWords(localAi.ig.caption)} words</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Hashtags</label>
                                <textarea
                                    value={hashtagsToString(localAi.ig.hashtags)}
                                    onChange={(e) => updatePlatformField('ig', 'hashtags', stringToHashtags(e.target.value))}
                                    className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-2.5 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] min-h-[48px] resize-none leading-relaxed"
                                    placeholder="#hashtag1, #hashtag2, #hashtag3"
                                />
                            </div>
                        </div>
                    )}
                </td>
            )}

            {/* Facebook Content */}
            {showFacebook && (
                <td className="px-4 py-4 align-top min-w-[280px]">
                    {isGenerating ? (
                        <div className="flex items-center justify-center h-[140px] text-[var(--text-tertiary)]">
                            <div className="flex flex-col items-center gap-2">
                                <Loader2 className="animate-spin text-[var(--accent-primary)]" size={24} />
                                <span className="text-xs">Generating...</span>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div>
                                <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Caption</label>
                                <textarea
                                    value={localAi.fb.caption}
                                    onChange={(e) => updatePlatformField('fb', 'caption', e.target.value)}
                                    className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-2.5 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] min-h-[72px] resize-none leading-relaxed"
                                    placeholder="AI will generate caption..."
                                />
                                <div className="text-right mt-1">
                                    <span className="text-xs text-[var(--text-muted)]">{countWords(localAi.fb.caption)} words</span>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">Hashtags</label>
                                <textarea
                                    value={hashtagsToString(localAi.fb.hashtags)}
                                    onChange={(e) => updatePlatformField('fb', 'hashtags', stringToHashtags(e.target.value))}
                                    className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-2.5 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] min-h-[48px] resize-none leading-relaxed"
                                    placeholder="#hashtag1, #hashtag2, #hashtag3"
                                />
                            </div>
                        </div>
                    )}
                </td>
            )}

            {/* Status */}
            <td className="px-4 py-4 align-top text-right">
                <div className="flex flex-col items-end gap-2">
                    {isSaving ? (
                        <Loader2 className="animate-spin text-[var(--accent-primary)]" size={16} />
                    ) : (
                        <StatusPill status={post.status} wouldBeSkipped={isPast || !post.imageAssetId} />
                    )}
                    {localAi.meta?.confidence != null && localAi.meta.confidence > 0 && (
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                                localAi.meta.confidence >= 0.7
                                    ? "bg-[var(--bg-tertiary)] text-[var(--text-secondary)]"
                                    : "bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
                            }`}
                            title="AI confidence score indicating content quality"
                        >
                            <span className="font-normal">AI</span>{" "}
                            <span className="font-semibold">{Math.round(localAi.meta.confidence * 100)}%</span>
                        </span>
                    )}
                    {onRegenerate && (
                        <button
                            onClick={() => onRegenerate(post.date, {
                                igCaption: localAi.ig.caption,
                                igHashtags: localAi.ig.hashtags,
                                fbCaption: localAi.fb.caption,
                                fbHashtags: localAi.fb.hashtags,
                            })}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--accent-primary)] hover:text-[var(--accent-primary-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Regenerate AI content for this post"
                        >
                            {isGenerating ? (
                                <Loader2 className="animate-spin" size={12} />
                            ) : (
                                <RefreshCw size={12} />
                            )}
                            Regenerate
                        </button>
                    )}
                    {onDelete && (
                        <button
                            onClick={() => setShowDeleteModal(true)}
                            disabled={isSaving || isGenerating}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title="Delete this post"
                        >
                            <Trash2 size={12} />
                            Delete
                        </button>
                    )}
                </div>

                {/* Delete confirmation modal */}
                <ConfirmModal
                    open={showDeleteModal}
                    title="Delete this post?"
                    description={`This will remove the post for ${formatDisplayDate(post.date)} from the schedule. This cannot be undone.`}
                    confirmText="Delete"
                    cancelText="Cancel"
                    confirmVariant="danger"
                    onConfirm={() => {
                        setShowDeleteModal(false);
                        onDelete?.(post.date);
                    }}
                    onCancel={() => setShowDeleteModal(false)}
                />
            </td>
        </tr>
    );
}
