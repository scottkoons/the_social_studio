"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { X, Upload, FileText, AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { PostDay } from "@/lib/types";
import {
    parseTextCsv,
    validateImport,
    ImportMatch,
} from "@/lib/textCsvUtils";
import { db } from "@/lib/firebase";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getLifecycleStatus, markPostEditedAfterUpload } from "@/lib/lifecycleService";

interface ImportTextCsvModalProps {
    open: boolean;
    posts: PostDay[];
    workspaceId: string;
    onClose: () => void;
    onImportComplete: (summary: { updated: number; skipped: number }) => void;
}

type Step = "upload" | "preview" | "applying";

export default function ImportTextCsvModal({
    open,
    posts,
    workspaceId,
    onClose,
    onImportComplete,
}: ImportTextCsvModalProps) {
    const [step, setStep] = useState<Step>("upload");
    const [error, setError] = useState<string | null>(null);
    const [matched, setMatched] = useState<ImportMatch[]>([]);
    const [skipped, setSkipped] = useState<string[]>([]);
    const [isApplying, setIsApplying] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Reset state when modal opens/closes
    useEffect(() => {
        if (open) {
            setStep("upload");
            setError(null);
            setMatched([]);
            setSkipped([]);
            setIsApplying(false);
        }
    }, [open]);

    // Handle ESC key
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.key === "Escape" && !isApplying) {
                onClose();
            }
        },
        [onClose, isApplying]
    );

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

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget && !isApplying) {
            onClose();
        }
    };

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setError(null);

        try {
            const content = await file.text();
            const parseResult = parseTextCsv(content);

            if (!parseResult.success) {
                setError(parseResult.error || "Failed to parse CSV");
                return;
            }

            const validationResult = validateImport(parseResult.rows!, posts);

            if (!validationResult.valid) {
                setError(validationResult.error || "Validation failed");
                return;
            }

            if (validationResult.matched.length === 0) {
                setError("No matching posts found. Check that platform and date values match your existing posts.");
                return;
            }

            setMatched(validationResult.matched);
            setSkipped(validationResult.skipped);
            setStep("preview");
        } catch (err) {
            console.error("File read error:", err);
            setError("Failed to read file");
        }

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleApply = async () => {
        setIsApplying(true);
        setStep("applying");

        let updated = 0;

        // Group matches by postId to batch updates
        const updatesByPost = new Map<string, { ig?: string; fb?: string; post: PostDay }>();

        for (const match of matched) {
            const post = posts.find(p =>
                p.date === match.date &&
                (p.docId === match.postId || p.date === match.postId)
            );

            if (!post) continue;

            const existing = updatesByPost.get(match.postId) || { post };
            if (match.platform === "IG") {
                existing.ig = match.newText;
            } else {
                existing.fb = match.newText;
            }
            updatesByPost.set(match.postId, existing);
        }

        for (const [postId, updates] of updatesByPost) {
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", postId);
                const updateData: Record<string, unknown> = {
                    updatedAt: serverTimestamp(),
                };

                if (updates.ig !== undefined) {
                    updateData["ai.ig.caption"] = updates.ig;
                }
                if (updates.fb !== undefined) {
                    updateData["ai.fb.caption"] = updates.fb;
                }

                await updateDoc(docRef, updateData);

                // Mark as edited after upload if needed
                const currentLifecycle = getLifecycleStatus(updates.post);
                if (currentLifecycle === "uploaded" || currentLifecycle === "posted") {
                    await markPostEditedAfterUpload(workspaceId, postId, currentLifecycle);
                }

                updated += (updates.ig !== undefined ? 1 : 0) + (updates.fb !== undefined ? 1 : 0);
            } catch (err) {
                console.error(`Failed to update post ${postId}:`, err);
            }
        }

        setIsApplying(false);
        onImportComplete({ updated, skipped: skipped.length });
        onClose();
    };

    const truncateText = (text: string, maxLength: number = 80) => {
        if (text.length <= maxLength) return text;
        return text.slice(0, maxLength) + "...";
    };

    // Get up to 5 example diffs where text actually changed
    const exampleDiffs = matched
        .filter(m => m.oldText !== m.newText)
        .slice(0, 5);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleBackdropClick}
        >
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-2xl w-full mx-4 overflow-hidden max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                            <Upload className="text-purple-600 dark:text-purple-400" size={20} />
                        </div>
                        <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                            Import Text CSV
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isApplying}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-4 overflow-y-auto flex-1">
                    {step === "upload" && (
                        <div className="space-y-4">
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                Upload a CSV file with columns: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">platform,date,postText</code>
                            </p>

                            <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
                                <FileText className="mx-auto text-gray-400 mb-3" size={40} />
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                    Select a CSV file to import
                                </p>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv,text/csv"
                                    onChange={handleFileSelect}
                                    className="hidden"
                                    id="csv-file-input"
                                />
                                <label
                                    htmlFor="csv-file-input"
                                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer transition-colors"
                                >
                                    <Upload size={16} />
                                    Choose File
                                </label>
                            </div>

                            {error && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <AlertCircle className="text-red-500 flex-shrink-0 mt-0.5" size={18} />
                                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                                    </div>
                                </div>
                            )}

                            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-xs text-gray-600 dark:text-gray-400">
                                <p className="font-medium mb-2">CSV Format Requirements:</p>
                                <ul className="list-disc list-inside space-y-1">
                                    <li>Header row: platform,date,postText</li>
                                    <li>Platform: &quot;IG&quot; or &quot;FB&quot;</li>
                                    <li>Date: YYYY-MM-DD format</li>
                                    <li>No duplicate platform+date combinations</li>
                                    <li>postText cannot be empty</li>
                                </ul>
                            </div>
                        </div>
                    )}

                    {step === "preview" && (
                        <div className="space-y-4">
                            {/* Summary */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4">
                                    <div className="flex items-center gap-2">
                                        <CheckCircle className="text-emerald-500" size={18} />
                                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                                            {matched.length} post{matched.length !== 1 ? "s" : ""} to update
                                        </span>
                                    </div>
                                </div>
                                {skipped.length > 0 && (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                                        <div className="flex items-center gap-2">
                                            <AlertCircle className="text-amber-500" size={18} />
                                            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
                                                {skipped.length} row{skipped.length !== 1 ? "s" : ""} skipped (not found)
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Skipped keys */}
                            {skipped.length > 0 && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    <p className="font-medium mb-1">Skipped keys:</p>
                                    <p className="font-mono">{skipped.slice(0, 5).join(", ")}{skipped.length > 5 ? `, +${skipped.length - 5} more` : ""}</p>
                                </div>
                            )}

                            {/* Example Diffs */}
                            {exampleDiffs.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Preview changes ({exampleDiffs.length} of {matched.filter(m => m.oldText !== m.newText).length} changes):
                                    </p>
                                    <div className="space-y-3 max-h-60 overflow-y-auto">
                                        {exampleDiffs.map((diff, i) => (
                                            <div
                                                key={i}
                                                className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3 text-xs"
                                            >
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                                                        diff.platform === "IG"
                                                            ? "bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300"
                                                            : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                                                    }`}>
                                                        {diff.platform}
                                                    </span>
                                                    <span className="text-gray-500 dark:text-gray-400">{diff.date}</span>
                                                </div>
                                                <div className="space-y-1">
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-red-500 font-mono w-4">-</span>
                                                        <span className="text-gray-600 dark:text-gray-400 line-through">
                                                            {truncateText(diff.oldText) || "(empty)"}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-start gap-2">
                                                        <span className="text-emerald-500 font-mono w-4">+</span>
                                                        <span className="text-gray-900 dark:text-gray-100">
                                                            {truncateText(diff.newText)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {exampleDiffs.length === 0 && matched.length > 0 && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <p className="text-sm text-blue-700 dark:text-blue-300">
                                        All matched posts already have the same text. No changes will be made.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {step === "applying" && (
                        <div className="py-8 text-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-4 border-purple-200 border-t-purple-600 mx-auto mb-4" />
                            <p className="text-gray-600 dark:text-gray-400">Applying updates...</p>
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 flex justify-end gap-3">
                    {step === "upload" && (
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                    )}

                    {step === "preview" && (
                        <>
                            <button
                                onClick={() => {
                                    setStep("upload");
                                    setMatched([]);
                                    setSkipped([]);
                                    setError(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600 rounded-lg transition-colors"
                            >
                                Back
                            </button>
                            <button
                                onClick={handleApply}
                                disabled={matched.filter(m => m.oldText !== m.newText).length === 0}
                                className="px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                            >
                                <ArrowRight size={16} />
                                Apply Updates ({matched.filter(m => m.oldText !== m.newText).length})
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
