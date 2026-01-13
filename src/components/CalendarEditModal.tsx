"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Trash2, Copy, Upload, Loader2, Sparkles } from "lucide-react";
import Image from "next/image";
import { PostDay } from "@/lib/types";
import { db, storage, functions } from "@/lib/firebase";
import { doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useDropzone } from "react-dropzone";
import { normalizeHashtagsArray, appendGlobalHashtags, stripUndefined } from "@/lib/utils";

interface GeneratePostCopyResponse {
    success: boolean;
    status: "generated" | "already_generated" | "error";
    message?: string;
}

function countWords(text: string): number {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
}

interface CalendarEditModalProps {
    isOpen: boolean;
    post: PostDay;
    workspaceId: string;
    imageUrl: string | null;
    onClose: () => void;
    onDateConflict: (sourceDate: string, targetDate: string) => void;
}

export default function CalendarEditModal({
    isOpen,
    post,
    workspaceId,
    imageUrl,
    onClose,
    onDateConflict,
}: CalendarEditModalProps) {
    // Local state for editing
    const [date, setDate] = useState(post.date);
    const [igCaption, setIgCaption] = useState(post.ai?.ig?.caption || "");
    const [igHashtags, setIgHashtags] = useState(post.ai?.ig?.hashtags?.join(", ") || "");
    const [fbCaption, setFbCaption] = useState(post.ai?.fb?.caption || "");
    const [fbHashtags, setFbHashtags] = useState(post.ai?.fb?.hashtags?.join(", ") || "");

    const [localImageUrl, setLocalImageUrl] = useState(imageUrl);
    const [newImageFile, setNewImageFile] = useState<File | null>(null);
    const [removeImage, setRemoveImage] = useState(false);

    const [isSaving, setIsSaving] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isRegenerating, setIsRegenerating] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [showDuplicateModal, setShowDuplicateModal] = useState(false);
    const [duplicateDate, setDuplicateDate] = useState("");
    const [isDuplicating, setIsDuplicating] = useState(false);

    // Reset state when post changes
    useEffect(() => {
        setDate(post.date);
        setIgCaption(post.ai?.ig?.caption || "");
        setIgHashtags(post.ai?.ig?.hashtags?.join(", ") || "");
        setFbCaption(post.ai?.fb?.caption || "");
        setFbHashtags(post.ai?.fb?.hashtags?.join(", ") || "");
        setLocalImageUrl(imageUrl);
        setNewImageFile(null);
        setRemoveImage(false);
    }, [post, imageUrl]);

    // Handle ESC key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape" && !showDeleteConfirm && !showDuplicateModal) {
                onClose();
            }
        };

        if (isOpen) {
            document.body.style.overflow = "hidden";
            document.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            document.body.style.overflow = "";
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, onClose, showDeleteConfirm, showDuplicateModal]);

    // Image dropzone
    const onDrop = useCallback((acceptedFiles: File[]) => {
        if (acceptedFiles.length > 0) {
            const file = acceptedFiles[0];
            setNewImageFile(file);
            setLocalImageUrl(URL.createObjectURL(file));
            setRemoveImage(false);
        }
    }, []);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { "image/*": [] },
        multiple: false,
    });

    const handleRemoveImage = () => {
        setRemoveImage(true);
        setNewImageFile(null);
        setLocalImageUrl(null);
    };

    const handleSave = async () => {
        setIsSaving(true);

        try {
            const docRef = doc(db, "workspaces", workspaceId, "post_days", post.date);

            // Check if date changed and target exists
            if (date !== post.date) {
                const targetDocRef = doc(db, "workspaces", workspaceId, "post_days", date);
                const targetDoc = await getDoc(targetDocRef);

                if (targetDoc.exists()) {
                    // Show conflict modal via parent
                    setIsSaving(false);
                    onDateConflict(post.date, date);
                    return;
                }
            }

            // Handle image upload if new file
            let newAssetId: string | null = post.imageAssetId || null;
            if (newImageFile) {
                const storagePath = `assets/${workspaceId}/${date}/${newImageFile.name}`;
                const storageRef = ref(storage, storagePath);
                await uploadBytes(storageRef, newImageFile);

                const assetId = crypto.randomUUID();
                const assetData = {
                    id: assetId,
                    storagePath,
                    fileName: newImageFile.name,
                    contentType: newImageFile.type,
                    size: newImageFile.size,
                    createdAt: serverTimestamp(),
                    workspaceId,
                };

                await setDoc(doc(db, "workspaces", workspaceId, "assets", assetId), assetData);
                newAssetId = assetId;
            } else if (removeImage) {
                newAssetId = null;
            }

            // Parse and normalize hashtags
            const parsedIgHashtags = appendGlobalHashtags(
                normalizeHashtagsArray(igHashtags.split(","))
            );
            const parsedFbHashtags = appendGlobalHashtags(
                normalizeHashtagsArray(fbHashtags.split(","))
            );

            // Build update data - use deleteField() for removed image
            const updateData: Record<string, unknown> = {
                "ai.ig.caption": igCaption,
                "ai.ig.hashtags": parsedIgHashtags,
                "ai.fb.caption": fbCaption,
                "ai.fb.hashtags": parsedFbHashtags,
                imageAssetId: removeImage ? deleteField() : newAssetId,
                status: post.status === "sent" ? "sent" : "edited",
                updatedAt: serverTimestamp(),
            };

            // If date changed, move the post
            if (date !== post.date) {
                const targetDocRef = doc(db, "workspaces", workspaceId, "post_days", date);

                // Create new doc at target date - use stripUndefined to remove undefined values
                const newDocData = stripUndefined({
                    ...post,
                    date,
                    ai: {
                        ig: { caption: igCaption, hashtags: parsedIgHashtags },
                        fb: { caption: fbCaption, hashtags: parsedFbHashtags },
                        meta: post.ai?.meta,
                    },
                    imageAssetId: newAssetId,
                    status: post.status === "sent" ? "sent" : "edited",
                    updatedAt: serverTimestamp(),
                });
                await setDoc(targetDocRef, newDocData);

                // Delete old doc
                await deleteDoc(docRef);
            } else {
                // Update existing doc
                await updateDoc(docRef, updateData);
            }

            onClose();
        } catch (err) {
            console.error("Save error:", err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async () => {
        setIsDeleting(true);
        try {
            const docRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
            await deleteDoc(docRef);
            onClose();
        } catch (err) {
            console.error("Delete error:", err);
        } finally {
            setIsDeleting(false);
            setShowDeleteConfirm(false);
        }
    };

    const handleDuplicate = async () => {
        if (!duplicateDate) return;

        setIsDuplicating(true);
        try {
            // Check if target date exists
            const targetDocRef = doc(db, "workspaces", workspaceId, "post_days", duplicateDate);
            const targetDoc = await getDoc(targetDocRef);

            if (targetDoc.exists()) {
                alert(`A post already exists on ${duplicateDate}. Choose a different date.`);
                setIsDuplicating(false);
                return;
            }

            // Parse and normalize hashtags
            const parsedIgHashtags = appendGlobalHashtags(
                normalizeHashtagsArray(igHashtags.split(","))
            );
            const parsedFbHashtags = appendGlobalHashtags(
                normalizeHashtagsArray(fbHashtags.split(","))
            );

            // Create duplicate post - use stripUndefined to remove undefined values
            const duplicateData = stripUndefined({
                date: duplicateDate,
                starterText: post.starterText,
                imageAssetId: post.imageAssetId,
                ai: {
                    ig: { caption: igCaption, hashtags: parsedIgHashtags },
                    fb: { caption: fbCaption, hashtags: parsedFbHashtags },
                    meta: post.ai?.meta,
                },
                status: "edited",
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
            await setDoc(targetDocRef, duplicateData);

            setShowDuplicateModal(false);
            setDuplicateDate("");
            onClose();
        } catch (err) {
            console.error("Duplicate error:", err);
        } finally {
            setIsDuplicating(false);
        }
    };

    const handleRegenerate = async () => {
        if (!workspaceId) return;

        setIsRegenerating(true);

        const generatePostCopy = httpsCallable<
            {
                workspaceId: string;
                dateId: string;
                regenerate: boolean;
                previousOutputs?: {
                    igCaption?: string;
                    igHashtags?: string[];
                    fbCaption?: string;
                    fbHashtags?: string[];
                };
                requestId?: string;
            },
            GeneratePostCopyResponse
        >(functions, "generatePostCopy");

        try {
            // Pass current values as previous outputs so AI knows what to avoid repeating
            const result = await generatePostCopy({
                workspaceId,
                dateId: post.date,
                regenerate: true,
                previousOutputs: {
                    igCaption: igCaption || undefined,
                    igHashtags: igHashtags ? normalizeHashtagsArray(igHashtags.split(",")) : undefined,
                    fbCaption: fbCaption || undefined,
                    fbHashtags: fbHashtags ? normalizeHashtagsArray(fbHashtags.split(",")) : undefined,
                },
                requestId: crypto.randomUUID(),
            });

            if (result.data.status === "generated") {
                // Re-fetch the post to get the new AI content
                const postRef = doc(db, "workspaces", workspaceId, "post_days", post.date);
                const updatedPost = await getDoc(postRef);

                if (updatedPost.exists()) {
                    const data = updatedPost.data();
                    // Update local state with newly generated content
                    setIgCaption(data.ai?.ig?.caption || "");
                    setIgHashtags(data.ai?.ig?.hashtags?.join(", ") || "");
                    setFbCaption(data.ai?.fb?.caption || "");
                    setFbHashtags(data.ai?.fb?.hashtags?.join(", ") || "");
                }
            } else if (result.data.status === "error") {
                console.error("Regenerate error:", result.data.message);
                alert(result.data.message || "Failed to regenerate content");
            }
        } catch (err) {
            console.error("Regenerate error:", err);
            alert("Failed to regenerate content. Please try again.");
        } finally {
            setIsRegenerating(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={(e) => {
                if (e.target === e.currentTarget && !showDeleteConfirm && !showDuplicateModal) {
                    onClose();
                }
            }}
        >
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 bg-gray-50">
                    <h2 className="font-semibold text-gray-900">Edit Post - {post.date}</h2>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Image section */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Image
                        </label>
                        {localImageUrl ? (
                            <div className="relative">
                                <div className="relative h-48 bg-gray-100 rounded-lg overflow-hidden">
                                    <Image
                                        src={localImageUrl}
                                        alt="Post image"
                                        fill
                                        className="object-contain"
                                        sizes="(max-width: 768px) 100vw, 400px"
                                    />
                                </div>
                                <div className="flex gap-2 mt-2">
                                    <div {...getRootProps()} className="flex-1">
                                        <input {...getInputProps()} />
                                        <button
                                            type="button"
                                            className="w-full px-3 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Upload size={14} />
                                            Replace Image
                                        </button>
                                    </div>
                                    <button
                                        onClick={handleRemoveImage}
                                        className="px-3 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                                    >
                                        Remove
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div
                                {...getRootProps()}
                                className={`
                                    h-32 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors
                                    ${isDragActive ? "border-teal-500 bg-teal-50" : "border-gray-200 hover:border-teal-400 hover:bg-gray-50"}
                                `}
                            >
                                <input {...getInputProps()} />
                                <div className="text-center">
                                    <Upload className="mx-auto mb-2 text-gray-400" size={24} />
                                    <p className="text-sm text-gray-500">Drop an image or click to upload</p>
                                </div>
                            </div>
                        )}
                        {removeImage && (
                            <p className="text-xs text-amber-600 mt-1">
                                Image will be removed. Post will not be sendable without an image.
                            </p>
                        )}
                    </div>

                    {/* Date */}
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                            Date
                        </label>
                        <input
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                        />
                    </div>

                    {/* Regenerate AI button */}
                    <div className="flex items-center justify-between py-3 px-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-100">
                        <div>
                            <h3 className="text-sm font-medium text-purple-900">AI Content</h3>
                            <p className="text-xs text-purple-600">Generate fresh captions and hashtags</p>
                        </div>
                        <button
                            onClick={handleRegenerate}
                            disabled={isRegenerating}
                            className="px-3 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {isRegenerating ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <Sparkles size={14} />
                            )}
                            {isRegenerating ? "Regenerating..." : "Regenerate AI"}
                        </button>
                    </div>

                    {/* Instagram */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Instagram</h3>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500">Caption</label>
                                <span className="text-xs text-gray-400">{countWords(igCaption)} words</span>
                            </div>
                            <textarea
                                value={igCaption}
                                onChange={(e) => setIgCaption(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 resize-none"
                                placeholder="Instagram caption..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Hashtags</label>
                            <input
                                type="text"
                                value={igHashtags}
                                onChange={(e) => setIgHashtags(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                                placeholder="#tag1, #tag2, #tag3"
                            />
                        </div>
                    </div>

                    {/* Facebook */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Facebook</h3>
                        <div>
                            <div className="flex items-center justify-between mb-1">
                                <label className="text-xs text-gray-500">Caption</label>
                                <span className="text-xs text-gray-400">{countWords(fbCaption)} words</span>
                            </div>
                            <textarea
                                value={fbCaption}
                                onChange={(e) => setFbCaption(e.target.value)}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500 resize-none"
                                placeholder="Facebook caption..."
                            />
                        </div>
                        <div>
                            <label className="block text-xs text-gray-500 mb-1">Hashtags</label>
                            <input
                                type="text"
                                value={fbHashtags}
                                onChange={(e) => setFbHashtags(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                                placeholder="#tag1, #tag2, #tag3"
                            />
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-5 py-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex gap-2">
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <Trash2 size={14} />
                            Delete
                        </button>
                        <button
                            onClick={() => setShowDuplicateModal(true)}
                            className="px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors flex items-center gap-1.5"
                        >
                            <Copy size={14} />
                            Duplicate
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                        >
                            {isSaving && <Loader2 size={14} className="animate-spin" />}
                            Save
                        </button>
                    </div>
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">Delete Post?</h3>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-sm text-gray-600">
                                Are you sure you want to delete the post for {post.date}? This cannot be undone.
                            </p>
                        </div>
                        <div className="px-5 py-4 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={isDeleting}
                                className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDeleting && <Loader2 size={14} className="animate-spin" />}
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Duplicate Modal */}
            {showDuplicateModal && (
                <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full mx-4 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-200">
                            <h3 className="font-semibold text-gray-900">Duplicate Post</h3>
                        </div>
                        <div className="px-5 py-4">
                            <p className="text-sm text-gray-600 mb-3">
                                Select a date for the duplicate post:
                            </p>
                            <input
                                type="date"
                                value={duplicateDate}
                                onChange={(e) => setDuplicateDate(e.target.value)}
                                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
                            />
                        </div>
                        <div className="px-5 py-4 bg-gray-50 flex justify-end gap-2">
                            <button
                                onClick={() => {
                                    setShowDuplicateModal(false);
                                    setDuplicateDate("");
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDuplicate}
                                disabled={!duplicateDate || isDuplicating}
                                className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg disabled:opacity-50 flex items-center gap-2"
                            >
                                {isDuplicating && <Loader2 size={14} className="animate-spin" />}
                                Duplicate
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
