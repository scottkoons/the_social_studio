"use client";

import { useState, useEffect, useRef } from "react";
import { PostDay } from "@/lib/types";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import ImageUpload from "./ImageUpload";
import { Loader2, AlertCircle, Info, CheckCircle2 } from "lucide-react";
import { computeFlags, computeConfidence } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface ReviewRowProps {
    post: PostDay;
    isSelected: boolean;
    onSelect: (id: string, selected: boolean) => void;
}

export default function ReviewRow({ post, isSelected, onSelect }: ReviewRowProps) {
    const { user } = useAuth();
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
            if (!user) return;
            setIsSaving(true);
            try {
                const docRef = doc(db, "users", user.uid, "post_days", post.date);
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
        <tr className={`hover:bg-gray-50/50 transition-colors ${isSelected ? 'bg-teal-50/30' : ''}`}>
            <td className="px-4 py-4 align-top w-10">
                <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={(e) => onSelect(post.date, e.target.checked)}
                    className="rounded border-gray-300 text-teal-600 focus:ring-teal-500 cursor-pointer"
                />
            </td>

            <td className="px-4 py-4 align-top w-32 shrink-0">
                <div className="flex flex-col gap-1">
                    <span className="font-bold text-gray-900 whitespace-nowrap">{post.date}</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                        {localAi.flags.map(flag => (
                            <span key={flag} className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${flag === "Past date" ? "bg-red-100 text-red-700" :
                                flag === "Missing image" ? "bg-orange-100 text-orange-700" :
                                    "bg-blue-100 text-blue-700"
                                }`}>
                                {flag}
                            </span>
                        ))}
                    </div>
                </div>
            </td>

            <td className="px-4 py-4 align-top w-48">
                <ImageUpload
                    post={post}
                    onUploadStart={() => setIsSaving(true)}
                    onUploadEnd={() => setIsSaving(false)}
                />
            </td>

            <td className="px-4 py-4 align-top space-y-4 min-w-[300px]">
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Instagram Caption</label>
                    <textarea
                        value={localAi.igCaption}
                        onChange={(e) => updateField('igCaption', e.target.value)}
                        className="w-full text-xs border border-gray-100 bg-white rounded-lg p-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 min-h-[80px]"
                        placeholder="AI generating..."
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">IG Hashtags (comma separated)</label>
                    <input
                        type="text"
                        value={localAi.igHashtags.join(', ')}
                        onChange={(e) => handleHashtagChange('igHashtags', e.target.value)}
                        className="w-full text-xs border border-gray-100 bg-white rounded-lg p-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="#example, #tags"
                    />
                </div>
            </td>

            <td className="px-4 py-4 align-top space-y-4 min-w-[300px]">
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">Facebook Caption</label>
                    <textarea
                        value={localAi.fbCaption}
                        onChange={(e) => updateField('fbCaption', e.target.value)}
                        className="w-full text-xs border border-gray-100 bg-white rounded-lg p-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 min-h-[80px]"
                        placeholder="AI generating..."
                    />
                </div>
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1 block">FB Hashtags (comma separated)</label>
                    <input
                        type="text"
                        value={localAi.fbHashtags.join(', ')}
                        onChange={(e) => handleHashtagChange('fbHashtags', e.target.value)}
                        className="w-full text-xs border border-gray-100 bg-white rounded-lg p-2 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        placeholder="#example, #tags"
                    />
                </div>
            </td>

            <td className="px-4 py-4 align-top text-right w-24 whitespace-nowrap">
                <div className="flex flex-col items-end gap-2">
                    <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider">
                        {isSaving ? (
                            <Loader2 className="animate-spin text-teal-500" size={14} />
                        ) : (
                            <>
                                <span className={`w-2 h-2 rounded-full ${post.status === "sent" ? "bg-green-500" :
                                    post.status === "error" ? "bg-red-500" :
                                        post.status === "input" ? "bg-gray-300" : "bg-teal-500"
                                    }`} />
                                <span className="text-gray-500">{post.status}</span>
                            </>
                        )}
                    </div>
                    {localAi.confidence > 0 && (
                        <div className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${localAi.confidence >= 0.7 ? "bg-green-50 text-green-600" : "bg-yellow-50 text-yellow-600"
                            }`}>
                            {Math.round(localAi.confidence * 100)}% Conf
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}
