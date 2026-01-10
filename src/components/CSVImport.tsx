"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { db } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { FileDown, AlertCircle, Check, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface ParsedRow {
    date: string;
    starterText: string;
}

interface DuplicateInfo {
    row: ParsedRow;
    existingData: any;
}

type DuplicateAction = "skip" | "overwrite" | "overwrite-empty";

export default function CSVImport() {
    const { user, workspaceId } = useAuth();
    const [isImporting, setIsImporting] = useState(false);
    const [status, setStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [duplicates, setDuplicates] = useState<DuplicateInfo[]>([]);
    const [currentDuplicateIndex, setCurrentDuplicateIndex] = useState(0);
    const [applyToAll, setApplyToAll] = useState(false);
    const [overwriteEmptyOnly, setOverwriteEmptyOnly] = useState(false);

    // Store pending import data
    const pendingImportRef = useRef<{
        newRows: ParsedRow[];
        duplicateRows: DuplicateInfo[];
        inputElement: HTMLInputElement | null;
    } | null>(null);

    // Import counters
    const countersRef = useRef({ created: 0, overwritten: 0, skipped: 0 });

    const resetState = () => {
        setShowModal(false);
        setDuplicates([]);
        setCurrentDuplicateIndex(0);
        setApplyToAll(false);
        setOverwriteEmptyOnly(false);
        pendingImportRef.current = null;
        countersRef.current = { created: 0, overwritten: 0, skipped: 0 };
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !user || !workspaceId) return;

        setIsImporting(true);
        setStatus(null);
        countersRef.current = { created: 0, overwritten: 0, skipped: 0 };

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                const data = results.data as any[];
                const newRows: ParsedRow[] = [];
                const duplicateRows: DuplicateInfo[] = [];

                // First pass: check all rows for duplicates
                for (const row of data) {
                    const date = row.date || row.Date;
                    const starterText = row.starterText || row.StarterText || "";

                    if (!date) {
                        countersRef.current.skipped++;
                        continue;
                    }

                    try {
                        const docRef = doc(db, "workspaces", workspaceId, "post_days", date);
                        const docSnap = await getDoc(docRef);

                        if (docSnap.exists()) {
                            duplicateRows.push({
                                row: { date, starterText },
                                existingData: docSnap.data()
                            });
                        } else {
                            newRows.push({ date, starterText });
                        }
                    } catch (err) {
                        console.error("Error checking row:", row, err);
                        countersRef.current.skipped++;
                    }
                }

                // Store pending data
                pendingImportRef.current = {
                    newRows,
                    duplicateRows,
                    inputElement: e.target
                };

                // If there are duplicates, show the modal
                if (duplicateRows.length > 0) {
                    setDuplicates(duplicateRows);
                    setCurrentDuplicateIndex(0);
                    setShowModal(true);
                    setIsImporting(false);
                } else {
                    // No duplicates - import all new rows directly
                    await importNewRows(newRows);
                    finishImport(e.target);
                }
            },
            error: (err) => {
                console.error("CSV Parse error:", err);
                setStatus({ type: 'error', message: "Failed to parse CSV file." });
                setIsImporting(false);
            }
        });
    };

    const importNewRows = async (rows: ParsedRow[]) => {
        if (!workspaceId) return;

        for (const row of rows) {
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", row.date);
                await setDoc(docRef, {
                    date: row.date,
                    starterText: row.starterText,
                    status: "input",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                countersRef.current.created++;
            } catch (err) {
                console.error("Error importing row:", row, err);
                countersRef.current.skipped++;
            }
        }
    };

    const handleDuplicateAction = async (action: DuplicateAction) => {
        if (!workspaceId || !pendingImportRef.current) return;

        const { duplicateRows } = pendingImportRef.current;

        if (applyToAll) {
            // Apply action to all remaining duplicates
            setIsImporting(true);
            setShowModal(false);

            for (let i = currentDuplicateIndex; i < duplicateRows.length; i++) {
                await processDuplicate(duplicateRows[i], action);
            }

            // Import new rows
            await importNewRows(pendingImportRef.current.newRows);
            finishImport(pendingImportRef.current.inputElement);
        } else {
            // Process current duplicate only
            await processDuplicate(duplicateRows[currentDuplicateIndex], action);

            // Move to next duplicate or finish
            if (currentDuplicateIndex + 1 < duplicateRows.length) {
                setCurrentDuplicateIndex(currentDuplicateIndex + 1);
            } else {
                // All duplicates handled, import new rows
                setIsImporting(true);
                setShowModal(false);
                await importNewRows(pendingImportRef.current.newRows);
                finishImport(pendingImportRef.current.inputElement);
            }
        }
    };

    const processDuplicate = async (duplicate: DuplicateInfo, action: DuplicateAction) => {
        if (!workspaceId) return;

        const docRef = doc(db, "workspaces", workspaceId, "post_days", duplicate.row.date);

        try {
            if (action === "skip") {
                countersRef.current.skipped++;
            } else if (action === "overwrite") {
                // Full overwrite - replace entire document
                await setDoc(docRef, {
                    date: duplicate.row.date,
                    starterText: duplicate.row.starterText,
                    status: "input",
                    createdAt: duplicate.existingData.createdAt || serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: false });
                countersRef.current.overwritten++;
            } else if (action === "overwrite-empty") {
                // Only overwrite empty fields
                const updates: any = {
                    updatedAt: serverTimestamp(),
                };

                // Only set starterText if existing is empty/missing
                if (!duplicate.existingData.starterText && duplicate.row.starterText) {
                    updates.starterText = duplicate.row.starterText;
                }

                // Ensure date is set
                if (!duplicate.existingData.date) {
                    updates.date = duplicate.row.date;
                }

                await setDoc(docRef, updates, { merge: true });
                countersRef.current.overwritten++;
            }
        } catch (err) {
            console.error("Error processing duplicate:", duplicate.row, err);
            countersRef.current.skipped++;
        }
    };

    const handleCancel = () => {
        // Reset input and close modal
        if (pendingImportRef.current?.inputElement) {
            pendingImportRef.current.inputElement.value = "";
        }
        resetState();
        setIsImporting(false);
    };

    const finishImport = (inputElement: HTMLInputElement | null) => {
        const { created, overwritten, skipped } = countersRef.current;

        const parts: string[] = [];
        if (created > 0) parts.push(`${created} created`);
        if (overwritten > 0) parts.push(`${overwritten} overwritten`);
        if (skipped > 0) parts.push(`${skipped} skipped`);

        setStatus({
            type: 'success',
            message: parts.length > 0 ? parts.join(", ") + "." : "No rows imported."
        });

        if (inputElement) {
            inputElement.value = "";
        }
        resetState();
        setIsImporting(false);
    };

    const currentDuplicate = duplicates[currentDuplicateIndex];

    return (
        <div className="relative">
            <label className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors cursor-pointer shadow-sm">
                {isImporting ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-teal-500" />
                ) : (
                    <FileDown size={18} />
                )}
                Import CSV
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={isImporting || showModal}
                    className="hidden"
                />
            </label>

            {/* Status Toast */}
            {status && (
                <div className={`absolute top-full mt-2 right-0 w-64 p-3 rounded-lg shadow-lg border z-20 ${status.type === 'success' ? 'bg-green-50 border-green-100 text-green-700' : 'bg-red-50 border-red-100 text-red-700'
                    }`}>
                    <div className="flex gap-2">
                        {status.type === 'success' ? <Check size={16} className="shrink-0" /> : <AlertCircle size={16} className="shrink-0" />}
                        <p className="text-xs font-medium">{status.message}</p>
                    </div>
                    <button
                        onClick={() => setStatus(null)}
                        className="mt-2 text-[10px] underline uppercase tracking-wider font-bold opacity-70"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Duplicate Confirmation Modal */}
            {showModal && currentDuplicate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                        {/* Header */}
                        <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-semibold text-gray-900">
                                Duplicate Found ({currentDuplicateIndex + 1} of {duplicates.length})
                            </h3>
                            <button
                                onClick={handleCancel}
                                className="text-gray-400 hover:text-gray-600 transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="px-6 py-4 space-y-4">
                            <p className="text-sm text-gray-600">
                                A post for <span className="font-bold text-gray-900">{currentDuplicate.row.date}</span> already exists.
                            </p>

                            {/* Comparison */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <p className="font-bold text-gray-400 uppercase tracking-wider mb-1">Existing</p>
                                    <p className="text-gray-700 line-clamp-3">
                                        {currentDuplicate.existingData.starterText || <span className="italic text-gray-400">(empty)</span>}
                                    </p>
                                </div>
                                <div className="bg-teal-50 rounded-lg p-3">
                                    <p className="font-bold text-teal-600 uppercase tracking-wider mb-1">New (CSV)</p>
                                    <p className="text-gray-700 line-clamp-3">
                                        {currentDuplicate.row.starterText || <span className="italic text-gray-400">(empty)</span>}
                                    </p>
                                </div>
                            </div>

                            {/* Options */}
                            <div className="space-y-2 pt-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={applyToAll}
                                        onChange={(e) => setApplyToAll(e.target.checked)}
                                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span className="text-gray-700">Apply to all duplicates</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={overwriteEmptyOnly}
                                        onChange={(e) => setOverwriteEmptyOnly(e.target.checked)}
                                        className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
                                    />
                                    <span className="text-gray-700">Overwrite empty fields only</span>
                                </label>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDuplicateAction("skip")}
                                className="px-4 py-2 text-sm font-medium bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg transition-colors"
                            >
                                Skip
                            </button>
                            <button
                                onClick={() => handleDuplicateAction(overwriteEmptyOnly ? "overwrite-empty" : "overwrite")}
                                className="px-4 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg transition-colors"
                            >
                                Overwrite
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
