/**
 * Planning Scheduler Module
 *
 * Handles generation of posting schedules for Facebook and Instagram platforms.
 * Supports CSV uploads with optional manual dates, automatic date assignment,
 * and posting time generation based on day-of-week windows.
 */

import { format, parseISO, eachDayOfInterval, getDay, differenceInDays } from "date-fns";
import { randomTimeInWindow5Min, getDayOfWeekDenver } from "./postingTime";
import { parseCsvDate } from "./utils";

// Platform types
export type Platform = "facebook" | "instagram";

// CSV row structure (after parsing)
export interface PlanningCsvRow {
    date?: string;        // YYYY-MM-DD (optional - AI assigns if missing)
    starterText: string;
    imageUrl: string;
}

// Generated plan slot
export interface PlanSlot {
    date: string;         // YYYY-MM-DD
    dayOfWeek: number;    // 0-6 (Sunday-Saturday)
    dayName: string;
}

// Plan structure
export interface GeneratedPlan {
    platform: Platform;
    startDate: string;
    endDate: string;
    postsPerWeek: number;
    totalSlots: number;
    slots: PlanSlot[];
    dayOfWeekBreakdown: Record<string, string[]>; // Day name -> list of MM/DD dates
}

// Scheduled row (after applying CSV to plan)
export interface ScheduledRow {
    date: string;           // YYYY-MM-DD
    dayOfWeek: number;
    dayName: string;
    postingTime: string;    // HH:MM (24-hour)
    isManualDate: boolean;
    starterText: string;
    imageUrl: string;
    hasImage: boolean;
}

// Preview structure before writing to Firestore
export interface SchedulePreview {
    platform: Platform;
    startDate: string;
    endDate: string;
    totalPosts: number;
    manualDateCount: number;
    autoDateCount: number;
    rows: ScheduledRow[];
}

// Validation result
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

// Day names for display
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// Day priority for restaurant social media (higher = better engagement)
// Platform-specific priorities can be added later
const DAY_PRIORITY: Record<number, number> = {
    5: 7,  // Friday - highest (weekend planning)
    4: 6,  // Thursday - very high (dinner planning searches)
    3: 5,  // Wednesday - high (mid-week engagement)
    6: 4,  // Saturday - medium-high (brunch crowd)
    0: 3,  // Sunday - medium (family dinner planning)
    2: 2,  // Tuesday - lower
    1: 1,  // Monday - lowest engagement
};

/**
 * Build plan slots for a date range with specified posts per week.
 * Distributes posts evenly across the range, preferring high-engagement days.
 */
export function buildPlanSlots(
    startDate: string,
    endDate: string,
    postsPerWeek: number,
    existingDates: Set<string> = new Set()
): GeneratedPlan {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // Get all days in range
    const allDays = eachDayOfInterval({ start, end });
    const totalDays = allDays.length;
    const totalWeeks = Math.ceil(totalDays / 7);

    // Calculate total posts needed
    const targetTotalPosts = Math.round(postsPerWeek * (totalDays / 7));

    // Get available days (excluding existing posts)
    const availableDays = allDays.filter(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        return !existingDates.has(dateStr);
    });

    // Sort available days by priority (highest engagement days first)
    availableDays.sort((a, b) => {
        const priorityA = DAY_PRIORITY[getDay(a)] || 0;
        const priorityB = DAY_PRIORITY[getDay(b)] || 0;
        if (priorityB !== priorityA) {
            return priorityB - priorityA;
        }
        // Same priority - prefer earlier date for even distribution
        return a.getTime() - b.getTime();
    });

    // Select slots, trying to spread them evenly
    const selectedSlots: PlanSlot[] = [];
    const slotsNeeded = Math.min(targetTotalPosts, availableDays.length);

    if (slotsNeeded > 0 && availableDays.length > 0) {
        // Calculate interval to spread posts evenly
        const interval = availableDays.length / slotsNeeded;

        // Group available days by week for even distribution
        const weekBuckets: Date[][] = [];
        let currentWeekStart = start;

        for (const day of availableDays) {
            const weekIndex = Math.floor(differenceInDays(day, start) / 7);
            while (weekBuckets.length <= weekIndex) {
                weekBuckets.push([]);
            }
            weekBuckets[weekIndex].push(day);
        }

        // Distribute posts across weeks
        let postsRemaining = slotsNeeded;
        const postsPerWeekTarget = Math.ceil(slotsNeeded / Math.max(weekBuckets.length, 1));

        for (const weekDays of weekBuckets) {
            if (postsRemaining <= 0) break;

            // Sort this week's days by priority
            weekDays.sort((a, b) => {
                const priorityA = DAY_PRIORITY[getDay(a)] || 0;
                const priorityB = DAY_PRIORITY[getDay(b)] || 0;
                return priorityB - priorityA;
            });

            // Take up to postsPerWeekTarget from this week
            const postsThisWeek = Math.min(
                Math.min(postsPerWeekTarget, postsRemaining),
                weekDays.length
            );

            for (let i = 0; i < postsThisWeek; i++) {
                const day = weekDays[i];
                const dateStr = format(day, "yyyy-MM-dd");
                const dayOfWeek = getDay(day);
                selectedSlots.push({
                    date: dateStr,
                    dayOfWeek,
                    dayName: DAY_NAMES[dayOfWeek],
                });
            }

            postsRemaining -= postsThisWeek;
        }
    }

    // Sort selected slots chronologically
    selectedSlots.sort((a, b) => a.date.localeCompare(b.date));

    // Build day-of-week breakdown
    const dayOfWeekBreakdown: Record<string, string[]> = {};
    for (const name of DAY_NAMES) {
        dayOfWeekBreakdown[name] = [];
    }

    for (const slot of selectedSlots) {
        const displayDate = format(parseISO(slot.date), "MM/dd");
        dayOfWeekBreakdown[slot.dayName].push(displayDate);
    }

    return {
        platform: "facebook", // Default, will be set by caller
        startDate,
        endDate,
        postsPerWeek,
        totalSlots: selectedSlots.length,
        slots: selectedSlots,
        dayOfWeekBreakdown,
    };
}

