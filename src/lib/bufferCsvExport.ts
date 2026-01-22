import { PostDay } from "./types";
import { randomPlatformTimeInWindow5Min } from "./postingTime";
import { parseISO, format } from "date-fns";

export type BufferPlatform = "instagram" | "facebook";

/**
 * Formats date and time for Buffer CSV export.
 * Format: M/D/YY HH:mm (e.g., "1/23/26 17:30")
 */
function formatBufferDateTime(dateISO: string, time: string): string {
    const date = parseISO(dateISO);
    const [hours, minutes] = time.split(":");

    // Format: M/D/YY (no leading zeros on month/day, 2-digit year)
    const dateStr = format(date, "M/d/yy");

    // Time is already in HH:mm format
    return `${dateStr} ${hours}:${minutes}`;
}

export interface ExportResult {
    csv: string;
    exportedCount: number;
    skippedNoImage: number;
    skippedNoCaption: number;
    skippedDates: string[];
}

export interface ExportSummary {
    exported: number;
    skippedNoImage: number;
    skippedNoCaption: number;
}

/**
 * Escapes a string for CSV format.
 * - Wraps in double quotes
 * - Escapes internal double quotes by doubling them
 */
function escapeCsvField(value: string): string {
    // Replace any double quotes with two double quotes
    const escaped = value.replace(/"/g, '""');
    // Wrap in double quotes
    return `"${escaped}"`;
}

/**
 * Builds Buffer-compatible text with hashtags appended.
 * - Caption text first
 * - Two line breaks
 * - Space-separated hashtags with # symbols
 */
export function buildBufferText(caption: string, hashtags: string[]): string {
    if (!hashtags || hashtags.length === 0) {
        return caption;
    }

    // Ensure each hashtag has # prefix
    const formattedHashtags = hashtags
        .map((tag) => {
            const trimmed = tag.trim();
            if (!trimmed) return "";
            return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
        })
        .filter((tag) => tag.length > 0);

    if (formattedHashtags.length === 0) {
        return caption;
    }

    // Caption + two line breaks + space-separated hashtags
    return `${caption}\n\n${formattedHashtags.join(" ")}`;
}

/**
 * Resolves the image URL for a post.
 * Priority:
 * 1. post.imageUrl (direct URL set by importImageFromUrl)
 * 2. imageUrls map lookup by imageAssetId
 * 3. undefined if no image
 */
export function resolveImageUrl(
    post: PostDay,
    imageUrls: Map<string, string>
): string | undefined {
    // First check direct imageUrl on the post
    if (post.imageUrl) {
        return post.imageUrl;
    }
    // Fall back to asset lookup
    if (post.imageAssetId) {
        return imageUrls.get(post.imageAssetId);
    }
    return undefined;
}

/**
 * Checks if a post has an image that can be exported.
 */
export function postHasImage(
    post: PostDay,
    imageUrls: Map<string, string>
): boolean {
    return !!resolveImageUrl(post, imageUrls);
}

/**
 * Generates a Buffer-compatible CSV for bulk upload.
 *
 * Buffer CSV format:
 * Text,Image URL,Tags,Posting Time
 *
 * - Text: Caption + two line breaks + space-separated hashtags (with # symbols)
 * - Image URL: Firebase Storage download URL
 * - Tags: Empty (not used for hashtags)
 * - Posting Time: M/D/YY HH:mm format (e.g., "1/23/26 17:30")
 */
export function generateBufferCsv(
    posts: PostDay[],
    platform: BufferPlatform,
    imageUrls: Map<string, string>
): ExportResult {
    const header = "Text,Image URL,Tags,Posting Time";
    const rows: string[] = [header];

    let exportedCount = 0;
    let skippedNoImage = 0;
    let skippedNoCaption = 0;
    const skippedDates: string[] = [];

    for (const post of posts) {
        // Resolve image URL (check post.imageUrl first, then asset lookup)
        const imageUrl = resolveImageUrl(post, imageUrls);

        if (!imageUrl) {
            // DEBUG: Log skipped posts for image issues
            console.debug("[BufferExport] Skipped - no image:", {
                date: post.date,
                imageAssetId: post.imageAssetId,
                imageUrl: post.imageUrl,
                assetUrlFound: post.imageAssetId ? imageUrls.has(post.imageAssetId) : false,
            });
            skippedNoImage++;
            skippedDates.push(post.date);
            continue;
        }

        // Get caption and hashtags for the platform
        const platformData = platform === "instagram" ? post.ai?.ig : post.ai?.fb;
        if (!platformData?.caption) {
            // DEBUG: Log skipped posts for caption issues
            console.debug("[BufferExport] Skipped - no caption:", {
                date: post.date,
                platform,
                hasIgCaption: !!post.ai?.ig?.caption,
                hasFbCaption: !!post.ai?.fb?.caption,
            });
            skippedNoCaption++;
            skippedDates.push(post.date);
            continue;
        }

        // Build text with caption + hashtags
        const text = buildBufferText(platformData.caption, platformData.hashtags || []);

        // Get platform-specific posting time - generate if missing
        const postingTime = platform === "instagram"
            ? (post.postingTimeIg || randomPlatformTimeInWindow5Min(post.date, "instagram", post.date))
            : (post.postingTimeFb || randomPlatformTimeInWindow5Min(post.date, "facebook", post.date));

        // Format posting time for Buffer: M/D/YY HH:mm (e.g., "1/23/26 17:30")
        const formattedPostingTime = formatBufferDateTime(post.date, postingTime);

        // Create CSV row: Text,Image URL,Tags,Posting Time
        const row = [
            escapeCsvField(text),
            escapeCsvField(imageUrl),
            "",  // Tags - empty (hashtags are in Text field)
            escapeCsvField(formattedPostingTime),
        ].join(",");

        rows.push(row);
        exportedCount++;
    }

    return {
        csv: rows.join("\n"),
        exportedCount,
        skippedNoImage,
        skippedNoCaption,
        skippedDates,
    };
}

/**
 * Triggers a download of a CSV file in the browser.
 */
export function downloadCsv(content: string, filename: string): void {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
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
 * Generates a ZIP file containing CSVs for multiple platforms.
 */
export async function generateMultiPlatformZip(
    posts: PostDay[],
    platforms: BufferPlatform[],
    imageUrls: Map<string, string>
): Promise<{ blob: Blob; summary: ExportSummary }> {
    // Dynamic import of jszip to keep bundle size down
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();

    let totalExported = 0;
    let totalSkippedNoImage = 0;
    let totalSkippedNoCaption = 0;

    for (const platform of platforms) {
        const result = generateBufferCsv(posts, platform, imageUrls);
        const filename = `buffer-${platform}-${formatDateForFilename()}.csv`;
        zip.file(filename, result.csv);

        // Only count unique skips (a post skipped for both platforms counts once)
        if (platform === platforms[0]) {
            totalSkippedNoImage = result.skippedNoImage;
            totalSkippedNoCaption = result.skippedNoCaption;
        }
        totalExported = Math.max(totalExported, result.exportedCount);
    }

    const blob = await zip.generateAsync({ type: "blob" });

    return {
        blob,
        summary: {
            exported: totalExported,
            skippedNoImage: totalSkippedNoImage,
            skippedNoCaption: totalSkippedNoCaption,
        },
    };
}

/**
 * Triggers a download of a ZIP file in the browser.
 */
export function downloadZip(blob: Blob, filename: string): void {
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
 * Formats current date for use in filenames (YYYY-MM-DD).
 */
function formatDateForFilename(): string {
    const now = new Date();
    return now.toISOString().split("T")[0];
}

/**
 * Generates a filename for the export.
 */
export function getExportFilename(platform: BufferPlatform | "all"): string {
    const date = formatDateForFilename();
    if (platform === "all") {
        return `buffer-export-${date}.zip`;
    }
    return `buffer-${platform}-${date}.csv`;
}
