"use client";

import { forwardRef } from "react";
import { format } from "date-fns";
import { CalendarDay, getMonthLabel } from "@/lib/calendarPdfExport";
import { formatTimeForDisplay, randomTimeInWindow5Min } from "@/lib/postingTime";

const DAYS_OF_WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface CalendarPdfMonthProps {
    monthKey: string;
    days: CalendarDay[];
    imageDataUrls: Map<string, string>;
    includeImages: boolean;
}

/**
 * Renders a single month calendar grid for PDF capture.
 * Uses inline styles where possible for html2canvas compatibility.
 */
const CalendarPdfMonth = forwardRef<HTMLDivElement, CalendarPdfMonthProps>(
    function CalendarPdfMonth({ monthKey, days, imageDataUrls, includeImages }, ref) {
        const monthLabel = getMonthLabel(monthKey);

        return (
            <div
                ref={ref}
                style={{
                    width: "1000px",
                    padding: "24px",
                    backgroundColor: "#ffffff",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                }}
            >
                {/* Month header */}
                <div
                    style={{
                        textAlign: "center",
                        marginBottom: "16px",
                        paddingBottom: "12px",
                        borderBottom: "2px solid #0d9488",
                    }}
                >
                    <h2
                        style={{
                            fontSize: "28px",
                            fontWeight: 600,
                            color: "#111827",
                            margin: 0,
                        }}
                    >
                        {monthLabel}
                    </h2>
                </div>

                {/* Day headers */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, 1fr)",
                        borderBottom: "1px solid #e5e7eb",
                    }}
                >
                    {DAYS_OF_WEEK.map((day) => (
                        <div
                            key={day}
                            style={{
                                padding: "8px",
                                textAlign: "center",
                                fontSize: "12px",
                                fontWeight: 600,
                                color: "#6b7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                            }}
                        >
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar grid - 6 rows of 7 days */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(7, 1fr)",
                    }}
                >
                    {days.map((calDay) => {
                        const { dateStr, day, isCurrentMonth, post } = calDay;
                        const hasImage = post?.imageAssetId;
                        // Get base64 data URL if available
                        const imageDataUrl = hasImage ? imageDataUrls.get(post.imageAssetId!) : undefined;

                        return (
                            <div
                                key={dateStr}
                                style={{
                                    minHeight: "90px",
                                    padding: "4px",
                                    borderRight: "1px solid #f3f4f6",
                                    borderBottom: "1px solid #f3f4f6",
                                    backgroundColor: isCurrentMonth ? "#ffffff" : "#fafafa",
                                }}
                            >
                                {/* Day number */}
                                <div
                                    style={{
                                        fontSize: "12px",
                                        fontWeight: 500,
                                        color: isCurrentMonth ? "#111827" : "#9ca3af",
                                        marginBottom: "4px",
                                    }}
                                >
                                    {format(day, "d")}
                                </div>

                                {/* Post content */}
                                {post && (
                                    <div>
                                        {/* Thumbnail or Placeholder */}
                                        {hasImage && (
                                            <div
                                                style={{
                                                    width: "100%",
                                                    height: "50px",
                                                    marginBottom: "4px",
                                                    borderRadius: "4px",
                                                    overflow: "hidden",
                                                    backgroundColor: "#e5e7eb",
                                                }}
                                            >
                                                {includeImages && imageDataUrl ? (
                                                    // Use base64 data URL to avoid CORS
                                                    <img
                                                        src={imageDataUrl}
                                                        alt=""
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            objectFit: "contain",
                                                        }}
                                                    />
                                                ) : (
                                                    /* Gray placeholder when images disabled or not loaded */
                                                    <div
                                                        style={{
                                                            width: "100%",
                                                            height: "100%",
                                                            backgroundColor: "#d1d5db",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                        }}
                                                    >
                                                        <span
                                                            style={{
                                                                fontSize: "8px",
                                                                color: "#6b7280",
                                                                textTransform: "uppercase",
                                                            }}
                                                        >
                                                            Image
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Status and time */}
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                gap: "4px",
                                            }}
                                        >
                                            <StatusBadge status={post.status} />
                                            <span
                                                style={{
                                                    fontSize: "9px",
                                                    color: "#9ca3af",
                                                }}
                                            >
                                                {formatTimeForDisplay(
                                                    post.postingTime ||
                                                        randomTimeInWindow5Min(dateStr, dateStr)
                                                )}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }
);

function StatusBadge({ status }: { status: string }) {
    const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
        input: { bg: "#e5e7eb", text: "#4b5563", label: "Input" },
        generated: { bg: "#fde68a", text: "#b45309", label: "Gen" },
        edited: { bg: "#bfdbfe", text: "#1d4ed8", label: "Edit" },
        sent: { bg: "#bbf7d0", text: "#15803d", label: "Sent" },
        error: { bg: "#fecaca", text: "#b91c1c", label: "Err" },
    };

    const config = statusConfig[status] || statusConfig.input;

    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "2px 6px",
                borderRadius: "4px",
                fontSize: "9px",
                fontWeight: 500,
                backgroundColor: config.bg,
                color: config.text,
            }}
        >
            {config.label}
        </span>
    );
}

export default CalendarPdfMonth;
