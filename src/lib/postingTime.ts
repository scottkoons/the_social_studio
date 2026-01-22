import { toZonedTime } from "date-fns-tz";
import { getDay, parseISO } from "date-fns";
import { PostDay } from "./types";
import { DENVER_TZ } from "./utils";

/**
 * Platform-specific posting windows for each day of the week (America/Denver time).
 * Times are in minutes from midnight.
 * Sunday = 0, Monday = 1, ..., Saturday = 6
 *
 * Instagram is optimized for visual/cravings timing.
 * Facebook is optimized for info/community timing.
 */
interface TimeWindow {
    startMinutes: number;
    endMinutes: number;
}

export type PostingPlatform = "instagram" | "facebook";

// Instagram posting windows
const IG_WINDOWS: Record<number, TimeWindow[]> = {
    0: [{ startMinutes: 9 * 60, endMinutes: 14 * 60 }],              // Sunday: 9:00 AM – 2:00 PM
    1: [{ startMinutes: 11 * 60 + 30, endMinutes: 13 * 60 + 30 }],   // Monday: 11:30 AM – 1:30 PM
    2: [{ startMinutes: 11 * 60 + 30, endMinutes: 13 * 60 + 30 }],   // Tuesday: 11:30 AM – 1:30 PM
    3: [{ startMinutes: 11 * 60, endMinutes: 13 * 60 }],             // Wednesday: 11:00 AM – 1:00 PM
    4: [{ startMinutes: 11 * 60, endMinutes: 13 * 60 }],             // Thursday: 11:00 AM – 1:00 PM
    5: [                                                              // Friday: 9:00 AM – 11:00 AM AND 3:00 PM – 5:00 PM
        { startMinutes: 9 * 60, endMinutes: 11 * 60 },
        { startMinutes: 15 * 60, endMinutes: 17 * 60 }
    ],
    6: [{ startMinutes: 10 * 60, endMinutes: 13 * 60 }],             // Saturday: 10:00 AM – 1:00 PM
};

// Facebook posting windows
const FB_WINDOWS: Record<number, TimeWindow[]> = {
    0: [{ startMinutes: 10 * 60, endMinutes: 13 * 60 }],             // Sunday: 10:00 AM – 1:00 PM
    1: [{ startMinutes: 12 * 60, endMinutes: 15 * 60 }],             // Monday: 12:00 PM – 3:00 PM
    2: [{ startMinutes: 12 * 60, endMinutes: 15 * 60 }],             // Tuesday: 12:00 PM – 3:00 PM
    3: [{ startMinutes: 11 * 60, endMinutes: 14 * 60 }],             // Wednesday: 11:00 AM – 2:00 PM
    4: [{ startMinutes: 13 * 60, endMinutes: 16 * 60 }],             // Thursday: 1:00 PM – 4:00 PM
    5: [{ startMinutes: 11 * 60, endMinutes: 13 * 60 }],             // Friday: 11:00 AM – 1:00 PM
    6: [{ startMinutes: 9 * 60, endMinutes: 11 * 60 }],              // Saturday: 9:00 AM – 11:00 AM
};

// Legacy single window (for backward compatibility - uses combined average)
const POSTING_WINDOWS: Record<number, TimeWindow> = {
    0: { startMinutes: 9 * 60, endMinutes: 14 * 60 },           // Sunday
    1: { startMinutes: 11 * 60 + 30, endMinutes: 15 * 60 },     // Monday
    2: { startMinutes: 11 * 60 + 30, endMinutes: 15 * 60 },     // Tuesday
    3: { startMinutes: 11 * 60, endMinutes: 14 * 60 },          // Wednesday
    4: { startMinutes: 11 * 60, endMinutes: 16 * 60 },          // Thursday
    5: { startMinutes: 9 * 60, endMinutes: 13 * 60 },           // Friday
    6: { startMinutes: 9 * 60, endMinutes: 13 * 60 },           // Saturday
};

/**
 * Simple seeded random number generator using a string seed.
 * Returns a number between 0 and 1.
 */
function seededRandom(seed: string): number {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        const char = seed.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to positive number between 0 and 1
    const x = Math.sin(hash) * 10000;
    return x - Math.floor(x);
}

