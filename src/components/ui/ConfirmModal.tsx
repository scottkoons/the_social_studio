"use client";

import { useEffect, useCallback } from "react";
import { X, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
    open: boolean;
    title: string;
    description: string;
    confirmText?: string;
    cancelText?: string;
    confirmVariant?: "danger" | "primary";
    onConfirm: () => void;
    onCancel: () => void;
}

export default function ConfirmModal({
    open,
    title,
    description,
    confirmText = "Confirm",
    cancelText = "Cancel",
    confirmVariant = "primary",
    onConfirm,
    onCancel,
}: ConfirmModalProps) {
    // Handle ESC key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") {
            onCancel();
        }
    }, [onCancel]);

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
            onCancel();
        }
    };

    const confirmButtonClasses = confirmVariant === "danger"
        ? "bg-red-600 hover:bg-red-700 text-white"
        : "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white dark:text-gray-900";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden border border-[var(--border-primary)]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-primary)]">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-full">
                            <AlertTriangle className="text-amber-600 dark:text-amber-400" size={20} />
                        </div>
                        <h3 className="font-semibold text-[var(--text-primary)]">{title}</h3>
                    </div>
                    <button
                        onClick={onCancel}
                        className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4">
                    <p className="text-sm text-[var(--text-secondary)]">{description}</p>
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-end gap-3">
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                    >
                        {cancelText}
                    </button>
                    <button
                        onClick={onConfirm}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${confirmButtonClasses}`}
                    >
                        {confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
}
