import { PostDay, getPostDocId } from "./types";

export interface TextCsvRow {
    platform: "IG" | "FB";
    date: string;
    postText: string;
}

export interface ParseResult {
    success: boolean;
    rows?: TextCsvRow[];
    error?: string;
}

export interface ImportValidationResult {
    valid: boolean;
    error?: string;
    matched: ImportMatch[];
    skipped: string[]; // keys not found in posts
}

export interface ImportMatch {
    key: string;
    postId: string;
    platform: "IG" | "FB";
    date: string;
    oldText: string;
    newText: string;
}

/**
 * Escapes a string for CSV format.
 * - Wraps in double quotes if contains comma, quote, or newline
 * - Escapes internal double quotes by doubling them
 */
function escapeCsvField(value: string): string {
    const needsQuotes = /[,"\n\r]/.test(value);
    if (!needsQuotes) {
        return value;
    }
    const escaped = value.replace(/"/g, '""');
    return `"${escaped}"`;
}

/**
 * Generates a CSV string for text export.
 */
export function generateTextCsv(posts: PostDay[]): string {
    const header = "platform,date,postText";
    const rows: string[] = [header];

    for (const post of posts) {
        // For each post, export both IG and FB captions if they exist
        const igCaption = post.ai?.ig?.caption || "";
        const fbCaption = post.ai?.fb?.caption || "";

        // Export IG row
        if (igCaption) {
            rows.push([
                "IG",
                post.date,
                escapeCsvField(igCaption),
            ].join(","));
        }

        // Export FB row
        if (fbCaption) {
            rows.push([
                "FB",
                post.date,
                escapeCsvField(fbCaption),
            ].join(","));
        }
    }

    return rows.join("\n");
}

/**
 * Parses a CSV line handling quoted fields with commas and newlines.
 */
function parseCsvLine(line: string): string[] {
    const fields: string[] = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (inQuotes) {
            if (char === '"') {
                // Check for escaped quote
                if (i + 1 < line.length && line[i + 1] === '"') {
                    current += '"';
                    i++; // Skip next quote
                } else {
                    inQuotes = false;
                }
            } else {
                current += char;
            }
        } else {
            if (char === '"') {
                inQuotes = true;
            } else if (char === ',') {
                fields.push(current.trim());
                current = "";
            } else {
                current += char;
            }
        }
    }

    // Add last field
    fields.push(current.trim());

    return fields;
}

/**
 * Parses CSV content that may have multi-line quoted fields.
 */
function parseFullCsv(content: string): string[][] {
    const rows: string[][] = [];
    const lines = content.split(/\r?\n/);

    let currentLine = "";
    let inQuotes = false;

    for (const line of lines) {
        if (currentLine) {
            currentLine += "\n" + line;
        } else {
            currentLine = line;
        }

        // Count quotes to determine if we're inside a quoted field
        const quoteCount = (currentLine.match(/"/g) || []).length;
        // Subtract escaped quotes (pairs of quotes inside quoted strings)
        // Simple heuristic: if odd number of quotes, we're still inside a quoted field
        inQuotes = quoteCount % 2 !== 0;

        if (!inQuotes) {
            if (currentLine.trim()) {
                rows.push(parseCsvLine(currentLine));
            }
            currentLine = "";
        }
    }

    // Handle any remaining line
    if (currentLine.trim()) {
        rows.push(parseCsvLine(currentLine));
    }

    return rows;
}

/**
 * Parses a text CSV file content.
 */
export function parseTextCsv(content: string): ParseResult {
    const rows = parseFullCsv(content);

    if (rows.length === 0) {
        return { success: false, error: "CSV file is empty" };
    }

    // Validate header
    const header = rows[0].map(h => h.toLowerCase().trim());
    const expectedHeader = ["platform", "date", "posttext"];

    if (header.length < 3 ||
        header[0] !== expectedHeader[0] ||
        header[1] !== expectedHeader[1] ||
        header[2] !== expectedHeader[2]) {
        return {
            success: false,
            error: `Invalid header. Expected: platform,date,postText. Got: ${rows[0].join(",")}`,
        };
    }

    const dataRows: TextCsvRow[] = [];
    const seenKeys = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];

        if (row.length < 3) {
            return {
                success: false,
                error: `Row ${i + 1} has insufficient columns (expected 3, got ${row.length})`,
            };
        }

        const platform = row[0].toUpperCase().trim();
        const date = row[1].trim();
        const postText = row[2];

        // Validate platform
        if (platform !== "IG" && platform !== "FB") {
            return {
                success: false,
                error: `Row ${i + 1}: Invalid platform "${platform}". Must be "IG" or "FB".`,
            };
        }

        // Validate date format (YYYY-MM-DD)
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
            return {
                success: false,
                error: `Row ${i + 1}: Invalid date format "${date}". Must be YYYY-MM-DD.`,
            };
        }

        // Check for empty postText
        if (!postText || postText.trim() === "") {
            return {
                success: false,
                error: `Row ${i + 1}: postText cannot be empty. This would wipe existing content.`,
            };
        }

        // Check for duplicate keys
        const key = `${platform}|${date}`;
        if (seenKeys.has(key)) {
            return {
                success: false,
                error: `Duplicate key found: ${platform} on ${date}. Each platform+date combination must be unique.`,
            };
        }
        seenKeys.add(key);

        dataRows.push({
            platform: platform as "IG" | "FB",
            date,
            postText,
        });
    }

    return { success: true, rows: dataRows };
}

/**
 * Builds a key for matching posts.
 */
export function buildKey(platform: "IG" | "FB", date: string): string {
    return `${platform}|${date}`;
}

/**
 * Validates import data against existing posts.
 */
export function validateImport(
    csvRows: TextCsvRow[],
    posts: PostDay[]
): ImportValidationResult {
    const matched: ImportMatch[] = [];
    const skipped: string[] = [];

    // Build a map of posts by platform+date key
    const postMap = new Map<string, { post: PostDay; postId: string }>();

    for (const post of posts) {
        const postId = getPostDocId(post);
        // Each post can have both IG and FB content
        postMap.set(buildKey("IG", post.date), { post, postId });
        postMap.set(buildKey("FB", post.date), { post, postId });
    }

    for (const row of csvRows) {
        const key = buildKey(row.platform, row.date);
        const postData = postMap.get(key);

        if (!postData) {
            skipped.push(key);
            continue;
        }

        const { post, postId } = postData;
        const oldText = row.platform === "IG"
            ? post.ai?.ig?.caption || ""
            : post.ai?.fb?.caption || "";

        matched.push({
            key,
            postId,
            platform: row.platform,
            date: row.date,
            oldText,
            newText: row.postText,
        });
    }

    return {
        valid: true,
        matched,
        skipped,
    };
}

/**
 * Triggers download of a text file.
 */
export function downloadTextCsv(content: string, filename: string): void {
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
 * Generates a filename for text export.
 */
export function getTextExportFilename(): string {
    const date = new Date().toISOString().split("T")[0];
    return `post-text-export-${date}.csv`;
}
