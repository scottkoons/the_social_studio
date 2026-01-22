"use client";

import { useState } from "react";
import { PostDay, PostDayAI } from "@/lib/types";
import { formatDisplayDate } from "@/lib/utils";
import { formatTimeForDisplay } from "@/lib/postingTime";
import { X, Maximize2 } from "lucide-react";
import Image from "next/image";
import ImagePreviewModal from "./ui/ImagePreviewModal";

interface PostDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    post: PostDay;
    imageUrl: string | null;
    ai: {
        ig: { caption: string; hashtags: string[] };
        fb: { caption: string; hashtags: string[] };
    };
}

export default function PostDetailModal({ isOpen, onClose, post, imageUrl, ai }: PostDetailModalProps) {
    const [showImagePreview, setShowImagePreview] = useState(false);

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                    className="absolute inset-0 bg-black/50"
                    onClick={onClose}
                />

                {/* Modal */}
                <div className="relative bg-[var(--bg-card)] rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                                {formatDisplayDate(post.date)}
                            </h2>
                            <div className="flex items-center gap-3 mt-1 text-sm text-[var(--text-secondary)]">
                                {post.postingTimeIg && (
                                    <span className="text-pink-600 dark:text-pink-400">
                                        IG {formatTimeForDisplay(post.postingTimeIg)}
                                    </span>
                                )}
                                {post.postingTimeFb && (
                                    <span className="text-blue-600 dark:text-blue-400">
                                        FB {formatTimeForDisplay(post.postingTimeFb)}
                                    </span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                        >
                            <X size={20} className="text-[var(--text-secondary)]" />
                        </button>
                    </div>

                    {/* Content */}
                    <div className="flex-1 overflow-y-auto p-5">
                        <div className="flex gap-5">
                            {/* Image thumbnail */}
                            {imageUrl && (
                                <div className="flex-shrink-0">
                                    <div
                                        className="relative w-32 h-32 rounded-lg overflow-hidden bg-[var(--bg-tertiary)] group cursor-pointer"
                                        onClick={() => setShowImagePreview(true)}
                                    >
                                        <Image
                                            src={imageUrl}
                                            alt="Post image"
                                            fill
                                            className="object-cover"
                                            sizes="128px"
                                        />
                                        {/* Hover overlay with expand icon */}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Maximize2 size={24} className="text-white" />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Starter text */}
                            {post.starterText && (
                                <div className="flex-1">
                                    <label className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                                        Description
                                    </label>
                                    <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                                        {post.starterText}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Platform content */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-5">
                            {/* Instagram */}
                            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-sm font-semibold text-pink-600 dark:text-pink-400">
                                        Instagram
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                                            Caption
                                        </label>
                                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                                            {ai.ig.caption || <span className="text-[var(--text-muted)] italic">No caption generated</span>}
                                        </p>
                                    </div>
                                    {ai.ig.hashtags.length > 0 && (
                                        <div>
                                            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                                                Hashtags
                                            </label>
                                            <p className="text-sm text-[var(--text-primary)]">
                                                {ai.ig.hashtags.join(", ")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Facebook */}
                            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                                        Facebook
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                                            Caption
                                        </label>
                                        <p className="text-sm text-[var(--text-primary)] whitespace-pre-wrap">
                                            {ai.fb.caption || <span className="text-[var(--text-muted)] italic">No caption generated</span>}
                                        </p>
                                    </div>
                                    {ai.fb.hashtags.length > 0 && (
                                        <div>
                                            <label className="text-[10px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-1 block">
                                                Hashtags
                                            </label>
                                            <p className="text-sm text-[var(--text-primary)]">
                                                {ai.fb.hashtags.join(", ")}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Full image preview modal */}
            {imageUrl && (
                <ImagePreviewModal
                    isOpen={showImagePreview}
                    onClose={() => setShowImagePreview(false)}
                    imageUrl={imageUrl}
                    title={`${formatDisplayDate(post.date)} - Image`}
                />
            )}
        </>
    );
}
