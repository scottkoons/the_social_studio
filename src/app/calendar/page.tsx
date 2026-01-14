"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, onSnapshot, documentId, doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import ConfirmModal from "@/components/ui/ConfirmModal";
import { ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import { format, startOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from "date-fns";
import { PostDay } from "@/lib/types";
import { getTodayInDenver, formatDisplayDate } from "@/lib/utils";
import { formatTimeForDisplay, randomTimeInWindow5Min } from "@/lib/postingTime";
import { movePostDay } from "@/lib/postDayMove";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import Image from "next/image";
import CalendarEditModal from "@/components/CalendarEditModal";
import CalendarPdfPrintRoot from "@/components/CalendarPdfPrintRoot";
import { PdfExportProgress, getPhaseText } from "@/lib/calendarPdfExport";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// Drag and drop data type
interface DragData {
    sourceDate: string;
    post: PostDay;
}

export default function CalendarPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const router = useRouter();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [posts, setPosts] = useState<Map<string, PostDay>>(new Map());
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

    // PDF export state
    const [isExportingPdf, setIsExportingPdf] = useState(false);
    const [pdfProgress, setPdfProgress] = useState<PdfExportProgress | null>(null);
    const [pdfIncludeImages, setPdfIncludeImages] = useState(true);
    const [pdfError, setPdfError] = useState<string | null>(null);
    const [pdfWarning, setPdfWarning] = useState<string | null>(null);

    // Calculate the 6-week grid bounds
    const monthStart = startOfMonth(currentMonth);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
    const gridEnd = endOfWeek(addDays(monthStart, 41), { weekStartsOn: 0 }); // 6 weeks

    const gridStartStr = format(gridStart, "yyyy-MM-dd");
    const gridEndStr = format(gridEnd, "yyyy-MM-dd");

    // Load posts for the visible date range
    useEffect(() => {
        if (!user || !workspaceId) return;

        // Query using documentId bounds (doc IDs are YYYY-MM-DD)
        const q = query(
            collection(db, "workspaces", workspaceId, "post_days"),
            where(documentId(), ">=", gridStartStr),
            where(documentId(), "<=", gridEndStr)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsMap = new Map<string, PostDay>();
            snapshot.docs.forEach((doc) => {
                const data = doc.data() as PostDay;
                postsMap.set(data.date, data);
            });
            setPosts(postsMap);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, workspaceId, gridStartStr, gridEndStr]);

    const goToPreviousMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
    const goToNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));
    const goToToday = () => setCurrentMonth(new Date());

    // Move post from one date to another using shared helper
    const movePost = useCallback(async (sourceDate: string, targetDate: string, overwrite: boolean = false) => {
        if (!workspaceId || sourceDate === targetDate) return;

        const sourcePost = posts.get(sourceDate);
        if (!sourcePost) return;

        setIsMoving(true);
        const result = await movePostDay(workspaceId, sourceDate, targetDate, { overwrite });

        if (result.needsConfirmOverwrite) {
            // Show confirmation modal
            setPendingDrop({ source: { sourceDate, post: sourcePost }, targetDate });
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
        await movePost(pendingDrop.source.sourceDate, pendingDrop.targetDate, true);
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
    const handleDragStart = useCallback((dateStr: string, post: PostDay) => {
        setDraggedPost({ sourceDate: dateStr, post });
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedPost(null);
        setDropTarget(null);
    }, []);

    const handleDragOver = useCallback((e: React.DragEvent, dateStr: string) => {
        e.preventDefault();
        if (draggedPost && dateStr !== draggedPost.sourceDate) {
            setDropTarget(dateStr);
        }
    }, [draggedPost]);

    const handleDragLeave = useCallback(() => {
        setDropTarget(null);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent, targetDate: string) => {
        e.preventDefault();
        if (draggedPost && targetDate !== draggedPost.sourceDate) {
            movePost(draggedPost.sourceDate, targetDate);
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

    const handleDayClick = (dateStr: string) => {
        const post = posts.get(dateStr);
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
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-500 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-500">Setting up your workspace...</p>
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
                <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={goToPreviousMonth}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label="Previous month"
                        >
                            <ChevronLeft size={20} className="text-gray-600" />
                        </button>
                        <button
                            onClick={goToNextMonth}
                            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label="Next month"
                        >
                            <ChevronRight size={20} className="text-gray-600" />
                        </button>
                        <h2 className="text-lg font-semibold text-gray-900 ml-2">
                            {format(currentMonth, "MMMM yyyy")}
                        </h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={goToToday}
                            className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Today
                        </button>

                        {/* PDF Export Controls */}
                        <div className="flex items-center gap-2 pl-2 border-l border-gray-200">
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={pdfIncludeImages}
                                    onChange={(e) => setPdfIncludeImages(e.target.checked)}
                                    disabled={isExportingPdf}
                                    className="h-3.5 w-3.5 rounded border-gray-300 text-teal-600 focus:ring-teal-500 disabled:opacity-50"
                                />
                                Include images
                            </label>
                            <button
                                onClick={handleExportPdf}
                                disabled={isExportingPdf || posts.size === 0}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                {isExportingPdf ? (
                                    <>
                                        <Loader2 size={14} className="animate-spin" />
                                        <span className="max-w-[180px] truncate">
                                            {pdfProgress
                                                ? getPhaseText(pdfProgress)
                                                : "Preparing..."}
                                        </span>
                                    </>
                                ) : (
                                    <>
                                        <Download size={14} />
                                        Download PDF
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* PDF Error Display */}
                {pdfError && (
                    <div className="mx-4 mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <span className="text-red-600 text-sm font-medium">PDF Export Failed:</span>
                            <span className="text-red-700 text-sm flex-1">{pdfError}</span>
                            <button
                                onClick={() => setPdfError(null)}
                                className="text-red-500 hover:text-red-700 text-sm"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {/* PDF Warning Display (e.g., images failed due to CORS) */}
                {pdfWarning && !pdfError && (
                    <div className="mx-4 mt-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                        <div className="flex items-start gap-2">
                            <span className="text-amber-600 text-sm font-medium">PDF Exported with Warning:</span>
                            <span className="text-amber-700 text-sm flex-1">{pdfWarning}</span>
                            <button
                                onClick={() => setPdfWarning(null)}
                                className="text-amber-500 hover:text-amber-700 text-sm"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200 border-t-teal-500 mx-auto mb-4"></div>
                        <p className="text-sm text-gray-500">Loading calendar...</p>
                    </div>
                ) : (
                    <>
                        {/* Day headers */}
                        <div className="grid grid-cols-7 border-b border-gray-200">
                            {DAYS_OF_WEEK.map((day) => (
                                <div
                                    key={day}
                                    className="py-2 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider"
                                >
                                    {day}
                                </div>
                            ))}
                        </div>

                        {/* Calendar grid */}
                        <div className="grid grid-cols-7">
                            {calendarDays.map((day) => {
                                const dateStr = format(day, "yyyy-MM-dd");
                                const rawPost = posts.get(dateStr);
                                const isCurrentMonth = isSameMonth(day, currentMonth);
                                const isToday = dateStr === todayStr;
                                const isPast = dateStr < todayStr;

                                // Check if this post should be hidden
                                const isPostPastUnsent = isPast && !!rawPost && rawPost.status !== "sent";
                                const shouldHidePost = hidePastUnsent && isPostPastUnsent;

                                // If hiding past unsent, treat as no post for display
                                const post = shouldHidePost ? undefined : rawPost;

                                // Compute skip reasons for display
                                const isMissingImage = !!post && !post.imageAssetId;
                                const isPastDate = isPast && !!post;
                                const wouldBeSkipped = isPastDate || isMissingImage;

                                return (
                                    <DayCell
                                        key={dateStr}
                                        dateStr={dateStr}
                                        day={day}
                                        post={post}
                                        isCurrentMonth={isCurrentMonth}
                                        isToday={isToday}
                                        isPast={isPast}
                                        wouldBeSkipped={wouldBeSkipped}
                                        onClick={() => handleDayClick(dateStr)}
                                        workspaceId={workspaceId}
                                        isDragging={draggedPost?.sourceDate === dateStr}
                                        isDropTarget={dropTarget === dateStr}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={handleDragOver}
                                        onDragLeave={handleDragLeave}
                                        onDrop={handleDrop}
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

            {/* PDF Export - Offscreen Render */}
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
        </div>
    );
}

interface DayCellProps {
    dateStr: string;
    day: Date;
    post: PostDay | undefined;
    isCurrentMonth: boolean;
    isToday: boolean;
    isPast: boolean;
    wouldBeSkipped: boolean;
    onClick: () => void;
    workspaceId: string;
    isDragging: boolean;
    isDropTarget: boolean;
    onDragStart: (dateStr: string, post: PostDay) => void;
    onDragEnd: () => void;
    onDragOver: (e: React.DragEvent, dateStr: string) => void;
    onDragLeave: () => void;
    onDrop: (e: React.DragEvent, dateStr: string) => void;
}

function DayCell({
    dateStr,
    day,
    post,
    isCurrentMonth,
    isToday,
    isPast,
    wouldBeSkipped,
    onClick,
    workspaceId,
    isDragging,
    isDropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
}: DayCellProps) {
    // Show warning background for posts that would be skipped (and not sent/error)
    const showWarningBg = wouldBeSkipped && post && post.status !== 'sent' && post.status !== 'error';

    const handleDragStart = (e: React.DragEvent) => {
        if (post) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', dateStr);
            onDragStart(dateStr, post);
        }
    };

    return (
        <div
            draggable={!!post}
            onDragStart={handleDragStart}
            onDragEnd={onDragEnd}
            onDragOver={(e) => onDragOver(e, dateStr)}
            onDragLeave={onDragLeave}
            onDrop={(e) => onDrop(e, dateStr)}
            onClick={onClick}
            className={`
                relative min-h-[80px] md:min-h-[100px] p-1.5 border-b border-r border-gray-100
                text-left transition-all cursor-pointer group
                ${isCurrentMonth ? 'bg-white' : 'bg-gray-50/50'}
                ${showWarningBg ? 'bg-yellow-50/30' : ''}
                ${!isPast && isCurrentMonth ? 'hover:bg-gray-50' : ''}
                ${isPast && isCurrentMonth ? 'hover:bg-gray-100/50' : ''}
                ${isDragging ? 'opacity-50 ring-2 ring-teal-500 ring-inset' : ''}
                ${isDropTarget ? 'bg-teal-100 ring-2 ring-teal-500 ring-inset' : ''}
                ${post ? 'cursor-grab active:cursor-grabbing' : ''}
            `}
        >
            {/* Day number */}
            <div className="flex items-center justify-between mb-1">
                <span className={`
                    inline-flex items-center justify-center w-6 h-6 text-xs font-medium rounded-full
                    ${isToday ? 'bg-teal-600 text-white' : ''}
                    ${!isToday && isCurrentMonth ? 'text-gray-900' : ''}
                    ${!isToday && !isCurrentMonth ? 'text-gray-400' : ''}
                    ${isPast && isCurrentMonth && !isToday ? 'text-gray-500' : ''}
                `}>
                    {format(day, "d")}
                </span>

                {/* Skip reason indicator */}
                {showWarningBg && (
                    <span className="text-[8px] font-semibold text-yellow-700 bg-yellow-100 px-1 py-0.5 rounded uppercase">
                        Not Sent
                    </span>
                )}
            </div>

            {/* Post content */}
            {post && (
                <div className={`${wouldBeSkipped && post.status !== 'sent' ? 'opacity-60' : ''}`}>
                    {/* Thumbnail */}
                    {post.imageAssetId && (
                        <div className="relative w-full h-10 md:h-14 mb-1 rounded overflow-hidden bg-gray-100">
                            <AssetThumbnail
                                assetId={post.imageAssetId}
                                workspaceId={workspaceId}
                            />
                        </div>
                    )}

                    {/* Status indicator and time */}
                    <div className="flex items-center justify-between gap-1">
                        <StatusDot status={post.status} wouldBeSkipped={wouldBeSkipped} />
                        <span className="text-[9px] text-gray-400">
                            {formatTimeForDisplay(post.postingTime || randomTimeInWindow5Min(dateStr, dateStr))}
                        </span>
                    </div>
                </div>
            )}

            {/* Drop target indicator */}
            {isDropTarget && (
                <div className="absolute inset-0 flex items-center justify-center bg-teal-500/10 pointer-events-none">
                    <span className="text-xs font-medium text-teal-700 bg-white/90 px-2 py-1 rounded shadow">
                        Drop here
                    </span>
                </div>
            )}
        </div>
    );
}

function StatusDot({ status, wouldBeSkipped }: { status: PostDay['status']; wouldBeSkipped: boolean }) {
    const statusColors: Record<PostDay['status'], { bg: string; text: string; label: string }> = {
        input: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Input' },
        generated: { bg: 'bg-amber-200', text: 'text-amber-700', label: 'Generated' },
        edited: { bg: 'bg-blue-200', text: 'text-blue-700', label: 'Edited' },
        sent: { bg: 'bg-green-200', text: 'text-green-700', label: 'Sent' },
        error: { bg: 'bg-red-200', text: 'text-red-700', label: 'Error' },
    };

    // UI-only override: show "Not Sent" yellow pill for skipped posts
    const notSentStyle = { bg: 'bg-yellow-200', text: 'text-yellow-700', label: 'Not Sent' };

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
