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
} from "@/lib/postsPdfExport";

interface PostsPdfRowProps {
    post: PostDay;
    rowIndex: number;
    imageDataUrl?: string;
    includeImages: boolean;
}

/**
 * Table row for Posts PDF export.
 * Columns: Date/Time | Image | Instagram Post | Facebook Post
 */
const PostsPdfRow = forwardRef<HTMLDivElement, PostsPdfRowProps>(
    function PostsPdfRow({ post, rowIndex, imageDataUrl, includeImages }, ref) {
        const hasImage = !!post.imageAssetId;
        const bgColor = rowIndex % 2 === 0 ? ROW_COLOR_WHITE : ROW_COLOR_CREAM;

        // Get captions (no hashtags)
        const igCaption = post.ai?.ig?.caption || "";
        const fbCaption = post.ai?.fb?.caption || "";

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
                    <div
                        style={{
                            width: `${IMAGE_SIZE_PX}px`,
                            height: `${IMAGE_SIZE_PX}px`,
                            borderRadius: "2px",
                            overflow: "hidden",
                            backgroundColor: "#f3f4f6",
                        }}
                    >
                        {includeImages && imageDataUrl ? (
                            <img
                                src={imageDataUrl}
                                alt=""
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "contain",
                                }}
                            />
                        ) : hasImage ? (
                            <div
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    backgroundColor: "#e5e7eb",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                }}
                            >
                                <span style={{ fontSize: "8px", color: "#6b7280" }}>
                                    Image
                                </span>
                            </div>
                        ) : (
                            <div
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    backgroundColor: "#f9fafb",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    border: "1px dashed #d1d5db",
                                    boxSizing: "border-box",
                                }}
                            >
                                <span style={{ fontSize: "7px", color: "#9ca3af" }}>
                                    No Image
                                </span>
                            </div>
                        )}
                    </div>
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
