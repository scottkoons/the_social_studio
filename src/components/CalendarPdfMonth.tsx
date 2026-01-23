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
                                                    marginBottom: "4px",
                                                    display: "flex",
                                                    justifyContent: "center",
                                                }}
                                            >
                                                {includeImages && imageDataUrl ? (
                                                    // Use base64 data URL to avoid CORS
                                                    <img
                                                        src={imageDataUrl}
                                                        alt=""
                                                        style={{
                                                            maxWidth: "100%",
                                                            maxHeight: "50px",
                                                            width: "auto",
                                                            height: "auto",
                                                            borderRadius: "4px",
                                                        }}
                                                    />
                                                ) : (
                                                    /* Gray placeholder when images disabled or not loaded */
                                                    <div
                                                        style={{
                                                            width: "100%",
                                                            height: "50px",
                                                            backgroundColor: "#d1d5db",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "center",
                                                            borderRadius: "4px",
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

                                        {/* FB and IG posting times */}
                                        <div
                                            style={{
                                                display: "flex",
                                                flexDirection: "column",
                                                gap: "1px",
                                            }}
                                        >
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                <span style={{ fontSize: "8px", fontWeight: 600, color: "#3b5998" }}>FB</span>
                                                <span style={{ fontSize: "8px", color: "#6b7280" }}>
                                                    {formatTimeForDisplay(
                                                        post.postingTimeFb || post.postingTime || randomTimeInWindow5Min(dateStr, dateStr)
                                                    )}
                                                </span>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                <span style={{ fontSize: "8px", fontWeight: 600, color: "#E1306C" }}>IG</span>
                                                <span style={{ fontSize: "8px", color: "#6b7280" }}>
                                                    {formatTimeForDisplay(
                                                        post.postingTimeIg || post.postingTime || randomTimeInWindow5Min(dateStr, dateStr)
                                                    )}
                                                </span>
                                            </div>
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

export default CalendarPdfMonth;
