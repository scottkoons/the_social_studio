import { formatInTimeZone } from "date-fns-tz";
import { parseISO, isBefore, isToday, isAfter } from "date-fns";

export const DENVER_TZ = "America/Denver";

/**
 * Parses a date string from CSV in either format:
 * - YYYY-MM-DD (ISO format)
 * - MM/DD/YY (Buffer-style format)
 *
 * Returns normalized YYYY-MM-DD string or null if invalid.
 * Uses strict parsing - no Date constructor guessing.
 */
export function parseCsvDate(input: string): string | null {
    if (!input || typeof input !== "string") {
        return null;
    }

    const trimmed = input.trim();
    if (!trimmed) {
        return null;
    }

    // Try ISO format: YYYY-MM-DD
    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) {
        const [, year, month, day] = isoMatch;
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const d = parseInt(day, 10);

        // Validate ranges
        if (m < 1 || m > 12 || d < 1 || d > 31) {
            return null;
        }

        // Validate it's a real date
        const testDate = new Date(y, m - 1, d);
        if (
            testDate.getFullYear() !== y ||
            testDate.getMonth() !== m - 1 ||
            testDate.getDate() !== d
        ) {
            return null;
        }

        return trimmed;
    }

    // Try Buffer format: MM/DD/YY or M/D/YY
    const bufferMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2})$/);
    if (bufferMatch) {
        const [, monthStr, dayStr, yearStr] = bufferMatch;
        const m = parseInt(monthStr, 10);
        const d = parseInt(dayStr, 10);
        const yy = parseInt(yearStr, 10);

        // Convert 2-digit year to 4-digit (assume 20xx for all values)
        const y = 2000 + yy;

        // Validate ranges
        if (m < 1 || m > 12 || d < 1 || d > 31) {
            return null;
        }

        // Validate it's a real date
        const testDate = new Date(y, m - 1, d);
        if (
            testDate.getFullYear() !== y ||
            testDate.getMonth() !== m - 1 ||
            testDate.getDate() !== d
        ) {
            return null;
        }

        // Return normalized ISO format
        const mm = String(m).padStart(2, "0");
        const dd = String(d).padStart(2, "0");
        return `${y}-${mm}-${dd}`;
    }

    // No valid format matched
    return null;
}

/**
 * Global hashtags that are automatically appended to all generated posts.
 */
export const GLOBAL_HASHTAGS = [
    "#ColoradoMountainBrewery",
    "#TrueTasteOfColorado",
    "#ColoradoSprings",
];

/**
 * Returns today's date string in YYYY-MM-DD format for America/Denver local time.
 */
export function getTodayInDenver(): string {
    return formatInTimeZone(new Date(), DENVER_TZ, "yyyy-MM-dd");
}

/**
 * Returns the current date object in Denver time.
 */
export function getDenverDate(): Date {
    const denverStr = formatInTimeZone(new Date(), DENVER_TZ, "yyyy-MM-dd'T'HH:mm:ssXXX");
    return new Date(denverStr);
}

/**
 * Checks if a YYYY-MM-DD string is today or in the past relative to Denver.
 */
export function isPastOrTodayInDenver(dateStr: string): boolean {
    const todayStr = getTodayInDenver();
    return dateStr <= todayStr;
}

/**
 * Checks if a YYYY-MM-DD string is strictly in the future relative to Denver.
 */
export function isStrictlyFutureInDenver(dateStr: string): boolean {
    const todayStr = getTodayInDenver();
    return dateStr > todayStr;
}

/**
 * Formats a YYYY-MM-DD date string for user display.
 * Format: "EEE MM/DD/YY" (e.g., "Fri 01/16/26")
 * Uses Denver timezone for weekday calculation.
 */
export function formatDisplayDate(dateStr: string): string {
    // Guard against empty or invalid date strings
    if (!dateStr || !dateStr.includes("-")) {
        return "";
    }

    const [year, month, day] = dateStr.split("-");
    const yy = year.slice(-2);

    // Parse date and get weekday in Denver timezone
    const date = parseISO(dateStr);
    const weekday = formatInTimeZone(date, DENVER_TZ, "EEE");

    return `${weekday} ${month}/${day}/${yy}`;
}

/**
 * Returns common flags for a post.
 */
export function computeFlags(post: { date: string, starterText?: string, imageAssetId?: string }): string[] {
    const flags: string[] = [];

    if (isPastOrTodayInDenver(post.date)) {
        flags.push("Past date");
    }

    if (!post.imageAssetId) {
        flags.push("Missing image");
    }

    if (!post.starterText && !post.imageAssetId) {
        flags.push("Needs info");
    }

    return flags;
}

/**
 * Returns a stub confidence score.
 */
export function computeConfidence(post: { starterText?: string }): number {
    return post.starterText ? 0.7 : 0.5;
}

/**
 * Normalizes a single hashtag:
 * - Trims whitespace
 * - Prepends # if not present
 * - Preserves original casing
 */
export function normalizeHashtag(tag: string): string {
    const trimmed = tag.trim();
    if (!trimmed) return "";
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * Normalizes an array of hashtags:
 * - Trims whitespace from each
 * - Drops empty values
 * - Prepends # if not present
 * - Preserves original casing
 */
export function normalizeHashtagsArray(tags: string[]): string[] {
    return tags
        .map(tag => normalizeHashtag(tag))
        .filter(tag => tag !== "" && tag !== "#");
}

/**
 * Normalizes a comma-separated hashtag string:
 * - Splits by commas
 * - Normalizes each tag
 * - Returns comma+space joined string
 * Input: "OctoberSpecial, BeetSalad, #GoatCheese"
 * Output: "#OctoberSpecial, #BeetSalad, #GoatCheese"
 */
export function normalizeHashtagsString(input: string): string {
    if (!input || !input.trim()) return "";
    const tags = input.split(",");
    const normalized = normalizeHashtagsArray(tags);
    return normalized.join(", ");
}

/**
 * Appends global hashtags to an array of hashtags.
 * - Case-insensitive deduplication
 * - Preserves original order
 * - Appends globals at the end
 */
export function appendGlobalHashtags(hashtags: string[]): string[] {
    const lowerSet = new Set(hashtags.map(tag => tag.toLowerCase()));
    const result = [...hashtags];

    for (const globalTag of GLOBAL_HASHTAGS) {
        if (!lowerSet.has(globalTag.toLowerCase())) {
            result.push(globalTag);
            lowerSet.add(globalTag.toLowerCase());
        }
    }

    return result;
}

/**
 * Deep-removes undefined values from an object for safe Firestore writes.
 * Firestore throws "Unsupported field value: undefined" if any field is undefined.
 * This function recursively strips undefined from nested objects.
 */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined) {
            continue;
        }
        if (value !== null && typeof value === "object" && !Array.isArray(value) && !(value instanceof Date)) {
            // Check if it's a Firestore FieldValue (has _methodName property) - don't recurse into those
            if ("_methodName" in value) {
                result[key] = value;
            } else {
                result[key] = stripUndefined(value as Record<string, unknown>);
            }
        } else {
            result[key] = value;
        }
    }

    return result as T;
}