/**
 * Parse CSV rows into structured data.
 */
export function parseCsvRows(rawRows: Record<string, string>[]): { rows: PlanningCsvRow[], errors: string[] } {
    const rows: PlanningCsvRow[] = [];
    const errors: string[] = [];

    for (let i = 0; i < rawRows.length; i++) {
        const raw = rawRows[i];
        const rowNum = i + 2; // 1-indexed, plus header row

        // Extract fields (flexible column names)
        const rawDate = raw.date || raw.Date || "";
        const starterText = raw.starterText || raw.StarterText || raw.starter_text || raw.text || raw.Text || "";
        const imageUrl = raw.imageUrl || raw.ImageUrl || raw.imageURL || raw.image_url || raw.image || raw.Image || "";

        // Parse date if provided
        let date: string | undefined = undefined;
        if (rawDate && rawDate.trim()) {
            const parsed = parseCsvDate(rawDate);
            if (!parsed) {
                errors.push(`Row ${rowNum}: Invalid date format "${rawDate}". Use YYYY-MM-DD or MM/DD/YY.`);
                continue;
            }
            date = parsed;
        }

        rows.push({
            date,
            starterText: starterText || "",
            imageUrl: imageUrl || "",
        });
    }

    return { rows, errors };
}

/**
 * Validate CSV rows against a generated plan.
 */
