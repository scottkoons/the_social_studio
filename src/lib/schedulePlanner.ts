/**
 * AI-Powered Posting Schedule Planner
 *
 * Generates optimal posting schedules for restaurant social media.
 * Assigns dates and times to posts while respecting manual dates and existing posts.
 */

import { randomTimeInWindow5Min } from "./postingTime";
import { format, parseISO, eachDayOfInterval, getDay } from "date-fns";

// Types
export interface CsvRow {
    date?: string;        // YYYY-MM-DD (optional - AI assigns if missing)
    starterText: string;
    imageUrl: string;
}

export interface ScheduleRow {
    date: string;           // YYYY-MM-DD
    postingTime: string;    // HH:MM (24-hour)
    dateSource: "manual" | "ai";
    timeSource: "ai";
    starterText: string;
    imageUrl: string;
}

export interface SchedulePlan {
    startDate: string;
    endDate: string;
    totalPosts: number;
    manualCount: number;
    aiCount: number;
    existingBlockedCount: number;
    rows: ScheduleRow[];
}

export interface ValidationResult {
    valid: boolean;
    errors: string[];
}

// Day of week engagement priority (0 = Sunday, 6 = Saturday)
// Higher number = higher priority for restaurant social media
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
 * Validate schedule inputs before generating plan
 */
