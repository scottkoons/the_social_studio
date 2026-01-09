"use client";

import { useState, useEffect, useRef } from "react";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { isPastOrTodayInDenver } from "@/lib/utils";
import { PostDay } from "@/lib/types";
import ImageUpload from "./ImageUpload";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface TableRowProps {
    post: PostDay;
    allPostDates: string[];
}

export default function TableRow({ post, allPostDates }: TableRowProps) {
    const { user, workspaceId } = useAuth();
    const [starterText, setStarterText] = useState(post.starterText || "");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);

    const isPast = isPastOrTodayInDenver(post.date);

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

        if (allPostDates.includes(newDate)) {
            setError(`Date ${newDate} is already taken.`);
            setTimeout(() => setError(null), 3000);
            return;
        }

        setIsSaving(true);
        try {
            const oldDocRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
            const newDocRef = doc(db, "workspaces", workspaceId, "post_days", newDate);

            const newDocSnap = await getDoc(newDocRef);
            if (newDocSnap.exists()) {
                setError("Destination date already exists.");
                setIsSaving(false);
                return;
            }

            // Copy data to new doc (preserving imageAssetId)
            await setDoc(newDocRef, {
                ...post,
                date: newDate,
                updatedAt: serverTimestamp(),
            });

            // Delete old doc
            await deleteDoc(oldDocRef);

        } catch (err) {
            console.error("Date change error:", err);
            setError("Failed to change date.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <tr className="hover:bg-gray-50/50 transition-colors group">
            <td className="px-6 py-4 align-top">
                <div className="flex flex-col gap-1">
                    <input
                        type="date"
                        value={post.date}
                        onChange={(e) => handleDateChange(e.target.value)}
                        className="border-none bg-transparent focus:ring-0 text-gray-900 font-medium p-0 cursor-pointer"
                    />
                    {isPast && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 w-fit">
                            Past date
                        </span>
                    )}
                    {error && (
                        <span className="text-[10px] text-red-500 flex items-center gap-1 mt-1">
                            <AlertCircle size={10} />
                            {error}
                        </span>
                    )}
                </div>
            </td>

            <td className="px-6 py-4 align-top">
                <ImageUpload
                    post={post}
                    onUploadStart={() => setIsSaving(true)}
                    onUploadEnd={() => setIsSaving(false)}
                />
            </td>

            <td className="px-6 py-4 align-top">
                <textarea
                    value={starterText}
                    onChange={(e) => setStarterText(e.target.value)}
                    placeholder="What's the post about?"
                    className="w-full text-sm border-none bg-transparent focus:ring-0 resize-none min-h-[80px] p-0 text-gray-700 placeholder:text-gray-300"
                />
            </td>

            <td className="px-6 py-4 align-top text-right">
                <div className="flex items-center justify-end h-6">
                    {isSaving ? (
                        <Loader2 className="animate-spin text-teal-500" size={16} />
                    ) : (
                        <div className="flex items-center gap-1.5 text-xs font-medium capitalize h-full">
                            <span className={`w-2 h-2 rounded-full ${post.status === "sent" ? "bg-green-500" :
                                post.status === "error" ? "bg-red-500" :
                                    post.status === "input" ? "bg-gray-300" : "bg-teal-500"
                                }`} />
                            <span className="text-gray-500">{post.status}</span>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}
