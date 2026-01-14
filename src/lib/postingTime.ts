import { toZonedTime } from "date-fns-tz";
import { getDay, parseISO } from "date-fns";
import { PostDay } from "./types";
import { DENVER_TZ } from "./utils";

/**
 * Posting windows for each day of the week (America/Denver time).
 * Times are in minutes from midnight.
 * Sunday = 0, Monday = 1, ..., Saturday = 6
 */
interface TimeWindow {
    startMinutes: number;
    endMinutes: number;
    fixed?: boolean;
}

const POSTING_WINDOWS: Record<number, TimeWindow> = {
    0: { startMinutes: 16 * 60, endMinutes: 18 * 60 },           // Sunday: 16:00-18:00
    1: { startMinutes: 15 * 60, endMinutes: 17 * 60 },           // Monday: 15:00-17:00
    2: { startMinutes: 11 * 60, endMinutes: 13 * 60 },           // Tuesday: 11:00-13:00
    3: { startMinutes: 19 * 60, endMinutes: 21 * 60 },           // Wednesday: 19:00-21:00
    4: { startMinutes: 15 * 60 + 30, endMinutes: 17 * 60 },      // Thursday: 15:30-17:00
    5: { startMinutes: 9 * 60, endMinutes: 11 * 60 },            // Friday: 09:00-11:00
    6: { startMinutes: 10 * 60, endMinutes: 10 * 60, fixed: true }, // Saturday: 10:00 fixed
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
 */
export function getWindowForDateDenver(dateISO: string): TimeWindow {
    const dayOfWeek = getDayOfWeekDenver(dateISO);
    return POSTING_WINDOWS[dayOfWeek];
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
 *
 * @param dateISO - The date in YYYY-MM-DD format
 * @param seed - Optional seed for deterministic randomness. If not provided, uses dateISO.
 * @returns Time string in "HH:MM" format
 */
export function randomTimeInWindow5Min(dateISO: string, seed?: string): string {
    const window = getWindowForDateDenver(dateISO);

    // Fixed time (Saturday)
    if (window.fixed) {
        return minutesToTimeString(window.startMinutes);
    }

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
 * Generates a new posting time for a date change.
 * Uses current timestamp in seed to ensure a new random time.
 */
export function generatePostingTimeForDateChange(newDate: string): string {
    const seed = `${newDate}-${Date.now()}`;
    return randomTimeInWindow5Min(newDate, seed);
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
 */
export function getWindowDescription(dateISO: string): string {
    const window = getWindowForDateDenver(dateISO);
    const dayName = getWeekdayNameDenver(dateISO);

    if (window.fixed) {
        return `${dayName}: ${minutesToTimeString(window.startMinutes)} (fixed)`;
    }

    return `${dayName}: ${minutesToTimeString(window.startMinutes)}–${minutesToTimeString(window.endMinutes)}`;
}
