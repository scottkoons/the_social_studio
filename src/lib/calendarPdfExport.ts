import { PostDay } from "./types";
import { format, parseISO, startOfMonth, startOfWeek, endOfWeek, addDays, isSameMonth } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { DENVER_TZ } from "./utils";

/**
 * Groups posts by month (YYYY-MM format) in Denver timezone.
 * Returns a Map with month keys sorted chronologically.
 */
export function groupPostsByMonth(posts: PostDay[]): Map<string, PostDay[]> {
    const grouped = new Map<string, PostDay[]>();

    for (const post of posts) {
        // Parse the date and convert to Denver timezone to get accurate month
        const date = parseISO(post.date);
        const denverDate = toZonedTime(date, DENVER_TZ);
        const monthKey = format(denverDate, "yyyy-MM");

        if (!grouped.has(monthKey)) {
            grouped.set(monthKey, []);
        }
        grouped.get(monthKey)!.push(post);
    }

    // Sort the map by keys (chronologically)
    const sorted = new Map(
        [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    );

    return sorted;
}

/**
 * Returns the month label for display (e.g., "January 2025").
 */
export function getMonthLabel(monthKey: string): string {
    const [year, month] = monthKey.split("-");
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return format(date, "MMMM yyyy");
}

/**
 * Generates the calendar grid for a specific month.
 * Returns a 6-week (42-day) array starting from Sunday.
 */
export interface CalendarDay {
    dateStr: string;
    day: Date;
    isCurrentMonth: boolean;
    post?: PostDay;
}

export function generateMonthGrid(monthKey: string, posts: PostDay[]): CalendarDay[] {
    const [year, month] = monthKey.split("-");
    const monthDate = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthStart = startOfMonth(monthDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(addDays(monthStart, 41), { weekStartsOn: 0 });

    // Create a map of posts by date for quick lookup
    const postsByDate = new Map<string, PostDay>();
    for (const post of posts) {
        postsByDate.set(post.date, post);
    }

    const days: CalendarDay[] = [];
    let day = gridStart;

    while (day <= gridEnd) {
        const dateStr = format(day, "yyyy-MM-dd");
        days.push({
            dateStr,
            day: new Date(day),
            isCurrentMonth: isSameMonth(day, monthDate),
            post: postsByDate.get(dateStr),
        });
        day = addDays(day, 1);
    }

    return days;
}

export type PdfExportPhase = "preparing" | "rendering" | "finalizing";

export interface PdfExportProgress {
    phase: PdfExportPhase;
    current: number;
    total: number;
    monthLabel?: string;
}

export type ProgressCallback = (progress: PdfExportProgress) => void;

/**
 * Waits for the next animation frame to allow DOM to settle.
 */
function waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}

/**
 * Generates a multi-page PDF from calendar month elements.
 * Uses html2canvas to capture each month and jsPDF to assemble pages.
 */
export async function generateCalendarPdf(
    monthElements: HTMLElement[],
    monthLabels: string[],
    onProgress?: ProgressCallback
): Promise<Blob> {
    // Dynamic imports to keep bundle size down
    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf"),
        import("html2canvas"),
    ]);

    // Letter size in points: 612 x 792
    const pdf = new jsPDF({
        orientation: "landscape",
        unit: "pt",
        format: "letter",
    });

    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;

    for (let i = 0; i < monthElements.length; i++) {
        const element = monthElements[i];
        const monthLabel = monthLabels[i];

        if (onProgress) {
            onProgress({
                phase: "rendering",
                current: i + 1,
                total: monthElements.length,
                monthLabel,
            });
        }

        // Validate element exists and is in DOM
        if (!element || !element.isConnected) {
            console.warn(`[PDF] Skipping month ${monthLabel}: element not found or not connected to DOM`);
            continue;
        }

        // Wait for DOM to settle
        await waitForNextFrame();

        // Capture element as canvas with safe configuration
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            allowTaint: false, // Changed: prevents tainting which causes iframe clone errors
            backgroundColor: "#ffffff",
            logging: false,
            removeContainer: true,
            // Ignore images that fail to load
            onclone: (clonedDoc, clonedElement) => {
                // Remove any broken images from the clone
                const images = clonedElement.querySelectorAll("img");
                images.forEach((img) => {
                    if (!img.complete || img.naturalWidth === 0) {
                        // Replace broken image with placeholder
                        const placeholder = clonedDoc.createElement("div");
                        placeholder.style.cssText = img.parentElement?.style.cssText || "";
                        placeholder.style.backgroundColor = "#e5e7eb";
                        placeholder.style.width = "100%";
                        placeholder.style.height = "100%";
                        img.parentElement?.replaceChild(placeholder, img);
                    }
                });
            },
        });

        // Calculate dimensions to fit page with margins
        const imgWidth = pageWidth - margin * 2;
        const imgHeight = (canvas.height * imgWidth) / canvas.width;

        // If not first page, add a new page
        if (i > 0) {
            pdf.addPage();
        }

        // Add the canvas image centered on the page
        const imgData = canvas.toDataURL("image/png");
        const y = (pageHeight - imgHeight) / 2; // Center vertically
        pdf.addImage(imgData, "PNG", margin, y, imgWidth, imgHeight);
    }

    if (onProgress) {
        onProgress({
            phase: "finalizing",
            current: monthElements.length,
            total: monthElements.length,
        });
    }

    return pdf.output("blob");
}

/**
 * Triggers a download of a PDF blob in the browser.
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
 * Generates a filename for the PDF export.
 */
export function getPdfFilename(): string {
    const now = new Date();
    const dateStr = format(now, "yyyy-MM-dd");
    return `social-studio-calendar-${dateStr}.pdf`;
}

/**
 * Returns human-readable text for the current export phase.
 */
export function getPhaseText(progress: PdfExportProgress): string {
    switch (progress.phase) {
        case "preparing":
            return "Preparing layout...";
        case "rendering":
            return `Rendering ${progress.monthLabel || `page ${progress.current}`} (${progress.current}/${progress.total})`;
        case "finalizing":
            return "Finalizing download...";
        default:
            return "Processing...";
    }
}
