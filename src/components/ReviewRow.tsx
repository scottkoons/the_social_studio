"use client";

import { useState, useEffect, useRef } from "react";
import { PostDay, PostDayAI } from "@/lib/types";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import ImageUpload from "./ImageUpload";
import StatusPill from "./ui/StatusPill";
import { Loader2, Pencil, RefreshCw } from "lucide-react";
import Link from "next/link";
import { isPastOrTodayInDenver, normalizeHashtagsArray, appendGlobalHashtags } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface ReviewRowProps {
    post: PostDay;
    isSelected: boolean;
    isGenerating?: boolean;
    onSelect: (id: string, selected: boolean) => void;
    onRegenerate?: (dateId: string, previousOutputs?: {
        igCaption?: string;
        igHashtags?: string[];
        fbCaption?: string;
        fbHashtags?: string[];
    }) => void;
}

const DEFAULT_AI: Omit<PostDayAI, 'meta'> & { meta?: PostDayAI['meta'] } = {
    ig: { caption: "", hashtags: [] },
    fb: { caption: "", hashtags: [] },
};

export default function ReviewRow({ post, isSelected, isGenerating, onSelect, onRegenerate }: ReviewRowProps) {
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

    // Live check if date is in the past
    const isPast = isPastOrTodayInDenver(post.date);

    // Re-sync local state if post updates (e.g. from batch generation)
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

    const handleHashtagChange = (platform: 'ig' | 'fb', value: string) => {
        // Split, normalize (add # if missing), filter empty, then append global hashtags
        const rawTags = value.split(',');
        const normalizedTags = normalizeHashtagsArray(rawTags);
        const withGlobals = appendGlobalHashtags(normalizedTags);
        updatePlatformField(platform, 'hashtags', withGlobals);
    };

    const countWords = (text: string): number => {
        return text.split(/\s+/).filter(word => word !== "").length;
    };

    return (
        <tr className={`transition-colors ${isSelected ? 'bg-teal-50/50' : 'hover:bg-gray-50/50'}`}>
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
                    <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-gray-900">{post.date}</span>
                        <Link
                            href={`/input?date=${post.date}`}
                            className="text-gray-400 hover:text-teal-600 transition-colors"
                            title="Edit in Input"
                        >
                            <Pencil size={12} />
                        </Link>
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {isPast && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-red-100 text-red-700">
                                Past date
                            </span>
                        )}
                        {!post.imageAssetId && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-orange-100 text-orange-700">
                                Missing image
                            </span>
                        )}
                        {localAi.meta?.needsInfo && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700">
                                Needs info
                            </span>
                        )}
                    </div>
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

            {/* Instagram Content */}
            <td className="px-4 py-4 align-top min-w-[280px]">
                {isGenerating ? (
                    <div className="flex items-center justify-center h-[140px] text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="animate-spin text-teal-500" size={24} />
                            <span className="text-xs">Generating...</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Caption</label>
                            <textarea
                                value={localAi.ig.caption}
                                onChange={(e) => updatePlatformField('ig', 'caption', e.target.value)}
                                className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 min-h-[72px] resize-none leading-relaxed"
                                placeholder="AI will generate caption..."
                            />
                            <div className="text-right mt-1">
                                <span className="text-xs text-gray-400">{countWords(localAi.ig.caption)} words</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Hashtags</label>
                            <input
                                type="text"
                                value={localAi.ig.hashtags.join(', ')}
                                onChange={(e) => handleHashtagChange('ig', e.target.value)}
                                className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                                placeholder="#example, #tags"
                            />
                        </div>
                    </div>
                )}
            </td>

            {/* Facebook Content */}
            <td className="px-4 py-4 align-top min-w-[280px]">
                {isGenerating ? (
                    <div className="flex items-center justify-center h-[140px] text-gray-400">
                        <div className="flex flex-col items-center gap-2">
                            <Loader2 className="animate-spin text-teal-500" size={24} />
                            <span className="text-xs">Generating...</span>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Caption</label>
                            <textarea
                                value={localAi.fb.caption}
                                onChange={(e) => updatePlatformField('fb', 'caption', e.target.value)}
                                className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 min-h-[72px] resize-none leading-relaxed"
                                placeholder="AI will generate caption..."
                            />
                            <div className="text-right mt-1">
                                <span className="text-xs text-gray-400">{countWords(localAi.fb.caption)} words</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Hashtags</label>
                            <input
                                type="text"
                                value={localAi.fb.hashtags.join(', ')}
                                onChange={(e) => handleHashtagChange('fb', e.target.value)}
                                className="w-full text-sm text-gray-900 placeholder:text-gray-400 border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                                placeholder="#example, #tags"
                            />
                        </div>
                    </div>
                )}
            </td>

            {/* Status */}
            <td className="px-4 py-4 align-top text-right">
                <div className="flex flex-col items-end gap-2">
                    {isSaving ? (
                        <Loader2 className="animate-spin text-teal-500" size={16} />
                    ) : (
                        <StatusPill status={post.status} wouldBeSkipped={isPast || !post.imageAssetId} />
                    )}
                    {localAi.meta?.confidence != null && localAi.meta.confidence > 0 && (
                        <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                                localAi.meta.confidence >= 0.7
                                    ? "bg-gray-50 text-gray-500"
                                    : "bg-amber-50 text-amber-600"
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
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-gray-500 hover:text-teal-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                </div>
            </td>
        </tr>
    );
}
