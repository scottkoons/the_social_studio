import { formatInTimeZone } from "date-fns-tz";
import { parseISO, isBefore, isToday, isAfter } from "date-fns";

export const DENVER_TZ = "America/Denver";

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