export function validateCsvAgainstPlan(
    plan: GeneratedPlan,
    csvRows: PlanningCsvRow[],
    existingPlatformDates: Set<string>
): ValidationResult {
    const errors: string[] = [];

    if (csvRows.length === 0) {
        errors.push("CSV file is empty. Please provide at least one post.");
        return { valid: false, errors };
    }

    // Check if CSV has more rows than plan slots
    if (csvRows.length > plan.totalSlots) {
        errors.push(
            `CSV has ${csvRows.length} rows but plan only has ${plan.totalSlots} available slots. ` +
            `Reduce CSV rows or increase posts per week.`
        );
    }

    // Extract manual dates and check for issues
    const manualDates = new Map<string, number[]>(); // date -> row numbers

    for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        const rowNum = i + 2;

        if (row.date) {
            // Check if date is within plan range
            if (row.date < plan.startDate || row.date > plan.endDate) {
                errors.push(
                    `Row ${rowNum}: Manual date ${formatDateDisplay(row.date)} is outside the plan range ` +
                    `(${formatDateDisplay(plan.startDate)} - ${formatDateDisplay(plan.endDate)}).`
                );
            }

            // Track for duplicate checking
            if (!manualDates.has(row.date)) {
                manualDates.set(row.date, []);
            }
            manualDates.get(row.date)!.push(rowNum);

            // Check if date conflicts with existing posts for this platform
            if (existingPlatformDates.has(row.date)) {
                errors.push(
                    `Row ${rowNum}: Manual date ${formatDateDisplay(row.date)} conflicts with an existing ${plan.platform} post.`
                );
            }
        }
    }

    // Check for duplicate manual dates
    for (const [date, rowNums] of manualDates) {
        if (rowNums.length > 1) {
            errors.push(
                `Duplicate manual date ${formatDateDisplay(date)} found in rows: ${rowNums.join(", ")}.`
            );
        }
    }

    // Check if we have enough slots for non-manual rows
    const manualCount = Array.from(manualDates.keys()).length;
    const autoNeeded = csvRows.length - manualCount;
    const availableAutoSlots = plan.slots.filter(s => !manualDates.has(s.date)).length;

    if (autoNeeded > availableAutoSlots) {
        errors.push(
            `Not enough available slots. Need ${autoNeeded} auto-assigned dates but only ${availableAutoSlots} ` +
            `slots are available after accounting for ${manualCount} manual dates.`
        );
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Apply CSV rows to plan slots, assigning dates and times.
 * Returns a preview of the scheduled posts.
 */
export function applyCsvToPlanSlots(
    plan: GeneratedPlan,
    csvRows: PlanningCsvRow[]
): SchedulePreview {
    // Separate manual and auto rows
    const manualRows: { row: PlanningCsvRow; index: number }[] = [];
    const autoRows: { row: PlanningCsvRow; index: number }[] = [];

    for (let i = 0; i < csvRows.length; i++) {
        if (csvRows[i].date) {
            manualRows.push({ row: csvRows[i], index: i });
        } else {
            autoRows.push({ row: csvRows[i], index: i });
        }
    }

    // Get manual dates to exclude from auto assignment
    const manualDateSet = new Set(manualRows.map(m => m.row.date!));

    // Get available slots for auto assignment (not used by manual dates)
    const availableSlots = plan.slots.filter(s => !manualDateSet.has(s.date));

    // Build scheduled rows
    const scheduledRows: ScheduledRow[] = [];

    // Add manual rows
    for (const { row } of manualRows) {
        const dayOfWeek = getDayOfWeekDenver(row.date!);
        scheduledRows.push({
            date: row.date!,
            dayOfWeek,
            dayName: DAY_NAMES[dayOfWeek],
            postingTime: randomTimeInWindow5Min(row.date!, `${plan.platform}-${row.date}`),
            isManualDate: true,
            starterText: row.starterText,
            imageUrl: row.imageUrl,
            hasImage: !!(row.imageUrl && row.imageUrl.trim()),
        });
    }

    // Add auto rows using available slots in order
    for (let i = 0; i < autoRows.length && i < availableSlots.length; i++) {
        const slot = availableSlots[i];
        const row = autoRows[i].row;

        scheduledRows.push({
            date: slot.date,
            dayOfWeek: slot.dayOfWeek,
            dayName: slot.dayName,
            postingTime: randomTimeInWindow5Min(slot.date, `${plan.platform}-${slot.date}`),
            isManualDate: false,
            starterText: row.starterText,
            imageUrl: row.imageUrl,
            hasImage: !!(row.imageUrl && row.imageUrl.trim()),
        });
    }

    // Sort by date
    scheduledRows.sort((a, b) => a.date.localeCompare(b.date));

    return {
        platform: plan.platform,
        startDate: plan.startDate,
        endDate: plan.endDate,
        totalPosts: scheduledRows.length,
        manualDateCount: manualRows.length,
        autoDateCount: autoRows.length,
        rows: scheduledRows,
    };
}

/**
 * Format date for display (MM/DD/YYYY)
 */
export function formatDateDisplay(dateStr: string): string {
    const date = parseISO(dateStr);
    return format(date, "MM/dd/yyyy");
}

/**
 * Format date for short display (MM/DD)
 */
export function formatDateShort(dateStr: string): string {
    const date = parseISO(dateStr);
    return format(date, "MM/dd");
}

/**
 * Get platform display name
 */
export function getPlatformDisplayName(platform: Platform): string {
    return platform === "facebook" ? "Facebook" : "Instagram";
}

/**
 * Get platform color classes
 */
export function getPlatformColorClasses(platform: Platform): { bg: string; text: string; border: string } {
    if (platform === "facebook") {
        return {
            bg: "bg-blue-100 dark:bg-blue-900/30",
            text: "text-blue-700 dark:text-blue-300",
            border: "border-blue-200 dark:border-blue-800",
        };
    }
    return {
        bg: "bg-pink-100 dark:bg-pink-900/30",
        text: "text-pink-700 dark:text-pink-300",
        border: "border-pink-200 dark:border-pink-800",
    };
}
