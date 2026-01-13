import { formatInTimeZone } from "date-fns-tz";
import { parseISO, isBefore, isToday, isAfter } from "date-fns";

export const DENVER_TZ = "America/Denver";

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
