"use client";

import { forwardRef } from "react";
import { PostDay } from "@/lib/types";
import {
    ROW_HEIGHT_PX,
    COL_DATE_WIDTH_PX,
    COL_IMAGE_WIDTH_PX,
    COL_IG_WIDTH_PX,
    COL_FB_WIDTH_PX,
    FONT_SIZE_PT,
    LINE_HEIGHT,
    IMAGE_SIZE_PX,
    ROW_COLOR_WHITE,
    ROW_COLOR_CREAM,
    formatDateTimeForTable,
    CONTENT_WIDTH_PX,
} from "@/lib/postsPdfExport";
import { formatTimeForDisplay, randomTimeInWindow5Min } from "@/lib/postingTime";
import { format, parseISO } from "date-fns";

interface PostsPdfRowProps {
    post: PostDay;
    rowIndex: number;
    imageDataUrl?: string;
    includeImages: boolean;
}

/**
 * Formats time for display (handles undefined)
 */
function getTimeDisplay(time: string | undefined, fallbackDate: string): string {
    return formatTimeForDisplay(time || randomTimeInWindow5Min(fallbackDate, fallbackDate));
}

/**
 * Table row for Posts PDF export.
 * Two modes:
 * - With images: Date/Time | Image | Instagram Post | Facebook Post
 * - Without images (compact): Date/Time | Post Content (FB row, then IG row)
 */