/**
 * Gets the day of week for a date string in Denver timezone.
 * Returns 0-6 where 0 = Sunday.
 */
export function getDayOfWeekDenver(dateISO: string): number {
    const date = parseISO(dateISO);
    const denverDate = toZonedTime(date, DENVER_TZ);
    return getDay(denverDate);
}

/**
 * Gets the posting window for a given date (based on weekday in Denver time).
 * Legacy function for backward compatibility.
 */
export function getWindowForDateDenver(dateISO: string): TimeWindow {
    const dayOfWeek = getDayOfWeekDenver(dateISO);
    return POSTING_WINDOWS[dayOfWeek];
}

/**
 * Gets the platform-specific posting windows for a given date.
 * Returns an array of windows (Friday Instagram has two windows).
 */
export function getPlatformWindowsForDate(dateISO: string, platform: PostingPlatform): TimeWindow[] {
    const dayOfWeek = getDayOfWeekDenver(dateISO);
    return platform === "instagram" ? IG_WINDOWS[dayOfWeek] : FB_WINDOWS[dayOfWeek];
}

/**
 * Converts minutes from midnight to "HH:MM" format.
 */
export function minutesToTimeString(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Converts "HH:MM" format to minutes from midnight.
 */
export function timeStringToMinutes(time: string): number {
    const [hours, mins] = time.split(":").map(Number);
    return hours * 60 + mins;
}

/**
 * Generates a random time within the posting window for a given date.
 * Times are in 5-minute increments.
 * Legacy function - uses combined windows.
 *
 * @param dateISO - The date in YYYY-MM-DD format
 * @param seed - Optional seed for deterministic randomness. If not provided, uses dateISO.
 * @returns Time string in "HH:MM" format
 */
export function randomTimeInWindow5Min(dateISO: string, seed?: string): string {
    const window = getWindowForDateDenver(dateISO);

    // Calculate number of 5-minute slots in the window (inclusive of both ends)
    const slots = Math.floor((window.endMinutes - window.startMinutes) / 5) + 1;

    // Use seeded random to pick a slot
    const effectiveSeed = seed || dateISO;
    const randomValue = seededRandom(effectiveSeed);
    const slotIndex = Math.floor(randomValue * slots);

    // Convert slot to minutes
    const minutes = window.startMinutes + (slotIndex * 5);

    return minutesToTimeString(minutes);
}

/**
 * Generates a random time within the platform-specific posting window for a given date.
 * Handles platforms with multiple windows (e.g., Friday Instagram).
 * Times are in 5-minute increments.
 *
 * @param dateISO - The date in YYYY-MM-DD format
 * @param platform - "instagram" or "facebook"
 * @param seed - Optional seed for deterministic randomness
 * @returns Time string in "HH:MM" format
 */
export function randomPlatformTimeInWindow5Min(
    dateISO: string,
    platform: PostingPlatform,
    seed?: string
): string {
    const windows = getPlatformWindowsForDate(dateISO, platform);
    const effectiveSeed = seed || `${dateISO}-${platform}`;

    // If multiple windows, first pick which window to use
    let selectedWindow: TimeWindow;
    if (windows.length > 1) {
        const windowRandom = seededRandom(effectiveSeed + "-window");
        const windowIndex = Math.floor(windowRandom * windows.length);
        selectedWindow = windows[windowIndex];
    } else {
        selectedWindow = windows[0];
    }

    // Calculate number of 5-minute slots in the window
    const slots = Math.floor((selectedWindow.endMinutes - selectedWindow.startMinutes) / 5) + 1;

    // Use seeded random to pick a slot
    const randomValue = seededRandom(effectiveSeed);
    const slotIndex = Math.floor(randomValue * slots);

    // Convert slot to minutes
    const minutes = selectedWindow.startMinutes + (slotIndex * 5);

    return minutesToTimeString(minutes);
}

/**
 * Generates both Instagram and Facebook posting times for a date.
 */
export function generatePlatformPostingTimes(dateISO: string, seed?: string): {
    ig: string;
    fb: string;
} {
    const baseSeed = seed || dateISO;
    return {
        ig: randomPlatformTimeInWindow5Min(dateISO, "instagram", baseSeed + "-ig"),
        fb: randomPlatformTimeInWindow5Min(dateISO, "facebook", baseSeed + "-fb"),
    };
}

/**
 * Generates a new posting time for a date change.
 * Uses current timestamp in seed to ensure a new random time.
 * Legacy function - returns a single time.
 */
export function generatePostingTimeForDateChange(newDate: string): string {
    const seed = `${newDate}-${Date.now()}`;
    return randomTimeInWindow5Min(newDate, seed);
}

/**
 * Generates new platform-specific posting times for a date change.
 * Uses current timestamp in seed to ensure new random times.
 */
export function generatePlatformPostingTimesForDateChange(newDate: string): {
    ig: string;
    fb: string;
} {
    const seed = `${newDate}-${Date.now()}`;
    return generatePlatformPostingTimes(newDate, seed);
}

/**
 * Rounds a time string to the nearest 5-minute increment.
 */
export function roundToNearest5Min(time: string): string {
    const minutes = timeStringToMinutes(time);
    const rounded = Math.round(minutes / 5) * 5;
    return minutesToTimeString(rounded);
}

/**
 * Ensures a post has a posting time. If missing, generates one.
 * Returns the updated post data (does not mutate original).
 */
export function ensurePostingTime(post: PostDay): PostDay {
    if (post.postingTime) {
        return post;
    }

    // Generate time using date as seed for stability
    const postingTime = randomTimeInWindow5Min(post.date, post.date);

    return {
        ...post,
        postingTime,
        postingTimeSource: "auto",
    };
}

/**
 * Formats a time string for display (12-hour format with AM/PM).
 * Input: "HH:MM" (24-hour)
 * Output: "h:MM AM/PM"
 */
export function formatTimeForDisplay(time: string): string {
    const [hoursStr, minsStr] = time.split(":");
    let hours = parseInt(hoursStr, 10);
    const mins = minsStr;

    const period = hours >= 12 ? "PM" : "AM";

    if (hours === 0) {
        hours = 12;
    } else if (hours > 12) {
        hours -= 12;
    }

    return `${hours}:${mins} ${period}`;
}

/**
 * Formats date and time for Buffer CSV export.
 * Buffer format: YYYY-MM-DD HH:MM (24-hour)
 *
 * @param dateISO - Date in YYYY-MM-DD format
 * @param time - Time in HH:MM format (24-hour)
 * @returns Formatted string "YYYY-MM-DD HH:MM"
 */
export function formatForBufferExport(dateISO: string, time: string): string {
    // dateISO is already in YYYY-MM-DD format, time is already HH:MM
    return `${dateISO} ${time}`;
}

/**
 * Gets the weekday name for a date in Denver timezone.
 */
export function getWeekdayNameDenver(dateISO: string): string {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const dayOfWeek = getDayOfWeekDenver(dateISO);
    return dayNames[dayOfWeek];
}

/**
 * Gets a human-readable description of the posting window for a date.
 * Legacy function - shows combined window.
 */
export function getWindowDescription(dateISO: string): string {
    const window = getWindowForDateDenver(dateISO);
    const dayName = getWeekdayNameDenver(dateISO);

    return `${dayName}: ${minutesToTimeString(window.startMinutes)}–${minutesToTimeString(window.endMinutes)}`;
}

/**
 * Gets a human-readable description of platform-specific posting windows for a date.
 */
export function getPlatformWindowDescription(dateISO: string, platform: PostingPlatform): string {
    const windows = getPlatformWindowsForDate(dateISO, platform);
    const dayName = getWeekdayNameDenver(dateISO);
    const platformLabel = platform === "instagram" ? "IG" : "FB";

    if (windows.length === 1) {
        const w = windows[0];
        return `${dayName} ${platformLabel}: ${minutesToTimeString(w.startMinutes)}–${minutesToTimeString(w.endMinutes)}`;
    }

    // Multiple windows (Friday Instagram)
    const windowStrs = windows.map(w =>
        `${minutesToTimeString(w.startMinutes)}–${minutesToTimeString(w.endMinutes)}`
    ).join(" or ");
    return `${dayName} ${platformLabel}: ${windowStrs}`;
}
