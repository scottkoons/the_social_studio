"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import Papa from "papaparse";
import { differenceInCalendarDays, parseISO } from "date-fns";
import { db, functions } from "@/lib/firebase";
import { collection, getDocs, doc, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "@/context/AuthContext";
import { CalendarDays, Upload, AlertCircle, Loader2, Check, RotateCcw, FileSpreadsheet } from "lucide-react";
import { formatTimeForDisplay } from "@/lib/postingTime";
import {
    Platform,
    GeneratedPlan,
    SchedulePreview,
    PlanningCsvRow,
    buildPlanSlots,
    parseCsvRows,
    validateCsvAgainstPlan,
    applyCsvToPlanSlots,
    formatDateDisplay,
    formatDateShort,
    getPlatformDisplayName,
    getPlatformColorClasses,
} from "@/lib/planningScheduler";

interface PlatformPlanCardProps {
    platform: Platform;
    startDate: string;  // Shared from parent
    endDate: string;    // Shared from parent
    defaultPostsPerWeek: number;  // FB=4, IG=6
    recommendedRange: string;  // e.g., "4–6" or "6–7"
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

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function PlatformPlanCard({
    platform,
    startDate,
    endDate,
    defaultPostsPerWeek,
    recommendedRange,
    onComplete
}: PlatformPlanCardProps) {
    const { workspaceId } = useAuth();

    // Plan generation state
    const [postsPerWeek, setPostsPerWeek] = useState(defaultPostsPerWeek);
    const [generatedPlan, setGeneratedPlan] = useState<GeneratedPlan | null>(null);

    // CSV state
    const [csvFile, setCsvFile] = useState<File | null>(null);
    const [csvRows, setCsvRows] = useState<PlanningCsvRow[]>([]);
    const [schedulePreview, setSchedulePreview] = useState<SchedulePreview | null>(null);

    // Processing state
    const [isProcessing, setIsProcessing] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [applyProgress, setApplyProgress] = useState({ current: 0, total: 0 });

    // Errors
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    // Existing posts for this platform
    const [existingPlatformDates, setExistingPlatformDates] = useState<Set<string>>(new Set());

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Calculate projected posts based on date range and posts per week
    const projection = useMemo(() => {
        if (!startDate || !endDate) {
            return { isValid: false, projected: 0, maxPossible: 0, error: null };
        }

        try {
            const start = parseISO(startDate);
            const end = parseISO(endDate);
            const daysInRange = differenceInCalendarDays(end, start) + 1; // +1 for inclusive

            if (daysInRange < 1) {
                return { isValid: false, projected: 0, maxPossible: 0, error: "End date must be after start date" };
            }

            const weeksInRange = daysInRange / 7;
            const rawProjected = Math.round(weeksInRange * postsPerWeek);
            // Clamp to valid range: at least 0, at most daysInRange (1 post per day max)
            const projected = Math.max(0, Math.min(rawProjected, daysInRange));

            return { isValid: true, projected, maxPossible: daysInRange, error: null };
        } catch {
            return { isValid: false, projected: 0, maxPossible: 0, error: "Invalid date format" };
        }
    }, [startDate, endDate, postsPerWeek]);

    // Reset ALL state when dates change - single source of truth from parent
    useEffect(() => {
        setGeneratedPlan(null);
        setSchedulePreview(null);
        setCsvFile(null);
        setCsvRows([]);
        setValidationErrors([]);
        setExistingPlatformDates(new Set()); // Clear immediately before async refetch
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    }, [startDate, endDate]);

    // Fetch existing posts for THIS PLATFORM when dates change
    useEffect(() => {
        if (!workspaceId || !startDate || !endDate) return;

        const fetchExisting = async () => {
            try {
                const postsRef = collection(db, "workspaces", workspaceId, "post_days");
                const snapshot = await getDocs(postsRef);
                const dates = new Set<string>();

                snapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    // Get the platform from the data, default legacy posts to facebook
                    const postPlatform = data.platform || "facebook";
                    const postDate = data.date;

                    // Only include dates for THIS platform within range
                    // Platform-specific blocking: FB posts only block FB, IG only blocks IG
                    if (postPlatform === platform && postDate >= startDate && postDate <= endDate) {
                        dates.add(postDate);
                    }
                });

                setExistingPlatformDates(dates);
            } catch (err) {
                console.error("Error fetching existing posts:", err);
            }
        };

        fetchExisting();
    }, [workspaceId, platform, startDate, endDate]);

    const platformColors = getPlatformColorClasses(platform);
    const platformName = getPlatformDisplayName(platform);

    const handleGeneratePlan = () => {
        if (!startDate || !endDate || postsPerWeek < 1) return;

        setValidationErrors([]);
        setCsvFile(null);
        setCsvRows([]);
        setSchedulePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }

        // Generate plan synchronously using current prop values (no setTimeout to avoid stale closures)
        const plan = buildPlanSlots(startDate, endDate, postsPerWeek, existingPlatformDates);
        plan.platform = platform;
        setGeneratedPlan(plan);
    };

    const handleResetPlan = () => {
        setGeneratedPlan(null);
        setCsvFile(null);
        setCsvRows([]);
        setSchedulePreview(null);
        setValidationErrors([]);
        if (fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !generatedPlan) return;

        setCsvFile(file);
        setValidationErrors([]);
        setSchedulePreview(null);
        setIsProcessing(true);

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const data = results.data as Record<string, string>[];

                // Parse CSV rows
                const { rows, errors: parseErrors } = parseCsvRows(data);

                if (parseErrors.length > 0) {
                    setValidationErrors(parseErrors);
                    setIsProcessing(false);
                    return;
                }

                setCsvRows(rows);

                // Validate against plan (platform-specific existing dates)
                const validation = validateCsvAgainstPlan(generatedPlan, rows, existingPlatformDates);
                if (!validation.valid) {
                    setValidationErrors(validation.errors);
                    setIsProcessing(false);
                    return;
                }

                // Generate preview
                const preview = applyCsvToPlanSlots(generatedPlan, rows);
                setSchedulePreview(preview);
                setIsProcessing(false);
            },
            error: (err) => {
                console.error("CSV parse error:", err);
                setValidationErrors(["Failed to parse CSV file. Please check the format."]);
                setIsProcessing(false);
            },
        });
    };

    const handleApply = async () => {
        if (!schedulePreview || !workspaceId) return;

        setIsApplying(true);
        setApplyProgress({ current: 0, total: schedulePreview.rows.length });

        const importImageFromUrl = httpsCallable<
            { workspaceId: string; dateId: string; imageUrl: string },
            ImportImageResponse
        >(functions, "importImageFromUrl");

        let created = 0;

        for (let i = 0; i < schedulePreview.rows.length; i++) {
            const row = schedulePreview.rows[i];
            setApplyProgress({ current: i + 1, total: schedulePreview.rows.length });

            try {
                // Create unique document ID for platform-specific posts
                // Format: YYYY-MM-DD-platform (e.g., 2024-01-15-facebook)
                const docId = `${row.date}-${platform}`;
                const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);

                await setDoc(docRef, {
                    date: row.date,
                    platform: platform,
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
                            dateId: docId,
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

        // Reset state after successful apply
        handleResetPlan();
    };

    const datesValid = startDate && endDate && startDate <= endDate;

    return (
        <div className={`bg-[var(--bg-card)] border ${platformColors.border} rounded-xl overflow-hidden`}>
            {/* Header */}
            <div className={`${platformColors.bg} px-5 py-4 border-b ${platformColors.border}`}>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <CalendarDays className={platformColors.text} size={20} />
                        <h2 className={`text-lg font-semibold ${platformColors.text}`}>
                            {platformName}
                        </h2>
                    </div>
                    {generatedPlan && (
                        <span className={`text-sm font-medium ${platformColors.text}`}>
                            {generatedPlan.totalSlots} post{generatedPlan.totalSlots !== 1 ? "s" : ""}
                        </span>
                    )}
                </div>
            </div>

            <div className="p-5 space-y-5">
                {/* Posts Per Week Control */}
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <label className="text-sm font-medium text-[var(--text-primary)]">
                                Posts per Week
                            </label>
                            <p className="text-xs text-[var(--text-muted)] mt-0.5">
                                Recommended: {recommendedRange}/week
                            </p>
                        </div>
                        <input
                            type="number"
                            min={1}
                            max={7}
                            value={postsPerWeek}
                            onChange={(e) => {
                                setPostsPerWeek(parseInt(e.target.value) || 1);
                                setGeneratedPlan(null);
                                setSchedulePreview(null);
                            }}
                            disabled={isApplying}
                            className="w-20 px-3 py-1.5 bg-[var(--input-bg)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] text-center focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                        />
                    </div>

                    {/* Projected posts - updates instantly */}
                    {projection.error ? (
                        <p className="text-xs text-[var(--status-error)] flex items-center gap-1">
                            <AlertCircle size={12} />
                            {projection.error}
                        </p>
                    ) : projection.isValid ? (
                        <p className="text-xs text-[var(--text-muted)]">
                            Projected: <span className="font-medium text-[var(--text-secondary)]">{projection.projected} posts</span> (max {projection.maxPossible})
                        </p>
                    ) : null}

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleGeneratePlan}
                            disabled={!datesValid || postsPerWeek < 1 || isApplying}
                            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${platformColors.bg} ${platformColors.text} border ${platformColors.border} rounded-lg transition-colors hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed`}
                        >
                            <CalendarDays size={16} />
                            Generate Plan
                        </button>

                        {generatedPlan && (
                            <button
                                onClick={handleResetPlan}
                                disabled={isApplying}
                                className="p-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors disabled:opacity-50"
                                title="Reset plan"
                            >
                                <RotateCcw size={16} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Existing posts info */}
                {existingPlatformDates.size > 0 && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <p className="text-sm text-amber-700 dark:text-amber-300">
                            {existingPlatformDates.size} existing {platformName} post{existingPlatformDates.size !== 1 ? "s" : ""} in this date range will be preserved.
                        </p>
                    </div>
                )}

                {/* Generated Plan Preview */}
                {generatedPlan && (
                    <div className="space-y-4 pt-4 border-t border-[var(--border-primary)]">
                        {/* Summary */}
                        <div className={`${platformColors.bg} rounded-lg p-3`}>
                            <p className={`text-sm font-medium ${platformColors.text}`}>
                                {platformName} – {generatedPlan.totalSlots} post{generatedPlan.totalSlots !== 1 ? "s" : ""}
                            </p>
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                                {formatDateDisplay(generatedPlan.startDate)} – {formatDateDisplay(generatedPlan.endDate)}
                            </p>
                        </div>

                        {/* Day of Week Breakdown */}
                        <div className="bg-[var(--bg-tertiary)] rounded-lg overflow-hidden">
                            <div className="px-4 py-2 border-b border-[var(--border-primary)]">
                                <h4 className="text-xs font-medium text-[var(--text-secondary)]">Day-of-Week Breakdown</h4>
                            </div>
                            <div className="p-3">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-[var(--border-secondary)]">
                                            <th className="text-left py-1 text-[var(--text-secondary)] font-medium">Day</th>
                                            <th className="text-left py-1 text-[var(--text-secondary)] font-medium">Dates (MM/DD)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {DAY_ORDER.map((day) => {
                                            const dates = generatedPlan.dayOfWeekBreakdown[day];
                                            if (dates.length === 0) return null;
                                            return (
                                                <tr key={day} className="border-b border-[var(--border-secondary)]/50">
                                                    <td className="py-1.5 text-[var(--text-primary)] font-medium">{day.slice(0, 3)}</td>
                                                    <td className="py-1.5 text-[var(--text-secondary)]">
                                                        {dates.join(", ")}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* CSV Upload */}
                        <div className="space-y-3 pt-3 border-t border-[var(--border-primary)]">
                            <h4 className="text-sm font-medium text-[var(--text-primary)]">
                                Upload {platformName} CSV
                            </h4>

                            <div className="border-2 border-dashed border-[var(--border-primary)] rounded-lg p-4 text-center hover:border-[var(--accent-primary)] transition-colors">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".csv"
                                    onChange={handleFileSelect}
                                    disabled={isProcessing || isApplying}
                                    className="hidden"
                                    id={`csv-upload-${platform}`}
                                />
                                <label
                                    htmlFor={`csv-upload-${platform}`}
                                    className="cursor-pointer flex flex-col items-center gap-2"
                                >
                                    {isProcessing ? (
                                        <Loader2 className="animate-spin text-[var(--accent-primary)]" size={24} />
                                    ) : (
                                        <Upload className="text-[var(--text-muted)]" size={24} />
                                    )}
                                    <span className="text-sm text-[var(--text-secondary)]">
                                        {csvFile ? csvFile.name : `Select ${platformName} CSV`}
                                    </span>
                                    <span className="text-xs text-[var(--text-muted)]">
                                        Columns: date (optional), starterText, imageUrl
                                    </span>
                                </label>
                            </div>

                            {/* Validation Errors */}
                            {validationErrors.length > 0 && (
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                    <div className="flex items-start gap-2">
                                        <AlertCircle className="text-red-600 dark:text-red-400 shrink-0 mt-0.5" size={16} />
                                        <div className="flex-1">
                                            <p className="text-sm font-medium text-red-800 dark:text-red-200 mb-2">
                                                Validation Errors – Upload rejected
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
                            {schedulePreview && (
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium text-[var(--text-primary)]">
                                            Schedule Preview
                                        </h4>
                                        <div className="flex gap-3 text-xs text-[var(--text-muted)]">
                                            <span>{schedulePreview.manualDateCount} manual</span>
                                            <span>{schedulePreview.autoDateCount} auto</span>
                                        </div>
                                    </div>

                                    <div className="bg-[var(--bg-tertiary)] rounded-lg overflow-hidden max-h-48 overflow-y-auto">
                                        <table className="w-full text-xs">
                                            <thead className="sticky top-0 bg-[var(--bg-secondary)]">
                                                <tr className="border-b border-[var(--border-primary)]">
                                                    <th className="px-2 py-2 text-left font-medium text-[var(--text-secondary)]">Date</th>
                                                    <th className="px-2 py-2 text-left font-medium text-[var(--text-secondary)]">Day</th>
                                                    <th className="px-2 py-2 text-left font-medium text-[var(--text-secondary)]">Time</th>
                                                    <th className="px-2 py-2 text-left font-medium text-[var(--text-secondary)]">Manual</th>
                                                    <th className="px-2 py-2 text-left font-medium text-[var(--text-secondary)]">Img</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {schedulePreview.rows.map((row, index) => (
                                                    <tr
                                                        key={row.date}
                                                        className={index % 2 === 0 ? "bg-[var(--bg-card)]" : "bg-[var(--bg-tertiary)]/50"}
                                                    >
                                                        <td className="px-2 py-1.5 text-[var(--text-primary)] font-mono">
                                                            {formatDateShort(row.date)}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-[var(--text-secondary)]">
                                                            {row.dayName.slice(0, 3)}
                                                        </td>
                                                        <td className="px-2 py-1.5 text-[var(--text-primary)] font-mono">
                                                            {formatTimeForDisplay(row.postingTime)}
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            {row.isManualDate ? (
                                                                <span className="text-blue-600 dark:text-blue-400">Yes</span>
                                                            ) : (
                                                                <span className="text-[var(--text-muted)]">–</span>
                                                            )}
                                                        </td>
                                                        <td className="px-2 py-1.5">
                                                            {row.hasImage ? (
                                                                <Check className="text-green-600 dark:text-green-400" size={14} />
                                                            ) : (
                                                                <span className="text-[var(--text-muted)]">–</span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Apply Button */}
                                    <div className="flex items-center justify-between pt-2">
                                        <div className="text-sm text-[var(--text-muted)]">
                                            {isApplying && (
                                                <span>Creating posts... {applyProgress.current}/{applyProgress.total}</span>
                                            )}
                                        </div>
                                        <button
                                            onClick={handleApply}
                                            disabled={isApplying}
                                            className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                                        >
                                            {isApplying ? (
                                                <>
                                                    <Loader2 className="animate-spin" size={16} />
                                                    Applying...
                                                </>
                                            ) : (
                                                <>
                                                    <FileSpreadsheet size={16} />
                                                    Apply Schedule
                                                </>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Empty state when no plan generated */}
                {!generatedPlan && datesValid && (
                    <div className="text-center py-4 text-sm text-[var(--text-muted)]">
                        Click "Generate Plan" to see available posting slots
                    </div>
                )}

                {/* Date range invalid message */}
                {!datesValid && (
                    <div className="text-center py-4 text-sm text-[var(--text-muted)]">
                        Select a valid date range above to generate a plan
                    </div>
                )}
            </div>
        </div>
    );
}
