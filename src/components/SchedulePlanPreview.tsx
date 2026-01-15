"use client";

import { SchedulePlan, formatDateDisplay, groupByDayOfWeek, exportScheduleSummary } from "@/lib/schedulePlanner";
import { Download } from "lucide-react";

interface SchedulePlanPreviewProps {
    plan: SchedulePlan;
}

const DAY_ORDER = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SchedulePlanPreview({ plan }: SchedulePlanPreviewProps) {
    const grouped = groupByDayOfWeek(plan.rows);

    return (
        <div className="space-y-4">
            {/* Summary Header */}
            <div className="bg-[var(--bg-tertiary)] rounded-lg p-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-[var(--text-primary)]">
                            {plan.totalPosts} post{plan.totalPosts !== 1 ? "s" : ""} scheduled
                        </h3>
                        <p className="text-sm text-[var(--text-secondary)]">
                            {formatDateDisplay(plan.startDate)} - {formatDateDisplay(plan.endDate)}
                        </p>
                    </div>
                    <button
                        onClick={() => exportScheduleSummary(plan)}
                        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-card)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-primary)] rounded-lg transition-colors"
                    >
                        <Download size={14} />
                        Export Summary
                    </button>
                </div>
                <div className="mt-2 flex gap-4 text-sm text-[var(--text-muted)]">
                    <span>{plan.manualCount} manual</span>
                    <span>{plan.aiCount} AI-assigned</span>
                    {plan.existingBlockedCount > 0 && (
                        <span>{plan.existingBlockedCount} dates blocked</span>
                    )}
                </div>
            </div>

            {/* Day of Week Grouping */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)]">
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">Posts by Day of Week</h4>
                </div>
                <div className="p-4">
                    <div className="grid grid-cols-7 gap-2 text-center">
                        {DAY_ORDER.map((day) => (
                            <div key={day} className="text-xs">
                                <div className="font-medium text-[var(--text-secondary)] mb-1">
                                    {day.slice(0, 3)}
                                </div>
                                <div className="text-[var(--text-muted)] min-h-[20px]">
                                    {grouped[day].length > 0 ? grouped[day].join(", ") : "-"}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Detailed Schedule Table */}
            <div className="bg-[var(--bg-card)] border border-[var(--border-primary)] rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-[var(--bg-tertiary)] border-b border-[var(--border-primary)]">
                    <h4 className="text-sm font-medium text-[var(--text-primary)]">Schedule Details</h4>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--border-primary)]">
                                <th className="px-4 py-2 text-left font-medium text-[var(--text-secondary)]">Date</th>
                                <th className="px-4 py-2 text-left font-medium text-[var(--text-secondary)]">Time</th>
                                <th className="px-4 py-2 text-left font-medium text-[var(--text-secondary)]">Date Source</th>
                                <th className="px-4 py-2 text-left font-medium text-[var(--text-secondary)]">Preview</th>
                            </tr>
                        </thead>
                        <tbody>
                            {plan.rows.map((row, index) => (
                                <tr
                                    key={row.date}
                                    className={index % 2 === 0 ? "bg-[var(--bg-card)]" : "bg-[var(--bg-tertiary)]/50"}
                                >
                                    <td className="px-4 py-2 text-[var(--text-primary)]">
                                        {formatDateDisplay(row.date)}
                                    </td>
                                    <td className="px-4 py-2 text-[var(--text-primary)] font-mono">
                                        {row.postingTime}
                                    </td>
                                    <td className="px-4 py-2">
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                                                row.dateSource === "manual"
                                                    ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                                    : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                                            }`}
                                        >
                                            {row.dateSource}
                                        </span>
                                    </td>
                                    <td className="px-4 py-2 text-[var(--text-muted)] max-w-[200px] truncate">
                                        {row.starterText || "(no description)"}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
