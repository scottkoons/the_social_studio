"use client";

import { useState, useRef, useEffect } from "react";
import Papa from "papaparse";
import { db, functions } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "@/context/AuthContext";
import { X, Upload, AlertCircle, Calendar, Loader2 } from "lucide-react";
import { parseCsvDate, getTodayInDenver } from "@/lib/utils";
import {
    CsvRow,
    SchedulePlan,
    validateScheduleInput,
    generateSchedulePlan,
} from "@/lib/schedulePlanner";
import SchedulePlanPreview from "./SchedulePlanPreview";
import { format, addDays, parseISO } from "date-fns";

interface SchedulePlannerModalProps {
    open: boolean;
    onClose: () => void;
    onComplete: (count: number) => void;
}

interface ImportImageResponse {
    success: boolean;
    skipped?: boolean;
    assetId?: string;
    downloadUrl?: string;
    error?: string;
    reason?: string;
}

export default function SchedulePlannerModal({ open, onClose, onComplete }: SchedulePlannerModalProps) {
    const { workspaceId } = useAuth();

    // Form state
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvRows, setCsvRows] = useState<CsvRow[]>([]);

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0 });

    // Results
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [schedulePlan, setSchedulePlan] = useState<SchedulePlan | null>(null);
    const [existingDates, setExistingDates] = useState<Set<string>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Set default dates on open
    useEffect(() => {
        if (open) {
            const today = getTodayInDenver();
            const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
            const twoWeeksLater = format(addDays(parseISO(today), 14), "yyyy-MM-dd");
            setStartDate(tomorrow);
            setEndDate(twoWeeksLater);
        }
    }, [open]);

    // Fetch existing post dates when modal opens or dates change
    useEffect(() => {
        if (!open || !workspaceId || !startDate || !endDate) return;

        const fetchExistingDates = async () => {
            try {
                const postsRef = collection(db, "workspaces", workspaceId, "post_days");
                const snapshot = await getDocs(postsRef);
                const dates = new Set<string>();
                snapshot.docs.forEach(doc => {
                    const date = doc.id;
                    // Only include dates within the selected range
                    if (date >= startDate && date <= endDate) {
                        dates.add(date);
                    }
                });
                setExistingDates(dates);
            } catch (err) {
                console.error("Error fetching existing dates:", err);
            }
        };

        fetchExistingDates();
    }, [open, workspaceId, startDate, endDate]);

    const resetState = () => {
        setCsvFile(null);
        setCsvRows([]);
        setValidationErrors([]);
        setSchedulePlan(null);
        setIsProcessing(false);
        setIsApplying(false);
        setApplyProgress({ current: 0, total: 0 });
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleClose = () => {
        resetState();
        onClose();
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setCsvFile(file);
        setValidationErrors([]);
        setSchedulePlan(null);
        setIsProcessing(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as Record<string, string>[];
                const rows: CsvRow[] = [];
                const parseErrors: string[] = [];

                for (let i = 0; i < data.length; i++) {
                    const row = data[i];
                    const rawDate = row.date || row.Date || "";
                    const starterText = row.starterText || row.StarterText || row.starter_text || "";
                    const imageUrl = row.imageUrl || row.ImageUrl || row.imageURL || row.image_url || "";

                    // Parse date if provided
                    let date: string | undefined = undefined;
                    if (rawDate && rawDate.trim()) {
                        const parsed = parseCsvDate(rawDate);
                        if (!parsed) {
                            parseErrors.push(`Row ${i + 2}: Invalid date format "${rawDate}". Use YYYY-MM-DD or MM/DD/YY.`);
                            continue;
                        }
                        date = parsed;
                    }

                    rows.push({
                        date,
                        starterText: starterText || "",
                        imageUrl: imageUrl || "",
                    });
                }

                if (parseErrors.length > 0) {
                    setValidationErrors(parseErrors);
                    setIsProcessing(false);
                    return;
                }

                setCsvRows(rows);

                // Validate and generate plan
                const validation = validateScheduleInput(startDate, endDate, rows, existingDates);
                if (!validation.valid) {
                    setValidationErrors(validation.errors);
                    setIsProcessing(false);
                    return;
                }

                // Generate the plan
                const plan = generateSchedulePlan(startDate, endDate, rows, existingDates);
                setSchedulePlan(plan);
                setIsProcessing(false);
            },
            error: (err) => {
                console.error("CSV parse error:", err);
                setValidationErrors(["Failed to parse CSV file. Please check the format."]);
                setIsProcessing(false);
            },
        });
    };

    const handleRegenerate = () => {
        if (csvRows.length === 0) return;

        setValidationErrors([]);
        setSchedulePlan(null);

        const validation = validateScheduleInput(startDate, endDate, csvRows, existingDates);
        if (!validation.valid) {
            setValidationErrors(validation.errors);
            return;
        }

        const plan = generateSchedulePlan(startDate, endDate, csvRows, existingDates);
        setSchedulePlan(plan);
    };

    const handleApply = async () => {
        if (!schedulePlan || !workspaceId) return;

        setIsApplying(true);
        setApplyProgress({ current: 0, total: schedulePlan.rows.length });

        const importImageFromUrl = httpsCallable<
            { workspaceId: string; dateId: string; imageUrl: string },
            ImportImageResponse
        >(functions, "importImageFromUrl");

        let created = 0;

        for (let i = 0; i < schedulePlan.rows.length; i++) {
            const row = schedulePlan.rows[i];
            setApplyProgress({ current: i + 1, total: schedulePlan.rows.length });

            try {
                // Create the post document
                const docRef = doc(db, "workspaces", workspaceId, "post_days", row.date);
                await setDoc(docRef, {
                    date: row.date,
                    starterText: row.starterText,
                    postingTime: row.postingTime,
                    postingTimeSource: "auto",
                    status: "input",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });

                // Import image if provided
                if (row.imageUrl && row.imageUrl.trim()) {
                    try {
                        await importImageFromUrl({
                            workspaceId,
                            dateId: row.date,
                            imageUrl: row.imageUrl,
                        });
                    } catch (imgErr) {
                        console.warn(`Image import failed for ${row.date}:`, imgErr);
                        // Continue even if image fails
                    }
                }

                created++;
            } catch (err) {
                console.error(`Error creating post for ${row.date}:`, err);
            }
        }

        setIsApplying(false);
        onComplete(created);
        handleClose();
    };

    if (!open) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="bg-[var(--bg-secondary)] px-6 py-4 border-b border-[var(--border-primary)] flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <Calendar className="text-[var(--accent-primary)]" size={20} />
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                            Schedule Planner
                        </h2>
                    </div>
                    <button
                        onClick={handleClose}
                        disabled={isApplying}
                        className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors disabled:opacity-50"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Date Range */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => {
                                    setStartDate(e.target.value);
                                    setSchedulePlan(null);
                                }}
                                disabled={isApplying}
                                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-1">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => {
                                    setEndDate(e.target.value);
                                    setSchedulePlan(null);
                                }}
                                disabled={isApplying}
                                className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                            />
                        </div>
                    </div>

                    {/* Existing posts info */}
                    {existingDates.size > 0 && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                                {existingDates.size} existing post{existingDates.size !== 1 ? "s" : ""} in this date range will be preserved.
                            </p>
                        </div>
                    )}

                    {/* CSV Upload */}
                    <div>
                        <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                            Upload CSV
                        </label>
                        <div className="border-2 border-dashed border-[var(--border-primary)] rounded-lg p-6 text-center hover:border-[var(--accent-primary)] transition-colors">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".csv"
                                onChange={handleFileSelect}
                                disabled={isProcessing || isApplying}
                                className="hidden"
                                id="csv-upload"
                            />
                            <label
                                htmlFor="csv-upload"
                                className="cursor-pointer flex flex-col items-center gap-2"
                            >
                                {isProcessing ? (
                                    <Loader2 className="animate-spin text-[var(--accent-primary)]" size={24} />
                                ) : (
                                    <Upload className="text-[var(--text-muted)]" size={24} />
                                )}
                                <span className="text-sm text-[var(--text-secondary)]">
                                    {csvFile ? csvFile.name : "Click to upload CSV"}
                                </span>
                                <span className="text-xs text-[var(--text-muted)]">
                                    Columns: date (optional), starterText, imageUrl
                                </span>
                            </label>
                        </div>
                    </div>

                    {/* Validation Errors */}
                    {validationErrors.length > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={16} />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                                        Validation Errors
                                    </p>
                                    <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                                        {validationErrors.map((error, idx) => (
                                            <li key={idx}>{error}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Schedule Preview */}
                    {schedulePlan && (
                        <SchedulePlanPreview plan={schedulePlan} />
                    )}
                </div>

                {/* Footer */}
                <div className="bg-[var(--bg-secondary)] px-6 py-4 border-t border-[var(--border-primary)] flex items-center justify-between shrink-0">
                    <div className="text-sm text-[var(--text-muted)]">
                        {isApplying && (
                            <span>Creating posts... {applyProgress.current}/{applyProgress.total}</span>
                        )}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleClose}
                            disabled={isApplying}
                            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                        >
                            Cancel
                        </button>
                        {csvRows.length > 0 && !schedulePlan && (
                            <button
                                onClick={handleRegenerate}
                                disabled={isProcessing || isApplying || validationErrors.length > 0}
                                className="px-4 py-2 text-sm font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] rounded-lg transition-colors disabled:opacity-50"
                            >
                                Regenerate Plan
                            </button>
                        )}
                        <button
                            onClick={handleApply}
                            disabled={!schedulePlan || isApplying}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white rounded-lg transition-colors disabled:opacity-50"
                        >
                            {isApplying ? (
                                <>
                                    <Loader2 className="animate-spin" size={16} />
                                    Applying...
                                </>
                            ) : (
                                "Apply Schedule"
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
