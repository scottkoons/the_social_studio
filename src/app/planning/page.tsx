"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { collection, query, onSnapshot, orderBy } from "firebase/firestore";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import CSVImport from "@/components/CSVImport";
import { Calendar, Clock, CheckCircle, AlertCircle, Edit3, Send, Image as ImageIcon } from "lucide-react";
import { getTodayInDenver, formatDisplayDate } from "@/lib/utils";
import { formatTimeForDisplay } from "@/lib/postingTime";
import { PostDay } from "@/lib/types";
import { format, parseISO, differenceInDays, startOfWeek, endOfWeek, addWeeks } from "date-fns";

export default function PlanningPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const [posts, setPosts] = useState<PostDay[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !workspaceId) return;

        const q = query(
            collection(db, "workspaces", workspaceId, "post_days"),
            orderBy("date", "asc")
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const postsData = snapshot.docs.map((docSnap) => ({
                docId: docSnap.id,
                ...docSnap.data(),
            })) as PostDay[];
            setPosts(postsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, workspaceId]);

    // Calculate stats
    const today = getTodayInDenver();

    // Group posts by date (for counting unique days, not platform-specific)
    const uniqueDates = new Set(posts.map(p => p.date));
    const futurePosts = posts.filter(p => p.date >= today);
    const futureDates = new Set(futurePosts.map(p => p.date));

    // Status counts (unique dates)
    const statusByDate = new Map<string, PostDay>();
    posts.forEach(p => {
        if (!statusByDate.has(p.date) || p.platform === "facebook") {
            statusByDate.set(p.date, p);
        }
    });

    const inputCount = Array.from(statusByDate.values()).filter(p => p.date >= today && p.status === "input").length;
    const generatedCount = Array.from(statusByDate.values()).filter(p => p.date >= today && p.status === "generated").length;
    const editedCount = Array.from(statusByDate.values()).filter(p => p.date >= today && p.status === "edited").length;
    const sentCount = Array.from(statusByDate.values()).filter(p => p.status === "sent").length;

    // Posts missing images (check by date - if either platform is missing image, count it)
    const datesMissingImages = new Set<string>();
    futurePosts.forEach(p => {
        if (!p.imageAssetId) {
            datesMissingImages.add(p.date);
        }
    });

    // Upcoming week
    const thisWeekStart = startOfWeek(parseISO(today), { weekStartsOn: 0 });
    const thisWeekEnd = endOfWeek(parseISO(today), { weekStartsOn: 0 });
    const nextWeekEnd = endOfWeek(addWeeks(parseISO(today), 1), { weekStartsOn: 0 });

    const thisWeekPosts = Array.from(new Set(
        futurePosts
            .filter(p => {
                const d = parseISO(p.date);
                return d >= thisWeekStart && d <= thisWeekEnd;
            })
            .map(p => p.date)
    ));

    const nextWeekPosts = Array.from(new Set(
        futurePosts
            .filter(p => {
                const d = parseISO(p.date);
                return d > thisWeekEnd && d <= nextWeekEnd;
            })
            .map(p => p.date)
    ));

    // Days until next post
    const nextPost = futurePosts[0];
    const daysUntilNext = nextPost ? differenceInDays(parseISO(nextPost.date), parseISO(today)) : null;

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
                title="Queue Dashboard"
                subtitle="Overview of your scheduled posts and content pipeline."
                actions={<CSVImport />}
            />

            {loading ? (
                <DashboardCard>
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Loading queue stats...</p>
                    </div>
                </DashboardCard>
            ) : (
                <>
                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        {/* Total Scheduled */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-primary)]">
                            <div className="flex items-center gap-2 mb-2">
                                <Calendar className="text-[var(--accent-primary)]" size={18} />
                                <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Scheduled</span>
                            </div>
                            <p className="text-2xl font-bold text-[var(--text-primary)]">{futureDates.size}</p>
                            <p className="text-xs text-[var(--text-muted)]">upcoming dates</p>
                        </div>

                        {/* Needs Content */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-primary)]">
                            <div className="flex items-center gap-2 mb-2">
                                <Edit3 className="text-amber-500" size={18} />
                                <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Needs AI</span>
                            </div>
                            <p className="text-2xl font-bold text-[var(--text-primary)]">{inputCount}</p>
                            <p className="text-xs text-[var(--text-muted)]">awaiting generation</p>
                        </div>

                        {/* Ready to Review */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-primary)]">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="text-green-500" size={18} />
                                <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Ready</span>
                            </div>
                            <p className="text-2xl font-bold text-[var(--text-primary)]">{generatedCount + editedCount}</p>
                            <p className="text-xs text-[var(--text-muted)]">ready to send</p>
                        </div>

                        {/* Sent */}
                        <div className="bg-[var(--bg-card)] rounded-xl p-4 border border-[var(--border-primary)]">
                            <div className="flex items-center gap-2 mb-2">
                                <Send className="text-blue-500" size={18} />
                                <span className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wider">Sent</span>
                            </div>
                            <p className="text-2xl font-bold text-[var(--text-primary)]">{sentCount}</p>
                            <p className="text-xs text-[var(--text-muted)]">published</p>
                        </div>
                    </div>

                    {/* Alerts */}
                    {datesMissingImages.size > 0 && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 mb-6 flex items-start gap-3">
                            <ImageIcon className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" size={18} />
                            <div>
                                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                    {datesMissingImages.size} date{datesMissingImages.size !== 1 ? 's' : ''} missing images
                                </p>
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                                    Posts without images cannot be sent. Add images via Input or Calendar.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Next Posts by Platform */}
                    {nextPost && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            {/* Instagram Next Post */}
                            <DashboardCard>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Clock className="text-pink-500" size={16} />
                                            <span className="text-xs font-medium text-pink-600 dark:text-pink-400 uppercase tracking-wider">Next Instagram</span>
                                        </div>
                                        <p className="text-lg font-semibold text-[var(--text-primary)]">
                                            {formatDisplayDate(nextPost.date)}
                                        </p>
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            {nextPost.postingTimeIg
                                                ? formatTimeForDisplay(nextPost.postingTimeIg)
                                                : nextPost.postingTime
                                                    ? formatTimeForDisplay(nextPost.postingTime)
                                                    : "time not set"
                                            }
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        {daysUntilNext === 0 ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                                Today
                                            </span>
                                        ) : daysUntilNext === 1 ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400">
                                                Tomorrow
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                                                In {daysUntilNext} days
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </DashboardCard>

                            {/* Facebook Next Post */}
                            <DashboardCard>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="flex items-center gap-2 mb-1">
                                            <Clock className="text-blue-500" size={16} />
                                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wider">Next Facebook</span>
                                        </div>
                                        <p className="text-lg font-semibold text-[var(--text-primary)]">
                                            {formatDisplayDate(nextPost.date)}
                                        </p>
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            {nextPost.postingTimeFb
                                                ? formatTimeForDisplay(nextPost.postingTimeFb)
                                                : nextPost.postingTime
                                                    ? formatTimeForDisplay(nextPost.postingTime)
                                                    : "time not set"
                                            }
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        {daysUntilNext === 0 ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                                                Today
                                            </span>
                                        ) : daysUntilNext === 1 ? (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400">
                                                Tomorrow
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                                                In {daysUntilNext} days
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </DashboardCard>
                        </div>
                    )}

                    {/* Weekly Overview */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* This Week */}
                        <DashboardCard>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">This Week</h3>
                            {thisWeekPosts.length === 0 ? (
                                <p className="text-sm text-[var(--text-muted)]">No posts scheduled this week.</p>
                            ) : (
                                <div className="space-y-2">
                                    {thisWeekPosts.map(date => {
                                        const postsForDate = futurePosts.filter(p => p.date === date);
                                        const hasImage = postsForDate.some(p => p.imageAssetId);
                                        const fbPost = postsForDate.find(p => p.platform === "facebook");
                                        return (
                                            <div key={date} className="flex items-center justify-between py-2 border-b border-[var(--border-secondary)] last:border-0">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-[var(--text-primary)]">
                                                        {format(parseISO(date), "EEE, MMM d")}
                                                    </span>
                                                    {!hasImage && (
                                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">No image</span>
                                                    )}
                                                </div>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    fbPost?.status === "input"
                                                        ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                                        : fbPost?.status === "generated" || fbPost?.status === "edited"
                                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                                }`}>
                                                    {fbPost?.status || "input"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </DashboardCard>

                        {/* Next Week */}
                        <DashboardCard>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Next Week</h3>
                            {nextWeekPosts.length === 0 ? (
                                <p className="text-sm text-[var(--text-muted)]">No posts scheduled for next week.</p>
                            ) : (
                                <div className="space-y-2">
                                    {nextWeekPosts.map(date => {
                                        const postsForDate = futurePosts.filter(p => p.date === date);
                                        const hasImage = postsForDate.some(p => p.imageAssetId);
                                        const fbPost = postsForDate.find(p => p.platform === "facebook");
                                        return (
                                            <div key={date} className="flex items-center justify-between py-2 border-b border-[var(--border-secondary)] last:border-0">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-medium text-[var(--text-primary)]">
                                                        {format(parseISO(date), "EEE, MMM d")}
                                                    </span>
                                                    {!hasImage && (
                                                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">No image</span>
                                                    )}
                                                </div>
                                                <span className={`text-xs font-medium px-2 py-0.5 rounded ${
                                                    fbPost?.status === "input"
                                                        ? "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                                                        : fbPost?.status === "generated" || fbPost?.status === "edited"
                                                        ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                                        : "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400"
                                                }`}>
                                                    {fbPost?.status || "input"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </DashboardCard>
                    </div>

                    {/* Import Info */}
                    <div className="mt-6 bg-[var(--bg-secondary)] rounded-xl p-5">
                        <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">Import Posts via CSV</h3>
                        <p className="text-sm text-[var(--text-secondary)] mb-3">
                            Upload a CSV file to bulk-import posts. Each row creates posts for both Facebook and Instagram with the same content.
                        </p>
                        <div className="bg-[var(--bg-card)] rounded-lg p-3 font-mono text-xs text-[var(--text-secondary)]">
                            <p className="text-[var(--text-muted)] mb-1"># CSV format (Buffer compatible):</p>
                            <p>Text,Image URL,Tags,Posting Time</p>
                            <p>&quot;Today&apos;s special: Fish tacos!&quot;,https://...,,2024-01-15 12:30</p>
                            <p>&quot;Happy hour from 4-6pm&quot;,,,2024-01-16 17:00</p>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
