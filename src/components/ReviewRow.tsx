"use client";

import { useState, useEffect, useRef } from "react";
import { PostDay } from "@/lib/types";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import ImageUpload from "./ImageUpload";
import StatusPill from "./ui/StatusPill";
import { Loader2, Pencil } from "lucide-react";
import Link from "next/link";
import { computeFlags, isPastOrTodayInDenver } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface ReviewRowProps {
    post: PostDay;
    isSelected: boolean;
    onSelect: (id: string, selected: boolean) => void;
}

export default function ReviewRow({ post, isSelected, onSelect }: ReviewRowProps) {
    const { user, workspaceId } = useAuth();
    const [localAi, setLocalAi] = useState(post.ai || {
        igCaption: "",
        fbCaption: "",
        igHashtags: [],
        fbHashtags: [],
        flags: [],
        confidence: 0
    });
    const [isSaving, setIsSaving] = useState(false);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Live check if date is in the past
    const isPast = isPastOrTodayInDenver(post.date);

    // Re-sync local state if post updates (e.g. from batch generation)
    useEffect(() => {
        if (post.ai) {
            setLocalAi(post.ai);
        }
    }, [post.ai]);

    const updateField = (field: string, value: any) => {
        const newAi = { ...localAi, [field]: value };
        setLocalAi(newAi);

        if (debounceTimer.current) clearTimeout(debounceTimer.current);

        debounceTimer.current = setTimeout(async () => {
            if (!user || !workspaceId) return;
            setIsSaving(true);
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
                const flags = computeFlags({
                    date: post.date,
                    starterText: post.starterText,
                    imageAssetId: post.imageAssetId
                });

                await updateDoc(docRef, {
                    ai: { ...newAi, flags },
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

    const handleHashtagChange = (field: 'igHashtags' | 'fbHashtags', value: string) => {
        const tags = value.split(',').map(t => t.trim()).filter(t => t !== "");
        updateField(field, tags);
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
                        {localAi.flags.filter(flag => flag !== "Past date").map(flag => (
                            <span key={flag} className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
                                flag === "Missing image" ? "bg-orange-100 text-orange-700" :
                                    "bg-blue-100 text-blue-700"
                                }`}>
                                {flag}
                            </span>
                        ))}
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
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Caption</label>
                        <textarea
                            value={localAi.igCaption}
                            onChange={(e) => updateField('igCaption', e.target.value)}
                            className="w-full text-sm border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 min-h-[72px] resize-none leading-relaxed"
                            placeholder="AI generating..."
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Hashtags</label>
                        <input
                            type="text"
                            value={localAi.igHashtags.join(', ')}
                            onChange={(e) => handleHashtagChange('igHashtags', e.target.value)}
                            className="w-full text-sm border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="#example, #tags"
                        />
                    </div>
                </div>
            </td>

            {/* Facebook Content */}
            <td className="px-4 py-4 align-top min-w-[280px]">
                <div className="space-y-3">
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Caption</label>
                        <textarea
                            value={localAi.fbCaption}
                            onChange={(e) => updateField('fbCaption', e.target.value)}
                            className="w-full text-sm border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 min-h-[72px] resize-none leading-relaxed"
                            placeholder="AI generating..."
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Hashtags</label>
                        <input
                            type="text"
                            value={localAi.fbHashtags.join(', ')}
                            onChange={(e) => handleHashtagChange('fbHashtags', e.target.value)}
                            className="w-full text-sm border border-gray-200 bg-white rounded-lg p-2.5 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                            placeholder="#example, #tags"
                        />
                    </div>
                </div>
            </td>

            {/* Status */}
            <td className="px-4 py-4 align-top text-right">
                <div className="flex flex-col items-end gap-2">
                    {isSaving ? (
                        <Loader2 className="animate-spin text-teal-500" size={16} />
                    ) : (
                        <StatusPill status={post.status} isPastDue={isPast && post.status !== 'sent'} />
                    )}
                    {localAi.confidence > 0 && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                            localAi.confidence >= 0.7
                                ? "bg-green-50 text-green-600"
                                : "bg-amber-50 text-amber-600"
                            }`}>
                            {Math.round(localAi.confidence * 100)}%
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
}
