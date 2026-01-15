"use client";

import { useState, useRef } from "react";
import Papa from "papaparse";
import { db, functions } from "@/lib/firebase";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { FileDown, AlertCircle, Check, X, Image, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { parseCsvDate, formatDisplayDate } from "@/lib/utils";
import { randomTimeInWindow5Min } from "@/lib/postingTime";

// ============================================================================
// Image URL Validation Helpers (Lightweight - no network requests)
// ============================================================================

/**
 * Checks if a string looks like a local file path (not a URL)
 */
function isLocalPathLike(str: string): boolean {
    if (!str) return false;
    const trimmed = str.trim();

    // Starts with relative or absolute path indicators
    if (trimmed.startsWith('/') || trimmed.startsWith('./') || trimmed.startsWith('../')) {
        return true;
    }

    // Contains OS-specific path patterns
    if (trimmed.includes('/Users/') || trimmed.includes('C:\\') || trimmed.includes('\\')) {
        return true;
    }

    // File protocol
    if (trimmed.toLowerCase().startsWith('file://')) {
        return true;
    }

    return false;
}

/**
 * Checks if a string is a valid http/https URL
 */
function isHttpUrl(str: string): boolean {
    try {
        const url = new URL(str);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * Lightweight validation of image URL - no network requests.
 * Server-side Cloud Function handles actual content-type validation.
 */
interface ImageValidationResult {
    valid: boolean;
    reason?: string;
}

function validateImageUrl(imageUrl: string | undefined | null): ImageValidationResult {
    // Empty/missing
    if (!imageUrl || !imageUrl.trim()) {
        return { valid: false, reason: 'Empty or missing URL' };
    }

    const trimmed = imageUrl.trim();

    // Local path
    if (isLocalPathLike(trimmed)) {
        return { valid: false, reason: 'Local file path not supported. Upload manually.' };
    }

    // Not http/https
    if (!isHttpUrl(trimmed)) {
        return { valid: false, reason: 'Invalid URL. Must start with http:// or https://' };
    }

    // Valid URL - server will validate content-type
    return { valid: true };
}

// ============================================================================
// Component Types
// ============================================================================

interface ParsedRow {
    date: string;
    starterText: string;
    imageUrl?: string;
    imageValidation?: ImageValidationResult;
}

interface DuplicateInfo {
    row: ParsedRow;
    existingData: any;
}

type DuplicateAction = "skip" | "overwrite" | "overwrite-empty";

interface ImportImageResponse {
    success: boolean;
    skipped?: boolean;
    assetId?: string;
    downloadUrl?: string;
    error?: string;
    reason?: string;
}

interface ImageImportError {
    date: string;
    imageUrl: string;
    reason: string;
    type: 'skipped' | 'failed';
}

interface DateParseError {
    rowIndex: number;
    rawDate: string;
    reason: string;
}

export default function CSVImport() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const [isImporting, setIsImporting] = useState(false);
    const [importingImages, setImportingImages] = useState(false);
    const [imageProgress, setImageProgress] = useState({ current: 0, total: 0 });
    const [status, setStatus] = useState<{ type: 'success' | 'error' | 'warn', message: string } | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    // Compute if import is allowed
    const canImport = !workspaceLoading && !!workspaceId && !!user;

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
    const countersRef = useRef({
        created: 0,
        overwritten: 0,
        skipped: 0,
        invalidDates: 0,
        imagesImported: 0,
        imagesSkipped: 0,
        imagesFailed: 0
    });

    // Track date parse errors for display
    const dateErrorsRef = useRef<DateParseError[]>([]);
    const [dateErrors, setDateErrors] = useState<DateParseError[]>([]);

    // Track rows that need image import
    const rowsWithImagesRef = useRef<ParsedRow[]>([]);

    // Track image import errors for display
    const imageErrorsRef = useRef<ImageImportError[]>([]);
    const [imageErrors, setImageErrors] = useState<ImageImportError[]>([]);

    const resetState = () => {
        setShowModal(false);
        setDuplicates([]);
        setCurrentDuplicateIndex(0);
        setApplyToAll(false);
        setOverwriteEmptyOnly(false);
        setImportingImages(false);
        setImageProgress({ current: 0, total: 0 });
        setShowDetails(false);
        pendingImportRef.current = null;
        countersRef.current = {
            created: 0,
            overwritten: 0,
            skipped: 0,
            invalidDates: 0,
            imagesImported: 0,
            imagesSkipped: 0,
            imagesFailed: 0
        };
        rowsWithImagesRef.current = [];
        imageErrorsRef.current = [];
        dateErrorsRef.current = [];
        setDateErrors([]);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        // Hard guard: ensure workspace is ready before any Firestore operations
        if (!user || !workspaceId || workspaceLoading) {
            setStatus({
                type: 'error',
                message: workspaceLoading
                    ? "Please wait for workspace to load."
                    : "Workspace not available. Please refresh the page."
            });
            e.target.value = "";
            return;
        }

        setIsImporting(true);
        setStatus(null);
        setShowDetails(false);
        countersRef.current = {
            created: 0,
            overwritten: 0,
            skipped: 0,
            invalidDates: 0,
            imagesImported: 0,
            imagesSkipped: 0,
            imagesFailed: 0
        };
        rowsWithImagesRef.current = [];
        imageErrorsRef.current = [];
        dateErrorsRef.current = [];
        setDateErrors([]);

        // Capture workspaceId at parse time to use in async callback
        const currentWorkspaceId = workspaceId;

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                // Double-check workspaceId is still valid
                if (!currentWorkspaceId) {
                    setStatus({ type: 'error', message: "Workspace not available." });
                    setIsImporting(false);
                    e.target.value = "";
                    return;
                }

                const data = results.data as any[];
                const newRows: ParsedRow[] = [];
                const duplicateRows: DuplicateInfo[] = [];

                // First pass: check all rows for duplicates
                for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
                    const row = data[rowIndex];
                    const rawDate = row.date || row.Date || "";
                    const starterText = row.starterText || row.StarterText || "";
                    const imageUrl = row.imageUrl || row.ImageUrl || row.imageURL || "";

                    // Skip empty date
                    if (!rawDate || !rawDate.trim()) {
                        countersRef.current.skipped++;
                        continue;
                    }

                    // Parse and normalize date (accepts YYYY-MM-DD or MM/DD/YY)
                    const date = parseCsvDate(rawDate);
                    if (!date) {
                        countersRef.current.invalidDates++;
                        dateErrorsRef.current.push({
                            rowIndex: rowIndex + 2, // +2 for 1-indexed + header row
                            rawDate: rawDate.trim(),
                            reason: `Invalid date format. Use YYYY-MM-DD or MM/DD/YY.`
                        });
                        continue;
                    }

                    const parsedRow: ParsedRow = { date, starterText };

                    // Validate image URL if provided
                    if (imageUrl && imageUrl.trim()) {
                        const validation = validateImageUrlForRow(imageUrl.trim());
                        if (validation?.valid) {
                            parsedRow.imageUrl = imageUrl.trim();
                            parsedRow.imageValidation = validation;
                        } else if (validation) {
                            // Invalid URL - track for error display but don't include imageUrl
                            parsedRow.imageValidation = validation;
                            imageErrorsRef.current.push({
                                date,
                                imageUrl: imageUrl.trim(),
                                reason: validation.reason || 'Invalid URL',
                                type: 'skipped'
                            });
                            countersRef.current.imagesSkipped++;
                            console.warn(`Image skipped for ${date}: ${validation.reason}`);
                        }
                    }

                    try {
                        // Use workspace path: workspaces/{workspaceId}/post_days/{date}
                        const docRef = doc(db, "workspaces", currentWorkspaceId, "post_days", date);
                        const docSnap = await getDoc(docRef);

                        if (docSnap.exists()) {
                            duplicateRows.push({
                                row: parsedRow,
                                existingData: docSnap.data()
                            });
                        } else {
                            newRows.push(parsedRow);
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
                    await processImageImports();
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

    /**
     * Quick validation of image URL during CSV parsing.
     * Returns the validation result for tracking, but allows the row to proceed.
     * Full preflight check happens later during processImageImports.
     */
    const validateImageUrlForRow = (imageUrl: string | undefined): ImageValidationResult | undefined => {
        if (!imageUrl || !imageUrl.trim()) {
            return undefined; // No image URL provided
        }
        return validateImageUrl(imageUrl);
    };

    const importNewRows = async (rows: ParsedRow[]) => {
        if (!workspaceId) return;

        for (const row of rows) {
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", row.date);
                // Generate posting time using date as seed for stability
                const postingTime = randomTimeInWindow5Min(row.date, row.date);
                await setDoc(docRef, {
                    date: row.date,
                    starterText: row.starterText,
                    postingTime,
                    postingTimeSource: "auto",
                    status: "input",
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                countersRef.current.created++;

                // Track rows with images for later processing
                if (row.imageUrl) {
                    rowsWithImagesRef.current.push(row);
                }
            } catch (err) {
                console.error("Error importing row:", row, err);
                countersRef.current.skipped++;
            }
        }
    };

    // Helper to determine if an error indicates the URL should be skipped (not a valid image)
    // vs a real failure (network error, server error, etc.)
    const isSkipError = (errorMessage: string): boolean => {
        const skipPatterns = [
            /invalid content.?type/i,
            /not an image/i,
            /text\/html/i,
            /application\/json/i,
            /allowed.*image/i,
            /http 4\d{2}/i,  // 4xx client errors (404, 403, etc.)
            /invalid.*url/i,
            /empty.*0 bytes/i,
        ];
        return skipPatterns.some(pattern => pattern.test(errorMessage));
    };

    // Extract a user-friendly reason from the error message
    const extractErrorReason = (errorMessage: string): string => {
        if (/invalid content.?type.*"([^"]+)"/i.test(errorMessage)) {
            const match = errorMessage.match(/invalid content.?type.*"([^"]+)"/i);
            return `Not an image (${match?.[1] || 'invalid type'})`;
        }
        if (/text\/html/i.test(errorMessage)) {
            return 'URL returned HTML (not an image)';
        }
        if (/http 404/i.test(errorMessage)) {
            return 'Image not found (404)';
        }
        if (/http 403/i.test(errorMessage)) {
            return 'Access denied (403)';
        }
        if (/http 4\d{2}/i.test(errorMessage)) {
            return 'URL not accessible';
        }
        if (/empty.*0 bytes/i.test(errorMessage)) {
            return 'Empty file (0 bytes)';
        }
        if (/failed to fetch/i.test(errorMessage)) {
            return 'Could not fetch URL';
        }
        return errorMessage.length > 50 ? errorMessage.substring(0, 47) + '...' : errorMessage;
    };

    const processImageImports = async () => {
        if (!workspaceId || rowsWithImagesRef.current.length === 0) return;

        setImportingImages(true);
        setImageProgress({ current: 0, total: rowsWithImagesRef.current.length });

        const importImageFromUrl = httpsCallable<
            { workspaceId: string; dateId: string; imageUrl: string },
            ImportImageResponse
        >(functions, "importImageFromUrl");

        for (let i = 0; i < rowsWithImagesRef.current.length; i++) {
            const row = rowsWithImagesRef.current[i];
            setImageProgress({ current: i + 1, total: rowsWithImagesRef.current.length });

            const imageUrl = row.imageUrl!;

            try {
                const result = await importImageFromUrl({
                    workspaceId,
                    dateId: row.date,
                    imageUrl
                });

                if (result.data.success) {
                    countersRef.current.imagesImported++;
                } else if (result.data.skipped) {
                    // Server indicated this should be skipped (not an image, etc.)
                    countersRef.current.imagesSkipped++;
                    const reason = result.data.reason || result.data.error || 'Not an image';
                    imageErrorsRef.current.push({
                        date: row.date,
                        imageUrl,
                        reason,
                        type: 'skipped'
                    });
                    // Only log to console if debugging needed, UI shows details
                } else {
                    // Real failure (network error, server error, etc.)
                    countersRef.current.imagesFailed++;
                    const reason = result.data.reason || result.data.error || 'Import failed';
                    imageErrorsRef.current.push({
                        date: row.date,
                        imageUrl,
                        reason,
                        type: 'failed'
                    });
                    console.error(`Image import failed for ${row.date}:`, reason);
                }
            } catch (err: any) {
                // Exception thrown (e.g., HttpsError from Cloud Function)
                const errorMsg = err?.message || String(err);
                const reason = extractErrorReason(errorMsg);

                // Check if the error message indicates a skip vs failure
                const isSkip = isSkipError(errorMsg);
                if (isSkip) {
                    countersRef.current.imagesSkipped++;
                    imageErrorsRef.current.push({
                        date: row.date,
                        imageUrl,
                        reason,
                        type: 'skipped'
                    });
                } else {
                    countersRef.current.imagesFailed++;
                    imageErrorsRef.current.push({
                        date: row.date,
                        imageUrl,
                        reason,
                        type: 'failed'
                    });
                    console.error(`Image import failed for ${row.date}:`, errorMsg);
                }
            }
        }

        // Copy to state for display
        setImageErrors([...imageErrorsRef.current]);
        setImportingImages(false);
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
            await processImageImports();
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
                await processImageImports();
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
                // Still process image if skipping text but row has imageUrl and no existing image
                if (duplicate.row.imageUrl && !duplicate.existingData.imageAssetId) {
                    rowsWithImagesRef.current.push(duplicate.row);
                }
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

                // Track for image import
                if (duplicate.row.imageUrl) {
                    rowsWithImagesRef.current.push(duplicate.row);
                }
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

                // Track for image import if no existing image
                if (duplicate.row.imageUrl && !duplicate.existingData.imageAssetId) {
                    rowsWithImagesRef.current.push(duplicate.row);
                }
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
        const { created, overwritten, skipped, invalidDates, imagesImported, imagesSkipped, imagesFailed } = countersRef.current;

        const parts: string[] = [];
        if (created > 0) parts.push(`${created} created`);
        if (overwritten > 0) parts.push(`${overwritten} overwritten`);
        if (skipped > 0) parts.push(`${skipped} skipped`);
        if (invalidDates > 0) parts.push(`${invalidDates} invalid date${invalidDates !== 1 ? 's' : ''}`);

        // Image summary
        if (imagesImported > 0) parts.push(`${imagesImported} images imported`);
        if (imagesSkipped > 0) parts.push(`${imagesSkipped} images skipped`);
        if (imagesFailed > 0) parts.push(`${imagesFailed} images failed`);

        // Determine status type
        let statusType: 'success' | 'warn' | 'error' = 'success';
        if (imagesFailed > 0 && imagesImported === 0 && created === 0 && overwritten === 0) {
            statusType = 'error';
        } else if (imagesSkipped > 0 || imagesFailed > 0 || invalidDates > 0) {
            statusType = 'warn';
        }

        // Copy errors to state before partial reset
        const errors = [...imageErrorsRef.current];
        setImageErrors(errors);
        const dateErrs = [...dateErrorsRef.current];
        setDateErrors(dateErrs);

        setStatus({
            type: statusType,
            message: parts.length > 0 ? parts.join(", ") + "." : "No rows imported."
        });

        if (inputElement) {
            inputElement.value = "";
        }

        // Partial reset - keep status and errors visible
        setShowModal(false);
        setDuplicates([]);
        setCurrentDuplicateIndex(0);
        setApplyToAll(false);
        setOverwriteEmptyOnly(false);
        setImportingImages(false);
        setImageProgress({ current: 0, total: 0 });
        pendingImportRef.current = null;
        rowsWithImagesRef.current = [];
        setIsImporting(false);
    };

    const currentDuplicate = duplicates[currentDuplicateIndex];

    return (
        <div className="relative">
            <label className="inline-flex items-center gap-2 bg-[var(--bg-card)] border border-[var(--border-primary)] hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer">
                {isImporting || importingImages ? (
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)]" />
                ) : (
                    <FileDown size={16} />
                )}
                {importingImages ? (
                    <span>
                        Importing ({imageProgress.current}/{imageProgress.total})
                    </span>
                ) : (
                    "Import CSV"
                )}
                <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    disabled={!canImport || isImporting || showModal || importingImages}
                    className="hidden"
                />
            </label>

            {/* Status Toast */}
            {status && (
                <div className={`absolute top-full mt-2 right-0 w-80 p-3 rounded-lg shadow-lg border z-20 ${
                    status.type === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800 text-green-700 dark:text-green-300'
                        : status.type === 'warn'
                        ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-100 dark:border-yellow-800 text-yellow-700 dark:text-yellow-300'
                        : 'bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800 text-red-700 dark:text-red-300'
                }`}>
                    <div className="flex gap-2">
                        {status.type === 'success' ? (
                            <Check size={16} className="shrink-0" />
                        ) : (
                            <AlertCircle size={16} className="shrink-0" />
                        )}
                        <p className="text-xs font-medium">{status.message}</p>
                    </div>

                    {/* Expandable error details */}
                    {(imageErrors.length > 0 || dateErrors.length > 0) && (
                        <div className="mt-2">
                            <button
                                onClick={() => setShowDetails(!showDetails)}
                                className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider opacity-70 hover:opacity-100"
                            >
                                {showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                {showDetails ? 'Hide' : 'Show'} details ({imageErrors.length + dateErrors.length})
                            </button>

                            {showDetails && (
                                <div className="mt-2 max-h-40 overflow-y-auto space-y-1.5 text-[10px]">
                                    {/* Date parse errors */}
                                    {dateErrors.map((error, idx) => (
                                        <div
                                            key={`date-${idx}`}
                                            className="p-1.5 rounded bg-red-100/50"
                                        >
                                            <div className="flex items-center gap-1 font-medium">
                                                <AlertCircle size={10} className="text-red-600 shrink-0" />
                                                Row {error.rowIndex}
                                            </div>
                                            <div className="opacity-70 pl-3.5">
                                                {error.reason}
                                            </div>
                                            <div className="opacity-50 pl-3.5 truncate text-[9px]">
                                                Value: &quot;{error.rawDate}&quot;
                                            </div>
                                        </div>
                                    ))}
                                    {/* Image errors */}
                                    {imageErrors.map((error, idx) => (
                                        <div
                                            key={`img-${idx}`}
                                            className={`p-1.5 rounded ${
                                                error.type === 'skipped'
                                                    ? 'bg-yellow-100/50'
                                                    : 'bg-red-100/50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-1 font-medium">
                                                {error.type === 'skipped' ? (
                                                    <AlertTriangle size={10} className="text-yellow-600 shrink-0" />
                                                ) : (
                                                    <AlertCircle size={10} className="text-red-600 shrink-0" />
                                                )}
                                                {formatDisplayDate(error.date)}
                                            </div>
                                            <div className="opacity-70 pl-3.5" title={error.imageUrl}>
                                                {error.reason}
                                            </div>
                                            <div className="opacity-50 pl-3.5 truncate text-[9px]" title={error.imageUrl}>
                                                {error.imageUrl.length > 40 ? error.imageUrl.substring(0, 37) + '...' : error.imageUrl}
                                            </div>
                                        </div>
                                    ))}
                                    {dateErrors.length > 0 && (
                                        <div className="pt-2 border-t border-current/10 opacity-60">
                                            <strong>Tip:</strong> Dates must be YYYY-MM-DD or MM/DD/YY format.
                                        </div>
                                    )}
                                    {imageErrors.some(e => e.type === 'skipped') && (
                                        <div className="pt-2 border-t border-current/10 opacity-60">
                                            <strong>Tip:</strong> Use direct https image URLs or upload files manually.
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    <button
                        onClick={() => {
                            setStatus(null);
                            setImageErrors([]);
                            setDateErrors([]);
                            setShowDetails(false);
                        }}
                        className="mt-2 text-[10px] underline uppercase tracking-wider font-bold opacity-70"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Duplicate Confirmation Modal */}
            {showModal && currentDuplicate && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-[var(--bg-card)] rounded-xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
                        {/* Header */}
                        <div className="bg-[var(--bg-secondary)] px-6 py-4 border-b border-[var(--border-primary)] flex items-center justify-between">
                            <h3 className="font-semibold text-[var(--text-primary)]">
                                Duplicate Found ({currentDuplicateIndex + 1} of {duplicates.length})
                            </h3>
                            <button
                                onClick={handleCancel}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="px-6 py-4 space-y-4">
                            <p className="text-sm text-[var(--text-secondary)]">
                                A post for <span className="font-bold text-[var(--text-primary)]">{formatDisplayDate(currentDuplicate.row.date)}</span> already exists.
                            </p>

                            {/* Comparison */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                <div className="bg-[var(--bg-tertiary)] rounded-lg p-3">
                                    <p className="font-bold text-[var(--text-tertiary)] uppercase tracking-wider mb-1">Existing</p>
                                    <p className="text-[var(--text-secondary)] line-clamp-3">
                                        {currentDuplicate.existingData.starterText || <span className="italic text-[var(--text-muted)]">(empty)</span>}
                                    </p>
                                    {currentDuplicate.existingData.imageAssetId && (
                                        <p className="text-[var(--accent-primary)] text-[10px] mt-1 flex items-center gap-1">
                                            <Image size={10} /> Has image
                                        </p>
                                    )}
                                </div>
                                <div className="bg-[var(--accent-bg)] rounded-lg p-3">
                                    <p className="font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-1">New (CSV)</p>
                                    <p className="text-[var(--text-secondary)] line-clamp-3">
                                        {currentDuplicate.row.starterText || <span className="italic text-[var(--text-muted)]">(empty)</span>}
                                    </p>
                                    {currentDuplicate.row.imageUrl && (
                                        <p className="text-[var(--accent-primary)] text-[10px] mt-1 flex items-center gap-1">
                                            <Image size={10} /> Has imageUrl
                                        </p>
                                    )}
                                </div>
                            </div>

                            {/* Options */}
                            <div className="space-y-2 pt-2">
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={applyToAll}
                                        onChange={(e) => setApplyToAll(e.target.checked)}
                                        className="rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] bg-[var(--input-bg)]"
                                    />
                                    <span className="text-[var(--text-secondary)]">Apply to all duplicates</span>
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={overwriteEmptyOnly}
                                        onChange={(e) => setOverwriteEmptyOnly(e.target.checked)}
                                        className="rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] bg-[var(--input-bg)]"
                                    />
                                    <span className="text-[var(--text-secondary)]">Overwrite empty fields only</span>
                                </label>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="px-6 py-4 bg-[var(--bg-secondary)] border-t border-[var(--border-primary)] flex justify-end gap-2">
                            <button
                                onClick={handleCancel}
                                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDuplicateAction("skip")}
                                className="px-4 py-2 text-sm font-medium bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] text-[var(--text-secondary)] rounded-lg transition-colors"
                            >
                                Skip
                            </button>
                            <button
                                onClick={() => handleDuplicateAction(overwriteEmptyOnly ? "overwrite-empty" : "overwrite")}
                                className="px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] text-white rounded-lg transition-colors"
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
