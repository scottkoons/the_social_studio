"use client";

import { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import Image from "next/image";

interface ImagePreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    imageUrl: string;
    title?: string;
}

export default function ImagePreviewModal({ isOpen, onClose, imageUrl, title }: ImagePreviewModalProps) {
    // Handle ESC key
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
        if (e.key === "Escape") {
            onClose();
        }
    }, [onClose]);

    // Prevent background scroll and add ESC listener
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = "hidden";
            document.addEventListener("keydown", handleKeyDown);
        }

        return () => {
            document.body.style.overflow = "";
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isOpen, handleKeyDown]);

    if (!isOpen) return null;

    // Close when clicking backdrop
    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            {/* Modal panel */}
            <div className="relative bg-gray-900 rounded-xl shadow-2xl overflow-hidden max-w-[90vw] max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
                    <span className="text-sm font-medium text-gray-200 truncate max-w-[300px]">
                        {title || "Image Preview"}
                    </span>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                        title="Close (ESC)"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Image container */}
                <div className="relative flex items-center justify-center bg-gray-950 p-4" style={{ maxWidth: "90vw", maxHeight: "80vh" }}>
                    <div className="relative" style={{ maxWidth: "calc(90vw - 2rem)", maxHeight: "calc(80vh - 4rem)" }}>
                        <Image
                            src={imageUrl}
                            alt={title || "Preview"}
                            width={1200}
                            height={800}
                            className="object-contain max-w-full max-h-[calc(80vh-4rem)]"
                            style={{ width: "auto", height: "auto" }}
                            priority
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
