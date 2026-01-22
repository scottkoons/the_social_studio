"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, onSnapshot, documentId, doc, getDoc, deleteDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { ChevronLeft, ChevronRight, Download, Loader2, Trash2 } from "lucide-react";
import { format, startOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from "date-fns";
import { PostDay, getPostDocId } from "@/lib/types";
import { getTodayInDenver, formatDisplayDate } from "@/lib/utils";
import { formatTimeForDisplay, randomTimeInWindow5Min } from "@/lib/postingTime";
import { movePostDay } from "@/lib/postDayMove";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import Image from "next/image";
import CalendarEditModal from "@/components/CalendarEditModal";
import CalendarPdfPrintRoot from "@/components/CalendarPdfPrintRoot";
import { PdfExportProgress, getPhaseText } from "@/lib/calendarPdfExport";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DAYS_OF_WEEK_SHORT = ["S", "M", "T", "W", "T", "F", "S"];

// Drag and drop data type
interface DragData {
    sourceDocId: string;
    post: PostDay;
}

export default function CalendarPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const router = useRouter();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [posts, setPosts] = useState<Map<string, PostDay>>(new Map()); // Keyed by docId
    const [loading, setLoading] = useState(true);

    // Drag and drop state
    const [draggedPost, setDraggedPost] = useState<DragData | null>(null);
    const [dropTarget, setDropTarget] = useState<string | null>(null);

    // Overwrite confirmation modal state
    const [showOverwriteModal, setShowOverwriteModal] = useState(false);
    const [pendingDrop, setPendingDrop] = useState<{ source: DragData; targetDate: string } | null>(null);
    const [isMoving, setIsMoving] = useState(false);

    // Edit modal state
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editingPost, setEditingPost] = useState<PostDay | null>(null);
    const [editingPostImageUrl, setEditingPostImageUrl] = useState<string | null>(null);

    // Date conflict from edit modal (for overwrite confirmation)
    const [editDateConflict, setEditDateConflict] = useState<{ sourceDate: string; targetDate: string } | null>(null);

    // Global setting for hiding past unsent posts
    const { settings } = useWorkspaceUiSettings();
    const hidePastUnsent = settings.hidePastUnsent;

    // Calendar PDF export state
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [pdfProgress, setPdfProgress] = useState<PdfExportProgress | null>(null);
    const [pdfIncludeImages, setPdfIncludeImages] = useState(true);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [pdfWarning, setPdfWarning] = useState<string | null>(null);

    // Selection and bulk delete state
    const [selectedPostIds, setSelectedPostIds] = useState<Set<string>>(new Set());
    const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);


    // Calculate the 6-week grid bounds
    const monthStart = startOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
    const gridEnd = endOfWeek(addDays(monthStart, 41), { weekStartsOn: 0 }); // 6 weeks

    const gridStartStr = format(gridStart, "yyyy-MM-dd");
    const gridEndStr = format(gridEnd, "yyyy-MM-dd");

    // Load posts for the visible date range
    useEffect(() => {
        if (!user || !workspaceId) return;

        // Query using documentId bounds
        // Doc IDs can be "YYYY-MM-DD" (legacy) or "YYYY-MM-DD-platform" (new)
        // Use "~" suffix on upper bound to include platform-suffixed docs
        const q = query(
            collection(db, "workspaces", workspaceId, "post_days"),
            where(documentId(), ">=", gridStartStr),
            where(documentId(), "<=", gridEndStr + "~")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsMap = new Map<string, PostDay>();
            snapshot.docs.forEach((docSnap) => {
                const data = docSnap.data() as PostDay;
                // Store by docId for unique identification
                const docId = docSnap.id;
                postsMap.set(docId, { ...data, docId });
            });
            setPosts(postsMap);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, workspaceId, gridStartStr, gridEndStr]);

    // Helper to get posts for a specific date
    const getPostsForDate = useCallback((dateStr: string): PostDay[] => {
        const result: PostDay[] = [];
        posts.forEach((post) => {
            if (post.date === dateStr) {
                result.push(post);
            }
        });
        return result;
    }, [posts]);

    const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const goToToday = () => setCurrentMonth(new Date());

    // Move post from one date to another using shared helper
    const movePost = useCallback(async (sourceDocId: string, targetDate: string, overwrite: boolean = false) => {
        if (!workspaceId) return;

        const sourcePost = posts.get(sourceDocId);
        if (!sourcePost) return;

        // If same date, no-op
        if (sourcePost.date === targetDate) return;

        setIsMoving(true);
        const result = await movePostDay(workspaceId, sourceDocId, targetDate, {
            overwrite
        });

        if (result.needsConfirmOverwrite) {
            // Show confirmation modal
            setPendingDrop({ source: { sourceDocId, post: sourcePost }, targetDate });
            setShowOverwriteModal(true);
            setIsMoving(false);
            return;
        }

        if (!result.ok) {
            console.error("Move post error:", result.error);
        }

        setIsMoving(false);
        setDraggedPost(null);
        setDropTarget(null);
    }, [workspaceId, posts]);

    // Handle overwrite confirmation (for both drag-drop and edit modal)
    const handleOverwriteConfirm = async () => {
        if (editDateConflict) {
            await handleEditOverwriteConfirm();
            return;
        }
        if (!pendingDrop) return;
        setShowOverwriteModal(false);
        await movePost(pendingDrop.source.sourceDocId, pendingDrop.targetDate, true);
        setPendingDrop(null);
    };

    const handleOverwriteCancel = () => {
        setShowOverwriteModal(false);
        setPendingDrop(null);
        setEditDateConflict(null);
        setDraggedPost(null);
        setDropTarget(null);
    };

    // Drag handlers
    const handleDragStart = useCallback((docId: string, post: PostDay) => {
        setDraggedPost({ sourceDocId: docId, post });
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedPost(null);
        setDropTarget(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
        e.preventDefault();
        if (draggedPost && dateStr !== draggedPost.post.date) {
            setDropTarget(dateStr);
        }
    }, [draggedPost]);

    const handleDragLeave = useCallback(() => {
        setDropTarget(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetDate: string) => {
        e.preventDefault();
        if (draggedPost && targetDate !== draggedPost.post.date) {
            movePost(draggedPost.sourceDocId, targetDate);
        }
        setDropTarget(null);
    }, [draggedPost, movePost]);

    // Click handlers
    const handlePostClick = useCallback(async (dateStr: string, post: PostDay) => {
        // Fetch image URL if post has an image
        let imgUrl: string | null = null;
        if (post.imageAssetId) {
            try {
                const assetRef = doc(db, "workspaces", workspaceId!, "assets", post.imageAssetId);
                const assetSnap = await getDoc(assetRef);
                if (assetSnap.exists()) {
                    const asset = assetSnap.data();
                    imgUrl = await getDownloadURL(ref(storage, asset.storagePath));
                }
            } catch (err) {
                console.error("Error fetching image URL:", err);
            }
        }

        setEditingPost(post);
        setEditingPostImageUrl(imgUrl);
        setEditModalOpen(true);
    }, [workspaceId]);

    const handleEmptyDayClick = useCallback((dateStr: string) => {
        // Navigate to input page for creating new posts
        router.push(`/input?date=${dateStr}`);
    }, [router]);

    const handleDayClick = (dateStr: string, post?: PostDay) => {
        if (post) {
            handlePostClick(dateStr, post);
        } else {
            handleEmptyDayClick(dateStr);
        }
    };

    // Handle date conflict from edit modal
    const handleEditDateConflict = useCallback((sourceDate: string, targetDate: string) => {
        setEditDateConflict({ sourceDate, targetDate });
        setShowOverwriteModal(true);
    }, []);

    // Handle overwrite from edit modal conflict
    const handleEditOverwriteConfirm = async () => {
        if (!editDateConflict || !workspaceId) return;

        setIsMoving(true);
        const result = await movePostDay(
            workspaceId,
            editDateConflict.sourceDate,
            editDateConflict.targetDate,
            { overwrite: true }
        );

        if (!result.ok) {
            console.error("Overwrite error:", result.error);
        } else {
            setEditModalOpen(false);
            setEditingPost(null);
        }

        setIsMoving(false);
        setShowOverwriteModal(false);
        setEditDateConflict(null);
    };

    const handleCloseEditModal = useCallback(() => {
        setEditModalOpen(false);
        setEditingPost(null);
        setEditingPostImageUrl(null);
    }, []);

    // PDF export handlers
    const handleExportPdf = useCallback(() => {
        setPdfError(null);
        setPdfWarning(null);
        setIsExportingPdf(true);
        setPdfProgress(null);
    }, []);

    const handlePdfComplete = useCallback((warning?: string) => {
        setIsExportingPdf(false);
        setPdfProgress(null);
        setPdfError(null);
        setPdfWarning(warning || null);
    }, []);

    const handlePdfError = useCallback((error: string, stack?: string) => {
        // Log full error details to console
        console.error("[PDF] Export failed:", error);
        if (stack) {
            console.error("[PDF] Stack trace:", stack);
        }

        setIsExportingPdf(false);
        setPdfProgress(null);
        setPdfError(error);
    }, []);

    const handlePdfProgress = useCallback((progress: PdfExportProgress) => {
        // Only update if the phase or current page actually changed
        // This prevents infinite re-render loops
        setPdfProgress((prev) => {
            if (!prev) return progress;
            if (prev.phase === progress.phase &&
                prev.current === progress.current &&
                prev.total === progress.total) {
                return prev; // No change, return same reference
            }
            return progress;
        });
    }, []);

    // Selection handlers
    const handleSelectPost = useCallback((docId: string, selected: boolean) => {
        setSelectedPostIds(prev => {
            const next = new Set(prev);
            if (selected) {
                next.add(docId);
            } else {
                next.delete(docId);
            }
            return next;
        });
    }, []);

    const handleClearSelection = useCallback(() => {
        setSelectedPostIds(new Set());
    }, []);

    // Bulk delete handler
    const handleBulkDelete = useCallback(async () => {
        if (!workspaceId || selectedPostIds.size === 0) return;

        setIsBulkDeleting(true);
        let deleted = 0;
        let failed = 0;

        for (const docId of selectedPostIds) {
            try {
                const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);
                await deleteDoc(docRef);
                deleted++;
            } catch (err) {
                console.error(`Delete error for ${docId}:`, err);
                failed++;
            }
        }

        setSelectedPostIds(new Set());
        setShowBulkDeleteModal(false);
        setIsBulkDeleting(false);
    }, [workspaceId, selectedPostIds]);

    // Generate the grid of days (6 weeks)
    const generateCalendarDays = () => {
        const days: Date[] = [];
        let day = gridStart;
        while (day <= gridEnd) {
            days.push(day);
            day = addDays(day, 1);
        }
        return days;
    };

    const calendarDays = generateCalendarDays();
    const todayStr = getTodayInDenver();

    // Show loading while workspace is being resolved
    if (workspaceLoading || !workspaceId) {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                <DashboardCard>
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Setting up your workspace...</p>
                    </div>
                </DashboardCard>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <PageHeader
                title="Content Calendar"
                subtitle="Visualize your scheduled content on a calendar."
            />

            <DashboardCard noPadding>
                {/* Month navigation */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-3 md:px-4 py-3 border-b border-[var(--border-primary)]">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToPreviousMonth}
                            className="p-2 md:p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                            aria-label="Previous month"
                        >
                            <ChevronLeft size={20} className="text-[var(--text-secondary)]" />
                        </button>
                        <button
                            onClick={goToNextMonth}
                            className="p-2 md:p-1.5 rounded-lg hover:bg-[var(--bg-tertiary)] transition-colors"
                            aria-label="Next month"
                        >
                            <ChevronRight size={20} className="text-[var(--text-secondary)]" />
                        </button>
                        <h2 className="text-base md:text-lg font-semibold text-[var(--text-primary)] ml-2">
                            {format(currentMonth, "MMMM yyyy")}
                        </h2>
                        <button
                            onClick={goToToday}
                            className="ml-auto sm:ml-0 px-2 md:px-3 py-1 md:py-1.5 text-xs md:text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-lg transition-colors"
                        >
                            Today
                        </button>
                    </div>
                    <div className="flex items-center gap-2 md:gap-3 flex-wrap">
                        {/* Bulk Delete Button */}
                        {selectedPostIds.size > 0 && (
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowBulkDeleteModal(true)}
                                    className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                                >
                                    <Trash2 size={14} />
                                    Delete ({selectedPostIds.size})
                                </button>
                                <button
                                    onClick={handleClearSelection}
                                    className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        {/* PDF Export Controls */}
                        <div className="flex items-center gap-2">
                            <label className="hidden md:flex items-center gap-1.5 text-xs text-[var(--text-secondary)] cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={pdfIncludeImages}
                                    onChange={(e) => setPdfIncludeImages(e.target.checked)}
                                    disabled={isExportingPdf}
                                    className="h-4 w-4 md:h-3.5 md:w-3.5 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] disabled:opacity-50 bg-[var(--input-bg)]"
                                />
                                Include images
                            </label>
                            <button
                                onClick={handleExportPdf}
                                disabled={isExportingPdf || posts.size === 0}
                                className="flex items-center gap-1.5 px-2 md:px-3 py-1.5 text-xs md:text-sm font-medium text-white bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                title="Export Calendar as PDF"
                            >
                                {isExportingPdf ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span className="hidden sm:inline max-w-[180px] truncate">
                                            {pdfProgress
                                                ? getPhaseText(pdfProgress)
                                                : "Preparing..."}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={14} />
                                        <span className="hidden sm:inline">Calendar PDF</span>
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* PDF Error Display */}
                {pdfError && (
                    <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-start gap-2">
                            <span className="text-red-600 dark:text-red-400 text-sm font-medium">PDF Export Failed:</span>
                            <span className="text-red-700 dark:text-red-300 text-sm flex-1">{pdfError}</span>
                            <button
                                onClick={() => setPdfError(null)}
                                className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 text-sm"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {/* PDF Warning Display (e.g., images failed due to CORS) */}
                {pdfWarning && !pdfError && (
                    <div className="mx-4 mt-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                        <div className="flex items-start gap-2">
                            <span className="text-amber-600 dark:text-amber-400 text-sm font-medium">PDF Exported with Warning:</span>
                            <span className="text-amber-700 dark:text-amber-300 text-sm flex-1">{pdfWarning}</span>
                            <button
                                onClick={() => setPdfWarning(null)}
                                className="text-amber-500 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 text-sm"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Loading calendar...</p>
                    </div>
                ) : (
                    <>
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-[var(--border-primary)]">
                            {DAYS_OF_WEEK.map((day, idx) => (
                                <div
                                    key={day}
                                    className="py-2 text-center text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider"
                                >
                                    <span className="hidden sm:inline">{day}</span>
                                    <span className="sm:hidden">{DAYS_OF_WEEK_SHORT[idx]}</span>
                                </div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day) => {
                                const dateStr = format(day, "yyyy-MM-dd");
                                const postsForDate = getPostsForDate(dateStr);
                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                const isToday = dateStr === todayStr;
                                const isPast = dateStr < todayStr;

                                // Filter out past unsent posts if setting is enabled
                                const visiblePosts = hidePastUnsent
                                    ? postsForDate.filter(p => !isPast || p.status === "sent")
                                    : postsForDate;

                                return (
                                    <DayCell
                                        key={dateStr}
                                        dateStr={dateStr}
                                        day={day}
                                        posts={visiblePosts}
                                        isCurrentMonth={isCurrentMonth}
                                        isToday={isToday}
                                        isPast={isPast}
                                        onClick={(post?: PostDay) => handleDayClick(dateStr, post)}
                                        workspaceId={workspaceId}
                                        isDragging={draggedPost?.post.date === dateStr}
                                        isDropTarget={dropTarget === dateStr}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
                                        selectedPostIds={selectedPostIds}
                                        onSelectPost={handleSelectPost}
                                    />
                                );
                            })}
                        </div>
                    </>
                )}
            </DashboardCard>

            {/* Edit Modal */}
            {editingPost && (
                <CalendarEditModal
                    isOpen={editModalOpen}
                    post={editingPost}
                    workspaceId={workspaceId}
                    imageUrl={editingPostImageUrl}
                    onClose={handleCloseEditModal}
                    onDateConflict={handleEditDateConflict}
                />
            )}

            {/* Overwrite Confirmation Modal */}
            <ConfirmModal
                open={showOverwriteModal && !!(pendingDrop || editDateConflict)}
                title="Date already has a post"
                description={`A post already exists on ${formatDisplayDate(pendingDrop?.targetDate || editDateConflict?.targetDate || "")}. Do you want to overwrite it? This will replace the existing post with the one you're moving.`}
                confirmText={isMoving ? "Moving..." : "Overwrite"}
                cancelText="Cancel"
                onConfirm={handleOverwriteConfirm}
                onCancel={handleOverwriteCancel}
            />

            {/* Calendar PDF Export - Offscreen Render */}
            {isExportingPdf && (
                <CalendarPdfPrintRoot
                    posts={Array.from(posts.values())}
                    workspaceId={workspaceId}
                    includeImages={pdfIncludeImages}
                    onComplete={handlePdfComplete}
                    onError={handlePdfError}
                    onProgress={handlePdfProgress}
                />
            )}

            {/* Bulk Delete Confirmation Modal */}
            <ConfirmModal
                open={showBulkDeleteModal}
                title="Delete Selected Posts?"
                description={`Are you sure you want to delete ${selectedPostIds.size} post${selectedPostIds.size !== 1 ? 's' : ''}? This action cannot be undone.`}
                confirmText={isBulkDeleting ? "Deleting..." : "Delete"}
                cancelText="Cancel"
                onConfirm={handleBulkDelete}
                onCancel={() => setShowBulkDeleteModal(false)}
                confirmVariant="danger"
            />

        </div>
    );
}

interface DayCellProps {
    dateStr: string;
    day: Date;
    posts: PostDay[];
    isCurrentMonth: boolean;
    isToday: boolean;
    isPast: boolean;
    onClick: (post?: PostDay) => void;
    workspaceId: string;
    isDragging: boolean;
    isDropTarget: boolean;
    onDragStart: (docId: string, post: PostDay) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent, dateStr: string) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, dateStr: string) => void;
    selectedPostIds: Set<string>;
    onSelectPost: (docId: string, selected: boolean) => void;
}

function DayCell({
    dateStr,
    day,
    posts,
    isCurrentMonth,
    isToday,
    isPast,
    onClick,
    workspaceId,
    isDragging,
    isDropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    selectedPostIds,
    onSelectPost,
}: DayCellProps) {
    const hasPosts = posts.length > 0;
    const firstPost = posts[0];
    const docId = firstPost ? getPostDocId(firstPost) : null;
    const isSelected = docId ? selectedPostIds.has(docId) : false;

    // Check if any post would be skipped (past date or missing image)
    const hasSkippedPost = posts.some(p => {
        const isMissingImage = !p.imageAssetId;
        const isPastDate = isPast;
        return (isPastDate || isMissingImage) && p.status !== 'sent' && p.status !== 'error';
    });

    const handleDragStart = (e: React.DragEvent, post: PostDay) => {
        const docId = getPostDocId(post);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', docId);
        onDragStart(docId, post);
    };

    return (
        <div
            draggable={hasPosts}
            onDragStart={(e) => firstPost && handleDragStart(e, firstPost)}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, dateStr)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, dateStr)}
            onClick={() => onClick(firstPost)}
            className={`
                relative min-h-[80px] md:min-h-[100px] p-1.5 border-b border-r border-[var(--border-secondary)]
                text-left transition-all cursor-pointer group
                ${isSelected ? 'ring-2 ring-[var(--accent-primary)] ring-inset bg-[var(--accent-bg)]' : ''}
                ${isCurrentMonth ? 'bg-[var(--bg-card)]' : 'bg-[var(--bg-tertiary)]/50'}
                ${hasSkippedPost ? 'bg-yellow-50/30 dark:bg-yellow-900/10' : ''}
                ${!isPast && isCurrentMonth ? 'hover:bg-[var(--bg-tertiary)]' : ''}
                ${isPast && isCurrentMonth ? 'hover:bg-[var(--bg-tertiary)]/50' : ''}
                ${isDragging ? 'opacity-50 ring-2 ring-[var(--accent-primary)] ring-inset' : ''}
                ${isDropTarget ? 'bg-[var(--accent-bg)] ring-2 ring-[var(--accent-primary)] ring-inset' : ''}
                ${hasPosts ? 'cursor-grab active:cursor-grabbing' : ''}
            `}
        >
            {/* Day number */}
            <div className="flex items-center justify-between mb-1">
                <span className={`
                    inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full
                    ${isToday ? 'bg-[var(--accent-primary)] text-white' : ''}
                    ${!isToday && isCurrentMonth ? 'text-[var(--text-primary)]' : ''}
                    ${!isToday && !isCurrentMonth ? 'text-[var(--text-muted)]' : ''}
                    ${isPast && isCurrentMonth && !isToday ? 'text-[var(--text-tertiary)]' : ''}
                `}>
                    {format(day, "d")}
                </span>
                {/* Checkbox for selection */}
                {hasPosts && docId && (
                    <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                            e.stopPropagation();
                            onSelectPost(docId, e.target.checked);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] focus:ring-offset-0 cursor-pointer bg-[var(--input-bg)] opacity-0 group-hover:opacity-100 checked:opacity-100 transition-opacity"
                    />
                )}
            </div>

            {/* Post content - show first post's thumbnail and status */}
            {firstPost && (
                <div className={`${hasSkippedPost ? 'opacity-60' : ''}`}>
                    {/* Thumbnail */}
                    {firstPost.imageAssetId && (
                        <div className="relative w-full h-10 md:h-14 mb-1 rounded overflow-hidden bg-[var(--bg-tertiary)]">
                            <AssetThumbnail
                                assetId={firstPost.imageAssetId}
                                workspaceId={workspaceId}
                            />
                        </div>
                    )}

                    {/* Status indicator and time */}
                    <div className="flex items-center justify-between gap-1">
                        <StatusDot
                            status={firstPost.status}
                            wouldBeSkipped={(isPast || !firstPost.imageAssetId) && firstPost.status !== 'sent'}
                        />
                        <span className="text-[9px] text-[var(--text-muted)]">
                            {formatTimeForDisplay(firstPost.postingTime || randomTimeInWindow5Min(dateStr, dateStr))}
                        </span>
                    </div>

                    {/* Multiple posts indicator */}
                    {posts.length > 1 && (
                        <div className="mt-1 text-[8px] text-[var(--text-tertiary)] text-center">
                            +{posts.length - 1} more
                        </div>
                    )}
                </div>
            )}

            {/* Drop target indicator */}
            {isDropTarget && (
                <div className="absolute inset-0 flex items-center justify-center bg-[var(--accent-primary)]/10 pointer-events-none">
                    <span className="text-xs font-medium text-[var(--accent-primary)] bg-[var(--bg-card)]/90 px-2 py-1 rounded shadow">
                        Drop here
                    </span>
                </div>
            )}
        </div>
    );
}

