"use client";

import { useState, useEffect, useCallback } from "react";
import { X, Upload, CheckCircle } from "lucide-react";

interface MarkUploadedModalProps {
    open: boolean;
    exportedCount: number;
    onClose: () => void;
    onConfirm: () => Promise<void>;
}

export default function MarkUploadedModal({
    open,
    exportedCount,
    onClose,
    onConfirm,
}: MarkUploadedModalProps) {
    const [isUpdating, setIsUpdating] = useState(false);

    // Handle ESC key
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isUpdating) {
                onClose();
            }
        },
        [onClose, isUpdating]
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
        if (e.target === e.currentTarget && !isUpdating) {
            onClose();
        }
    };

    const handleConfirm = async () => {
        setIsUpdating(true);
        try {
            await onConfirm();
            onClose();
        } catch (error) {
            console.error("Failed to mark posts as uploaded:", error);
        } finally {
            setIsUpdating(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-full">
                            <Upload className="text-blue-600 dark:text-blue-400" size={20} />
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            Mark as Uploaded
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isUpdating}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        This will mark <strong>{exportedCount}</strong> exported{" "}
                        {exportedCount === 1 ? "post" : "posts"} as uploaded to Buffer.
                    </p>

                    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle
                                className="text-blue-500 mt-0.5 flex-shrink-0"
                                size={18}
                            />
                            <div className="text-sm text-blue-800 dark:text-blue-300">
                                <p className="font-medium">After marking as uploaded:</p>
                                <ul className="mt-2 space-y-1 list-disc list-inside text-blue-700 dark:text-blue-400">
                                    <li>Posts will show &quot;Uploaded&quot; status</li>
                                    <li>
                                        Edits will show a warning badge
                                    </li>
                                    <li>You can still export again if needed</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                    <button
                        onClick={onClose}
                        disabled={isUpdating}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={isUpdating || exportedCount === 0}
                        className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                        {isUpdating ? (
                            <>
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white" />
                                Updating...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Mark as Uploaded
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
