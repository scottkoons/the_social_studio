import { PostDay } from "./types";
import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { DENVER_TZ } from "./utils";

/**
 * Posts PDF Export Utilities
 *
 * Generates LANDSCAPE PDF with TABLE layout.
 * Columns: Date/Time | Image | Instagram Post | Facebook Post
 * 6 rows per page with alternating white/cream backgrounds.
 */

// Page dimensions for US Letter LANDSCAPE (in points)
export const PAGE_WIDTH_PT = 792;  // 11 inches
export const PAGE_HEIGHT_PT = 612; // 8.5 inches
export const PAGE_MARGIN_PT = 24;  // margins

// Content area
export const CONTENT_WIDTH_PT = PAGE_WIDTH_PT - (PAGE_MARGIN_PT * 2);
export const CONTENT_HEIGHT_PT = PAGE_HEIGHT_PT - (PAGE_MARGIN_PT * 2);

// Layout heights
export const TITLE_HEIGHT_PT = 36;
export const HEADER_ROW_HEIGHT_PT = 28;
export const PAGE_FOOTER_HEIGHT_PT = 16;

// Table row dimensions
export const ROWS_PER_PAGE = 4; // 4 rows per page for taller rows to fit full text
export const TABLE_AREA_HEIGHT_PT = CONTENT_HEIGHT_PT - TITLE_HEIGHT_PT - HEADER_ROW_HEIGHT_PT - PAGE_FOOTER_HEIGHT_PT - 12; // Account for title margin
export const ROW_HEIGHT_PT = Math.floor(TABLE_AREA_HEIGHT_PT / ROWS_PER_PAGE);

// Column widths (proportional)
export const COL_DATE_WIDTH_PT = 100;
export const COL_IMAGE_WIDTH_PT = 90;
export const COL_IG_WIDTH_PT = Math.floor((CONTENT_WIDTH_PT - COL_DATE_WIDTH_PT - COL_IMAGE_WIDTH_PT) / 2);
export const COL_FB_WIDTH_PT = CONTENT_WIDTH_PT - COL_DATE_WIDTH_PT - COL_IMAGE_WIDTH_PT - COL_IG_WIDTH_PT;

// Pixel equivalents
export const PAGE_WIDTH_PX = PAGE_WIDTH_PT;
export const PAGE_HEIGHT_PX = PAGE_HEIGHT_PT;
export const PAGE_MARGIN_PX = PAGE_MARGIN_PT;
export const CONTENT_WIDTH_PX = CONTENT_WIDTH_PT;
export const TITLE_HEIGHT_PX = TITLE_HEIGHT_PT;
export const HEADER_ROW_HEIGHT_PX = HEADER_ROW_HEIGHT_PT;
export const ROW_HEIGHT_PX = ROW_HEIGHT_PT;
export const PAGE_FOOTER_HEIGHT_PX = PAGE_FOOTER_HEIGHT_PT;
export const COL_DATE_WIDTH_PX = COL_DATE_WIDTH_PT;
export const COL_IMAGE_WIDTH_PX = COL_IMAGE_WIDTH_PT;
export const COL_IG_WIDTH_PX = COL_IG_WIDTH_PT;
export const COL_FB_WIDTH_PX = COL_FB_WIDTH_PT;

// Typography
export const FONT_SIZE_PT = 8;
export const LINE_HEIGHT = 1.35;
export const IMAGE_SIZE_PX = 70;

// Title spacing
export const TITLE_MARGIN_BOTTOM_PX = 12;

// Row colors
export const ROW_COLOR_WHITE = "#ffffff";
export const ROW_COLOR_CREAM = "#fef9e7"; // Light yellow/cream
export const HEADER_COLOR = "#ABB9CA"; // Light blue-gray

/**
 * Groups posts by month (YYYY-MM format) in Denver timezone.
 */