function StatusDot({ status, wouldBeSkipped }: { status: PostDay['status']; wouldBeSkipped: boolean }) {
    const statusColors: Record<PostDay['status'], { bg: string; text: string; label: string }> = {
        input: { bg: 'bg-gray-200 dark:bg-gray-700', text: 'text-gray-600 dark:text-gray-300', label: 'Input' },
        generated: { bg: 'bg-amber-200 dark:bg-amber-900/50', text: 'text-amber-700 dark:text-amber-400', label: 'Generated' },
        edited: { bg: 'bg-blue-200 dark:bg-blue-900/50', text: 'text-blue-700 dark:text-blue-400', label: 'Edited' },
        sent: { bg: 'bg-green-200 dark:bg-green-900/50', text: 'text-green-700 dark:text-green-400', label: 'Sent' },
        error: { bg: 'bg-red-200 dark:bg-red-900/50', text: 'text-red-700 dark:text-red-400', label: 'Error' },
    };

    // UI-only override: show "Not Sent" yellow pill for skipped posts
    const notSentStyle = { bg: 'bg-yellow-200 dark:bg-yellow-900/50', text: 'text-yellow-700 dark:text-yellow-400', label: 'Not Sent' };

    // Status priority:
    // 1. 'sent' always shows green Sent
    // 2. 'error' always shows red Error
    // 3. If wouldBeSkipped, show yellow Not Sent
    // 4. Otherwise, show the stored status
    let config;
    if (status === 'sent') {
        config = statusColors.sent;
    } else if (status === 'error') {
        config = statusColors.error;
    } else if (wouldBeSkipped) {
        config = notSentStyle;
    } else {
        config = statusColors[status] || statusColors.input;
    }

    return (
        <span className={`
            inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium
            ${config.bg} ${config.text}
        `}>
            {config.label}
        </span>
    );
}

function AssetThumbnail({ assetId, workspaceId }: { assetId: string; workspaceId: string }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        const fetchAsset = async () => {
            try {
                const assetRef = doc(db, "workspaces", workspaceId, "assets", assetId);
                const assetSnap = await getDoc(assetRef);
                if (assetSnap.exists()) {
                    const asset = assetSnap.data();
                    const downloadUrl = await getDownloadURL(ref(storage, asset.storagePath));
                    setUrl(downloadUrl);
                }
            } catch (err) {
                console.error("Thumbnail load error:", err);
            }
        };
        fetchAsset();
    }, [assetId, workspaceId]);

    if (!url) return null;

    return (
        <Image
            src={url}
            alt="Post thumbnail"
            fill
            className="object-contain"
            sizes="(max-width: 768px) 50px, 80px"
        />
    );
}