const PostsPdfRow = forwardRef<HTMLDivElement, PostsPdfRowProps>(
    function PostsPdfRow({ post, rowIndex, imageDataUrl, includeImages }, ref) {
        const hasImage = !!post.imageAssetId;
        const bgColor = rowIndex % 2 === 0 ? ROW_COLOR_WHITE : ROW_COLOR_CREAM;

        // Get captions and hashtags
        const igCaption = post.ai?.ig?.caption || "";
        const fbCaption = post.ai?.fb?.caption || "";
        const igHashtags = post.ai?.ig?.hashtags || [];
        const fbHashtags = post.ai?.fb?.hashtags || [];

        // Combine caption with hashtags
        const igFullText = igCaption + (igHashtags.length > 0 ? "\n\n" + igHashtags.join(" ") : "");
        const fbFullText = fbCaption + (fbHashtags.length > 0 ? "\n\n" + fbHashtags.join(" ") : "");

        // COMPACT MODE (no images): 2 columns, 2 rows per post
        if (!includeImages) {
            const dateStr = format(parseISO(post.date), "M/dd/yy");
            const fbTime = getTimeDisplay(post.postingTimeFb || post.postingTime, post.date);
            const igTime = getTimeDisplay(post.postingTimeIg || post.postingTime, post.date);
            const compactRowHeight = Math.floor(ROW_HEIGHT_PX / 2);

            return (
                <div ref={ref} style={{ width: "100%" }}>
                    {/* FB Row */}
                    <div
                        style={{
                            display: "flex",
                            width: "100%",
                            minHeight: `${compactRowHeight}px`,
                            backgroundColor: bgColor,
                            borderBottom: "1px solid #f3f4f6",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            boxSizing: "border-box",
                        }}
                    >
                        {/* Date + FB Time */}
                        <div
                            style={{
                                width: "80px",
                                flexShrink: 0,
                                padding: "4px 6px",
                                borderRight: "1px solid #e5e7eb",
                                boxSizing: "border-box",
                            }}
                        >
                            <div style={{ fontSize: "9px", fontWeight: 600, color: "#374151" }}>{dateStr}</div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>
                                <span style={{ fontSize: "8px", fontWeight: 600, color: "#3b5998" }}>FB</span>
                                <span style={{ fontSize: "8px", color: "#6b7280" }}>{fbTime}</span>
                            </div>
                        </div>
                        {/* FB Post Content */}
                        <div
                            style={{
                                flex: 1,
                                padding: "4px 8px",
                                boxSizing: "border-box",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: `${FONT_SIZE_PT}px`,
                                    color: "#374151",
                                    lineHeight: LINE_HEIGHT,
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {fbFullText || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>(No text)</span>}
                            </div>
                        </div>
                    </div>

                    {/* IG Row */}
                    <div
                        style={{
                            display: "flex",
                            width: "100%",
                            minHeight: `${compactRowHeight}px`,
                            backgroundColor: bgColor,
                            borderBottom: "1px solid #e5e7eb",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            boxSizing: "border-box",
                        }}
                    >
                        {/* IG Time (no date repeat) */}
                        <div
                            style={{
                                width: "80px",
                                flexShrink: 0,
                                padding: "4px 6px",
                                borderRight: "1px solid #e5e7eb",
                                boxSizing: "border-box",
                            }}
                        >
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <span style={{ fontSize: "8px", fontWeight: 600, color: "#E1306C" }}>IG</span>
                                <span style={{ fontSize: "8px", color: "#6b7280" }}>{igTime}</span>
                            </div>
                        </div>
                        {/* IG Post Content */}
                        <div
                            style={{
                                flex: 1,
                                padding: "4px 8px",
                                boxSizing: "border-box",
                                overflow: "hidden",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: `${FONT_SIZE_PT}px`,
                                    color: "#374151",
                                    lineHeight: LINE_HEIGHT,
                                    wordBreak: "break-word",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {igFullText || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>(No text)</span>}
                            </div>
                        </div>
                    </div>
                </div>
            );
        }

        // FULL MODE (with images): 4 columns
        const dateTimeStr = formatDateTimeForTable(post);

        return (
            <div
                ref={ref}
                style={{
                    display: "flex",
                    width: "100%",
                    height: `${ROW_HEIGHT_PX}px`,
                    backgroundColor: bgColor,
                    borderBottom: "1px solid #e5e7eb",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    boxSizing: "border-box",
                }}
            >
                {/* Date/Time Column */}
                <div
                    style={{
                        width: `${COL_DATE_WIDTH_PX}px`,
                        flexShrink: 0,
                        padding: "6px 8px",
                        display: "flex",
                        alignItems: "flex-start",
                        borderRight: "1px solid #e5e7eb",
                        boxSizing: "border-box",
                    }}
                >
                    <span
                        style={{
                            fontSize: `${FONT_SIZE_PT}px`,
                            fontWeight: 500,
                            color: "#374151",
                            lineHeight: 1.5,
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {dateTimeStr}
                    </span>
                </div>

                {/* Image Column */}
                <div
                    style={{
                        width: `${COL_IMAGE_WIDTH_PX}px`,
                        flexShrink: 0,
                        padding: "4px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRight: "1px solid #e5e7eb",
                        boxSizing: "border-box",
                    }}
                >
                    {imageDataUrl ? (
                        <img
                            src={imageDataUrl}
                            alt=""
                            style={{
                                maxWidth: `${IMAGE_SIZE_PX}px`,
                                maxHeight: `${IMAGE_SIZE_PX}px`,
                                width: "auto",
                                height: "auto",
                                borderRadius: "2px",
                            }}
                        />
                    ) : hasImage ? (
                        <div
                            style={{
                                width: `${IMAGE_SIZE_PX}px`,
                                height: `${IMAGE_SIZE_PX}px`,
                                backgroundColor: "#e5e7eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: "2px",
                            }}
                        >
                            <span style={{ fontSize: "8px", color: "#6b7280" }}>
                                Image
                            </span>
                        </div>
                    ) : (
                        <div
                            style={{
                                width: `${IMAGE_SIZE_PX}px`,
                                height: `${IMAGE_SIZE_PX}px`,
                                backgroundColor: "#f9fafb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                border: "1px dashed #d1d5db",
                                borderRadius: "2px",
                                boxSizing: "border-box",
                            }}
                        >
                            <span style={{ fontSize: "7px", color: "#9ca3af" }}>
                                No Image
                            </span>
                        </div>
                    )}
                </div>

                {/* Instagram Post Column */}
                <div
                    style={{
                        width: `${COL_IG_WIDTH_PX}px`,
                        flexShrink: 0,
                        padding: "8px",
                        borderRight: "1px solid #e5e7eb",
                        boxSizing: "border-box",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            fontSize: `${FONT_SIZE_PT}px`,
                            color: "#374151",
                            lineHeight: LINE_HEIGHT,
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {igCaption || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>(No text)</span>}
                    </div>
                </div>

                {/* Facebook Post Column */}
                <div
                    style={{
                        width: `${COL_FB_WIDTH_PX}px`,
                        flexShrink: 0,
                        padding: "8px",
                        boxSizing: "border-box",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            fontSize: `${FONT_SIZE_PT}px`,
                            color: "#374151",
                            lineHeight: LINE_HEIGHT,
                            wordBreak: "break-word",
                            whiteSpace: "pre-wrap",
                        }}
                    >
                        {fbCaption || <span style={{ color: "#9ca3af", fontStyle: "italic" }}>(No text)</span>}
                    </div>
                </div>
            </div>
        );
    }
);

export default PostsPdfRow;
