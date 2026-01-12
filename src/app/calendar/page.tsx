"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { db, storage } from "@/lib/firebase";
import { collection, query, where, onSnapshot, documentId, doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfMonth, startOfWeek, endOfWeek, addDays, addMonths, subMonths, isSameMonth } from "date-fns";
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import Image from "next/image";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const router = useRouter();
    const [currentMonth, setCurrentMonth] = useState(new Date());
    const [posts, setPosts] = useState<Map<string, PostDay>>(new Map());
    const [loading, setLoading] = useState(true);

    // Global setting for hiding past unsent posts
    const { settings } = useWorkspaceUiSettings();
    const hidePastUnsent = settings.hidePastUnsent;

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

    const handleDayClick = (dateStr: string) => {
        const post = posts.get(dateStr);
        if (post) {
            router.push(`/review?date=${dateStr}`);
        } else {
            router.push(`/input?date=${dateStr}`);
        }
    };

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
                    <button
                        onClick={goToToday}
                        className="px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Today
                    </button>
                </div>

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
                                const isPastDue = isPast && !!post && post.status !== "sent";

                                return (
                                    <DayCell
                                        key={dateStr}
                                        day={day}
                                        post={post}
                                        isCurrentMonth={isCurrentMonth}
                                        isToday={isToday}
                                        isPast={isPast}
                                        isPastDue={isPastDue}
                                        onClick={() => handleDayClick(dateStr)}
                                        workspaceId={workspaceId}
                                    />
                                );
                            })}
                        </div>
                    </>
                )}
            </DashboardCard>
        </div>
    );
}

interface DayCellProps {
    day: Date;
    post: PostDay | undefined;
    isCurrentMonth: boolean;
    isToday: boolean;
    isPast: boolean;
    isPastDue: boolean;
    onClick: () => void;
    workspaceId: string;
}

function DayCell({ day, post, isCurrentMonth, isToday, isPast, isPastDue, onClick, workspaceId }: DayCellProps) {
    return (
        <button
            onClick={onClick}
            className={`
                relative min-h-[80px] md:min-h-[100px] p-1.5 border-b border-r border-gray-100
                text-left transition-colors group
                ${isCurrentMonth ? 'bg-white' : 'bg-gray-50/50'}
                ${isPastDue ? 'bg-red-50/30' : ''}
                ${!isPast && isCurrentMonth ? 'hover:bg-gray-50' : ''}
                ${isPast && isCurrentMonth ? 'hover:bg-gray-100/50' : ''}
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

                {/* Past due indicator */}
                {isPastDue && (
                    <span className="text-[8px] font-semibold text-red-600 bg-red-100 px-1 py-0.5 rounded uppercase">
                        Past due
                    </span>
                )}
            </div>

            {/* Post content */}
            {post && (
                <div className={`${isPast && post.status !== 'sent' ? 'opacity-60' : ''}`}>
                    {/* Thumbnail */}
                    {post.imageAssetId && (
                        <div className="relative w-full h-10 md:h-14 mb-1 rounded overflow-hidden bg-gray-100">
                            <AssetThumbnail
                                assetId={post.imageAssetId}
                                workspaceId={workspaceId}
                            />
                        </div>
                    )}

                    {/* Status indicator */}
                    <StatusDot status={post.status} isPastDue={isPastDue} />
                </div>
            )}
        </button>
    );
}

function StatusDot({ status, isPastDue }: { status: PostDay['status']; isPastDue: boolean }) {
    const statusColors: Record<PostDay['status'], { bg: string; text: string; label: string }> = {
        input: { bg: 'bg-gray-200', text: 'text-gray-600', label: 'Input' },
        generated: { bg: 'bg-amber-200', text: 'text-amber-700', label: 'Generated' },
        edited: { bg: 'bg-blue-200', text: 'text-blue-700', label: 'Edited' },
        sent: { bg: 'bg-green-200', text: 'text-green-700', label: 'Sent' },
        error: { bg: 'bg-red-200', text: 'text-red-700', label: 'Error' },
    };

    // UI-only override: show "Not Sent" yellow pill for past-due posts
    const notSentStyle = { bg: 'bg-yellow-200', text: 'text-yellow-700', label: 'Not Sent' };

    const { bg, text, label } = (isPastDue && status !== 'sent')
        ? notSentStyle
        : (statusColors[status] || statusColors.input);

    return (
        <span className={`
            inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium
            ${bg} ${text}
        `}>
            {label}
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
