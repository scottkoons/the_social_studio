"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import PlatformPlanCard from "@/components/PlatformPlanCard";
import Toast from "@/components/ui/Toast";
import { CalendarDays } from "lucide-react";
import { getTodayInDenver } from "@/lib/utils";
import { format, addDays, parseISO } from "date-fns";

export default function PlanningPage() {
    const { user, workspaceId, workspaceLoading } = useAuth();
    const [toast, setToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);

    // SHARED date range state (one picker for both platforms)
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    // Set default dates on mount
    useEffect(() => {
        const today = getTodayInDenver();
        const tomorrow = format(addDays(parseISO(today), 1), "yyyy-MM-dd");
        const fourWeeksLater = format(addDays(parseISO(today), 28), "yyyy-MM-dd");
        setStartDate(tomorrow);
        setEndDate(fourWeeksLater);
    }, []);

    const showToast = (type: 'success' | 'error', message: string) => {
        setToast({ type, message });
        setTimeout(() => setToast(null), 4000);
    };

    const handleFacebookComplete = (count: number) => {
        showToast('success', `Created ${count} Facebook post${count !== 1 ? 's' : ''}.`);
    };

    const handleInstagramComplete = (count: number) => {
        showToast('success', `Created ${count} Instagram post${count !== 1 ? 's' : ''}.`);
    };

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
                title="Content Planning"
                subtitle="Generate posting schedules for Facebook and Instagram. Upload CSV files to schedule your content."
            />

            {/* Shared Date Range Picker */}
            <DashboardCard>
                <div className="flex items-center gap-3 mb-4">
                    <CalendarDays className="text-[var(--accent-primary)]" size={20} />
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        Planning Date Range
                    </h2>
                </div>
                <p className="text-sm text-[var(--text-secondary)] mb-4">
                    Select the date range for both platforms. Each platform can have one post per day within this range.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--input-bg)] border border-[var(--border-primary)] rounded-lg text-sm text-[var(--text-primary)] focus:ring-2 focus:ring-[var(--accent-primary)] focus:border-transparent"
                        />
                    </div>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-3">
                    Note: A day may contain 1 Facebook post AND 1 Instagram post (both allowed).
                    A day may NOT contain 2 posts for the same platform.
                </p>
            </DashboardCard>

            {/* Platform Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                {/* Facebook Plan Card */}
                <PlatformPlanCard
                    platform="facebook"
                    startDate={startDate}
                    endDate={endDate}
                    defaultPostsPerWeek={6}
                    recommendedRange="4–6"
                    onComplete={handleFacebookComplete}
                />

                {/* Instagram Plan Card */}
                <PlatformPlanCard
                    platform="instagram"
                    startDate={startDate}
                    endDate={endDate}
                    defaultPostsPerWeek={7}
                    recommendedRange="6–7"
                    onComplete={handleInstagramComplete}
                />
            </div>

            {/* Info section */}
            <div className="mt-6 bg-[var(--bg-secondary)] rounded-xl p-5">
                <h3 className="text-sm font-medium text-[var(--text-primary)] mb-3">How Planning Works</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-[var(--text-secondary)]">
                    <div>
                        <div className="font-medium text-[var(--text-primary)] mb-1">1. Generate Plans</div>
                        <p>Set posts per week for each platform. The planner suggests optimal posting days based on engagement data.</p>
                    </div>
                    <div>
                        <div className="font-medium text-[var(--text-primary)] mb-1">2. Upload Your CSVs</div>
                        <p>Upload separate CSVs for Facebook and Instagram. Dates are optional - leave blank for auto-assignment.</p>
                    </div>
                    <div>
                        <div className="font-medium text-[var(--text-primary)] mb-1">3. Review & Apply</div>
                        <p>Preview schedules before applying. Once applied, posts appear in Input, Review, and Calendar for editing.</p>
                    </div>
                </div>
            </div>

            {/* Toast */}
            {toast && (
                <Toast
                    type={toast.type}
                    message={toast.message}
                    onClose={() => setToast(null)}
                />
            )}
        </div>
    );
}
