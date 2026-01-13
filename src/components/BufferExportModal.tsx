"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Download, Instagram, Facebook, FileText, AlertCircle } from "lucide-react";
import { PostDay } from "@/lib/types";
import {
    generateBufferCsv,
    generateMultiPlatformZip,
    downloadCsv,
    downloadZip,
    getExportFilename,
    BufferPlatform,
    postHasImage,
} from "@/lib/bufferCsvExport";

interface BufferExportModalProps {
    open: boolean;
    posts: PostDay[];
    imageUrls: Map<string, string>;
    imageUrlsLoading?: boolean;
    onClose: () => void;
    onExportComplete: (summary: { exported: number; skipped: number }) => void;
}

export default function BufferExportModal({
    open,
    posts,
    imageUrls,
    imageUrlsLoading = false,
    onClose,
    onExportComplete,
}: BufferExportModalProps) {
    const [selectedPlatforms, setSelectedPlatforms] = useState<Set<BufferPlatform>>(
        new Set(["instagram", "facebook"])
    );
    const [isExporting, setIsExporting] = useState(false);

    // Handle ESC key
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                onClose();
            }
        },
        [onClose]
    );

    // Prevent background scroll and add ESC listener
    useEffect(() => {
        if (open) {
            document.body.style.overflow = "hidden";
            document.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            document.body.style.overflow = "";
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [open, handleKeyDown]);

    if (!open) return null;

    // Close when clicking backdrop
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const togglePlatform = (platform: BufferPlatform) => {
        setSelectedPlatforms((prev) => {
            const next = new Set(prev);
            if (next.has(platform)) {
                next.delete(platform);
            } else {
                next.add(platform);
            }
            return next;
        });
    };

    // Calculate preview stats using the same resolver as export
    const postsWithImages = posts.filter((p) => {
        const hasImage = postHasImage(p, imageUrls);
        // DEBUG: Log posts counted as missing image
        if (!hasImage && !imageUrlsLoading) {
            console.warn("[BufferExport] missing image", {
                date: p.date,
                imageAssetId: p.imageAssetId,
                imageUrl: p.imageUrl,
                assetUrlInMap: p.imageAssetId ? imageUrls.has(p.imageAssetId) : false,
            });
        }
        return hasImage;
    });
    const postsWithCaption = postsWithImages.filter(
        (p) => p.ai?.ig?.caption || p.ai?.fb?.caption
    );
    const eligibleCount = postsWithCaption.length;
    const skippedNoImage = posts.length - postsWithImages.length;
    const skippedNoCaption = postsWithImages.length - postsWithCaption.length;

    const handleExport = async () => {
        if (selectedPlatforms.size === 0) return;

        setIsExporting(true);

        try {
            const platforms = Array.from(selectedPlatforms);

            if (platforms.length === 1) {
                // Single platform: download CSV directly
                const platform = platforms[0];
                const result = generateBufferCsv(posts, platform, imageUrls);
                const filename = getExportFilename(platform);
                downloadCsv(result.csv, filename);

                onExportComplete({
                    exported: result.exportedCount,
                    skipped: result.skippedNoImage + result.skippedNoCaption,
                });
            } else {
                // Multiple platforms: generate ZIP
                const { blob, summary } = await generateMultiPlatformZip(
                    posts,
                    platforms,
                    imageUrls
                );
                const filename = getExportFilename("all");
                downloadZip(blob, filename);

                onExportComplete({
                    exported: summary.exported,
                    skipped: summary.skippedNoImage + summary.skippedNoCaption,
                });
            }

            onClose();
        } catch (error) {
            console.error("Export failed:", error);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-teal-100 rounded-full">
                            <FileText className="text-teal-600" size={20} />
                        </div>
                        <h3 className="font-semibold text-gray-900">Export for Buffer</h3>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                    <p className="text-sm text-gray-600">
                        Export posts as CSV files for Buffer&apos;s Bulk Upload feature.
                    </p>

                    {/* Platform Selection */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-gray-700">
                            Select platforms to export:
                        </label>
                        <div className="flex gap-3">
                            <button
                                onClick={() => togglePlatform("instagram")}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                                    selectedPlatforms.has("instagram")
                                        ? "border-teal-500 bg-teal-50 text-teal-700"
                                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                                }`}
                            >
                                <Instagram size={18} />
                                <span className="font-medium">Instagram</span>
                            </button>
                            <button
                                onClick={() => togglePlatform("facebook")}
                                className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 transition-all ${
                                    selectedPlatforms.has("facebook")
                                        ? "border-teal-500 bg-teal-50 text-teal-700"
                                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                                }`}
                            >
                                <Facebook size={18} />
                                <span className="font-medium">Facebook</span>
                            </button>
                        </div>
                    </div>

                    {/* Export Summary */}
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                        {imageUrlsLoading ? (
                            <div className="flex items-center gap-2 text-gray-500">
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-teal-500" />
                                <span className="text-sm">Loading images...</span>
                            </div>
                        ) : (
                            <>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-600">Posts to export:</span>
                                    <span className="font-medium text-gray-900">{eligibleCount}</span>
                                </div>
                                {skippedNoImage > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-amber-600 flex items-center gap-1">
                                            <AlertCircle size={14} />
                                            Missing image:
                                        </span>
                                        <span className="font-medium text-amber-600">{skippedNoImage}</span>
                                    </div>
                                )}
                                {skippedNoCaption > 0 && (
                                    <div className="flex justify-between text-sm">
                                        <span className="text-amber-600 flex items-center gap-1">
                                            <AlertCircle size={14} />
                                            No caption:
                                        </span>
                                        <span className="font-medium text-amber-600">{skippedNoCaption}</span>
                                    </div>
                                )}
                                {selectedPlatforms.size === 2 && eligibleCount > 0 && (
                                    <div className="text-xs text-gray-500 pt-2 border-t border-gray-200">
                                        Will download as ZIP with separate CSV files for each platform.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={selectedPlatforms.size === 0 || eligibleCount === 0 || isExporting || imageUrlsLoading}
                        className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-teal-600 hover:bg-teal-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                        {isExporting ? (
                            <>
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                Exporting...
                            </>
                        ) : (
                            <>
                                <Download size={16} />
                                Export CSV{selectedPlatforms.size > 1 ? "s" : ""}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