export function groupPostsByMonth(posts: PostDay[]): Map<string, PostDay[]> {
    const grouped = new Map<string, PostDay[]>();

    for (const post of posts) {
        const date = parseISO(post.date);
        const denverDate = toZonedTime(date, DENVER_TZ);
        const monthKey = format(denverDate, "yyyy-MM");

        if (!grouped.has(monthKey)) {
            grouped.set(monthKey, []);
        }
        grouped.get(monthKey)!.push(post);
    }

    // Sort posts within each month by date
    for (const [key, monthPosts] of grouped) {
        monthPosts.sort((a, b) => a.date.localeCompare(b.date));
        grouped.set(key, monthPosts);
    }

    return new Map([...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0])));
}

/**
 * Returns the month label for display.
 */
export function getMonthLabel(monthKey: string, isContinuation = false): string {
    const [year, month] = monthKey.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const label = format(date, "MMMM yyyy");
    return isContinuation ? `${label} (cont.)` : label;
}

/**
 * Generates PDF filename based on date range.
 */
export function getPostsPdfFilename(posts: PostDay[]): string {
    if (posts.length === 0) {
        return `posts-pdf-${format(new Date(), "yyyy-MM")}.pdf`;
    }

    const dates = posts.map(p => p.date).sort();
    const startMonth = format(toZonedTime(parseISO(dates[0]), DENVER_TZ), "yyyy-MM");
    const endMonth = format(toZonedTime(parseISO(dates[dates.length - 1]), DENVER_TZ), "yyyy-MM");

    return startMonth === endMonth
        ? `posts-pdf-${startMonth}.pdf`
        : `posts-pdf-${startMonth}_to_${endMonth}.pdf`;
}

export type PostsPdfExportPhase = "preparing" | "rendering" | "finalizing";

export interface PostsPdfExportProgress {
    phase: PostsPdfExportPhase;
    current: number;
    total: number;
    detail?: string;
}

export function getPhaseText(progress: PostsPdfExportProgress): string {
    switch (progress.phase) {
        case "preparing":
            return "Preparing images...";
        case "rendering":
            return `Rendering page ${progress.current} of ${progress.total}`;
        case "finalizing":
            return "Finalizing PDF...";
        default:
            return "Processing...";
    }
}

/**
 * Represents a page in the PDF output.
 */
export interface PdfPage {
    posts: PostDay[];
    pageNumber: number;
    totalPages: number;
}

/**
 * Paginates posts into pages (6 posts per page).
 */
export function paginatePosts(posts: PostDay[]): PdfPage[] {
    const pages: PdfPage[] = [];
    const sortedPosts = [...posts].sort((a, b) => a.date.localeCompare(b.date));

    let remaining = sortedPosts;
    while (remaining.length > 0) {
        pages.push({
            posts: remaining.slice(0, ROWS_PER_PAGE),
            pageNumber: 0,
            totalPages: 0,
        });
        remaining = remaining.slice(ROWS_PER_PAGE);
    }

    // Set page numbers
    const totalPages = pages.length;
    pages.forEach((page, i) => {
        page.pageNumber = i + 1;
        page.totalPages = totalPages;
    });

    return pages;
}

/**
 * Formats a time string (HH:MM) to display format (h:mmAM/PM)
 */
function formatTime(time: string | undefined, fallback = "12:00PM"): string {
    if (!time) return fallback;
    const [hours, minutes] = time.split(":").map(Number);
    const period = hours >= 12 ? "PM" : "AM";
    const displayHours = hours % 12 || 12;
    return `${displayHours}:${minutes.toString().padStart(2, "0")}${period}`;
}

/**
 * Formats date/time for display in the table.
 * Format:
 *   "1/23/26
 *    FB: 9:20AM
 *    IG: 9:25AM"
 */
export function formatDateTimeForTable(post: PostDay): string {
    const date = parseISO(post.date);
    const denverDate = toZonedTime(date, DENVER_TZ);
    const dateStr = format(denverDate, "M/dd/yy");

    // Get FB and IG times (fall back to legacy postingTime if platform-specific not set)
    const fbTime = formatTime(post.postingTimeFb || post.postingTime);
    const igTime = formatTime(post.postingTimeIg || post.postingTime);

    return `${dateStr}\nFB: ${fbTime}\nIG: ${igTime}`;
}

/**
 * Triggers a download of a PDF blob.
 */
export function downloadPdf(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

/**
 * Waits for animation frames.
 */
export function waitForFrames(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}