export function validateScheduleInput(
    startDate: string,
    endDate: string,
    csvRows: CsvRow[],
    existingDates: Set<string>
): ValidationResult {
    const errors: string[] = [];

    // Check date range is valid
    if (!startDate || !endDate) {
        errors.push("Start date and end date are required.");
        return { valid: false, errors };
    }

    const start = parseISO(startDate);
    const end = parseISO(endDate);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        errors.push("Invalid date format. Use YYYY-MM-DD.");
        return { valid: false, errors };
    }

    if (start > end) {
        errors.push("Start date must be before or equal to end date.");
        return { valid: false, errors };
    }

    // Check CSV has rows
    if (csvRows.length === 0) {
        errors.push("CSV file is empty. Please provide at least one post.");
        return { valid: false, errors };
    }

    // Extract manual dates from CSV
    const manualDates: string[] = [];
    const seenManualDates = new Set<string>();

    for (let i = 0; i < csvRows.length; i++) {
        const row = csvRows[i];
        if (row.date) {
            // Check manual date is valid
            const parsedDate = parseISO(row.date);
            if (isNaN(parsedDate.getTime())) {
                errors.push(`Row ${i + 1}: Invalid date format "${row.date}". Use YYYY-MM-DD.`);
                continue;
            }

            // Check manual date is within range
            if (row.date < startDate || row.date > endDate) {
                errors.push(`Row ${i + 1}: Manual date ${formatDateDisplay(row.date)} is outside the selected range.`);
            }

            // Check for duplicate manual dates
            if (seenManualDates.has(row.date)) {
                errors.push(`Row ${i + 1}: Duplicate manual date ${formatDateDisplay(row.date)}.`);
            }
            seenManualDates.add(row.date);

            // Check manual date doesn't conflict with existing posts
            if (existingDates.has(row.date)) {
                errors.push(`Row ${i + 1}: Manual date ${formatDateDisplay(row.date)} conflicts with an existing post.`);
            }

            manualDates.push(row.date);
        }
    }

    // Calculate available days
    const allDaysInRange = eachDayOfInterval({ start, end });
    const availableDays = allDaysInRange.filter(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        return !existingDates.has(dateStr) && !seenManualDates.has(dateStr);
    });

    const postsNeedingDates = csvRows.filter(r => !r.date).length;

    if (postsNeedingDates > availableDays.length) {
        const totalDays = allDaysInRange.length;
        const blockedByExisting = allDaysInRange.filter(d => existingDates.has(format(d, "yyyy-MM-dd"))).length;
        errors.push(
            `Not enough available days. You have ${postsNeedingDates} posts needing dates, ` +
            `but only ${availableDays.length} days available ` +
            `(${totalDays} total days, ${blockedByExisting} blocked by existing posts, ${seenManualDates.size} used by manual dates).`
        );
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Generate the posting schedule plan
 */
export function generateSchedulePlan(
    startDate: string,
    endDate: string,
    csvRows: CsvRow[],
    existingDates: Set<string>
): SchedulePlan {
    const start = parseISO(startDate);
    const end = parseISO(endDate);

    // Separate rows with manual dates from those needing AI assignment
    const manualRows: ScheduleRow[] = [];
    const rowsNeedingDates: CsvRow[] = [];

    for (const row of csvRows) {
        if (row.date) {
            manualRows.push({
                date: row.date,
                postingTime: randomTimeInWindow5Min(row.date, row.date),
                dateSource: "manual",
                timeSource: "ai",
                starterText: row.starterText,
                imageUrl: row.imageUrl,
            });
        } else {
            rowsNeedingDates.push(row);
        }
    }

    // Get all dates used by manual entries
    const manualDateSet = new Set(manualRows.map(r => r.date));

    // Get available days (not blocked by existing or manual)
    const allDaysInRange = eachDayOfInterval({ start, end });
    const availableDays = allDaysInRange.filter(day => {
        const dateStr = format(day, "yyyy-MM-dd");
        return !existingDates.has(dateStr) && !manualDateSet.has(dateStr);
    });

    // Sort available days by engagement priority (highest first)
    availableDays.sort((a, b) => {
        const priorityA = DAY_PRIORITY[getDay(a)] || 0;
        const priorityB = DAY_PRIORITY[getDay(b)] || 0;
        // If same priority, prefer earlier date
        if (priorityB !== priorityA) {
            return priorityB - priorityA;
        }
        return a.getTime() - b.getTime();
    });

    // Assign AI dates to rows needing them
    const aiRows: ScheduleRow[] = [];
    for (let i = 0; i < rowsNeedingDates.length && i < availableDays.length; i++) {
        const dateStr = format(availableDays[i], "yyyy-MM-dd");
        aiRows.push({
            date: dateStr,
            postingTime: randomTimeInWindow5Min(dateStr, dateStr),
            dateSource: "ai",
            timeSource: "ai",
            starterText: rowsNeedingDates[i].starterText,
            imageUrl: rowsNeedingDates[i].imageUrl,
        });
    }

    // Combine and sort all rows by date
    const allRows = [...manualRows, ...aiRows].sort((a, b) => a.date.localeCompare(b.date));

    // Count existing blocked dates in range
    const existingBlockedCount = allDaysInRange.filter(d =>
        existingDates.has(format(d, "yyyy-MM-dd"))
    ).length;

    return {
        startDate,
        endDate,
        totalPosts: allRows.length,
        manualCount: manualRows.length,
        aiCount: aiRows.length,
        existingBlockedCount,
        rows: allRows,
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
 * Format time for display (already HH:MM)
 */
export function formatTimeDisplay(timeStr: string): string {
    return timeStr;
}

/**
 * Group schedule rows by day of week for display
 */
export function groupByDayOfWeek(rows: ScheduleRow[]): Record<string, string[]> {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const grouped: Record<string, string[]> = {};

    // Initialize all days
    for (const name of dayNames) {
        grouped[name] = [];
    }

    for (const row of rows) {
        const date = parseISO(row.date);
        const dayName = dayNames[getDay(date)];
        grouped[dayName].push(format(date, "MM/dd"));
    }

    return grouped;
}

/**
 * Export schedule summary as downloadable text
 */
export function exportScheduleSummary(plan: SchedulePlan): void {
    const lines: string[] = [];

    // Header
    lines.push("=".repeat(60));
    lines.push("POSTING SCHEDULE SUMMARY");
    lines.push("=".repeat(60));
    lines.push("");

    // Date range
    lines.push(`Date Range: ${formatDateDisplay(plan.startDate)} - ${formatDateDisplay(plan.endDate)}`);
    lines.push(`Total Posts: ${plan.totalPosts}`);
    lines.push(`  - Manual dates: ${plan.manualCount}`);
    lines.push(`  - AI-assigned dates: ${plan.aiCount}`);
    if (plan.existingBlockedCount > 0) {
        lines.push(`  - Blocked by existing posts: ${plan.existingBlockedCount}`);
    }
    lines.push("");

    // Day of week grouping
    lines.push("-".repeat(40));
    lines.push("POSTS BY DAY OF WEEK");
    lines.push("-".repeat(40));
    const grouped = groupByDayOfWeek(plan.rows);
    const dayOrder = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    for (const day of dayOrder) {
        const dates = grouped[day];
        if (dates.length > 0) {
            lines.push(`${day.padEnd(12)}: ${dates.join(", ")}`);
        }
    }
    lines.push("");

    // Detailed schedule
    lines.push("-".repeat(60));
    lines.push("DETAILED SCHEDULE");
    lines.push("-".repeat(60));
    lines.push("Date          Time   Date Source  Preview");
    lines.push("-".repeat(60));

    for (const row of plan.rows) {
        const date = formatDateDisplay(row.date).padEnd(12);
        const time = row.postingTime.padEnd(6);
        const source = row.dateSource.padEnd(12);
        const preview = row.starterText.substring(0, 30) + (row.starterText.length > 30 ? "..." : "");
        lines.push(`${date}  ${time} ${source} ${preview}`);
    }

    lines.push("");
    lines.push("=".repeat(60));
    lines.push(`Generated: ${new Date().toLocaleString("en-US", { timeZone: "America/Denver" })} MT`);
    lines.push("=".repeat(60));

    // Trigger download
    const content = lines.join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-plan-${format(new Date(), "yyyy-MM-dd")}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}
