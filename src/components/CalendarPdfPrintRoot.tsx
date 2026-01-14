"use client";

/**
 * CalendarPdfPrintRoot - Renders calendar months offscreen for PDF export.
 *
 * ============================================================================
 * FIREBASE STORAGE CORS SETUP (Required for "Include images" to work)
 * ============================================================================
 *
 * The PDF export fetches images from Firebase Storage to convert them to
 * base64 data URLs. This requires CORS to be configured on your bucket.
 *
 * 1. A storage.cors.json file exists at the repo root with localhost origins.
 *    Edit it to add your production domain(s).
 *
 * 2. Apply the CORS config to your Firebase Storage bucket:
 *
 *    gsutil cors set storage.cors.json gs://YOUR_BUCKET_NAME.appspot.com
 *
 * 3. Verify it was applied:
 *
 *    gsutil cors get gs://YOUR_BUCKET_NAME.appspot.com
 *
 * If CORS is not configured, the PDF will still export successfully but
 * images will appear as gray placeholders. A single warning will be shown.
 *
 * ============================================================================
 */

import { useRef, useEffect, useState } from "react";
import { PostDay } from "@/lib/types";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import CalendarPdfMonth from "./CalendarPdfMonth";
import {
    groupPostsByMonth,
    generateMonthGrid,
    generateCalendarPdf,
    downloadPdf,
    getPdfFilename,
    getMonthLabel,
    PdfExportProgress,
} from "@/lib/calendarPdfExport";

interface CalendarPdfPrintRootProps {
    posts: PostDay[];
    workspaceId: string;
    includeImages: boolean;
    onComplete: (warning?: string) => void;
    onError: (error: string, stack?: string) => void;
    onProgress: (progress: PdfExportProgress) => void;
}

/**
 * Waits for 2 animation frames to let DOM settle completely.
 */
function waitForFrames(): Promise<void> {
    return new Promise((resolve) => {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                resolve();
            });
        });
    });
}

/**
 * Per-export cache for image data URLs.
 * Prevents fetching the same URL multiple times during a single export.
 */
class ImageCache {
    private cache = new Map<string, Promise<string | null>>();

    /**
     * Fetches a URL and converts to base64 data URL.
     * Returns cached promise if URL was already requested.
     * Returns null on any error (CORS, network, etc) - never throws.
     */
    get(url: string): Promise<string | null> {
        if (this.cache.has(url)) {
            return this.cache.get(url)!;
        }

        const promise = this.fetchAsDataUrl(url);
        this.cache.set(url, promise);
        return promise;
    }

    private async fetchAsDataUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url, { mode: "cors" });
            if (!response.ok) {
                return null;
            }
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            // CORS or network error - return null silently
            return null;
        }
    }
}

export default function CalendarPdfPrintRoot({
    posts,
    workspaceId,
    includeImages,
    onComplete,
    onError,
    onProgress,
}: CalendarPdfPrintRootProps) {
    // Use refs for callbacks to avoid dependency issues causing loops
    const callbacksRef = useRef({ onProgress, onComplete, onError });
    callbacksRef.current = { onProgress, onComplete, onError };

    // Guard to ensure export runs exactly once
    const hasStartedRef = useRef(false);

    // Refs for DOM elements
    const containerRef = useRef<HTMLDivElement>(null);
    const monthRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());

    // State for image data URLs (only populated when includeImages is true)
    const [imageDataUrls, setImageDataUrls] = useState<Map<string, string>>(new Map());
    const [isReady, setIsReady] = useState(false);
    const failedImagesRef = useRef(0);

    // Group posts by month (stable reference)
    const monthGroups = groupPostsByMonth(posts);
    const monthKeys = Array.from(monthGroups.keys());

    // Phase 1: Load images (if enabled) then mark ready
    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        loadAndPrepare();

        async function loadAndPrepare() {
            // Report preparing phase
            callbacksRef.current.onProgress({
                phase: "preparing",
                current: 0,
                total: monthKeys.length,
            });

            if (includeImages) {
                const { urls, failedCount } = await loadImagesAsDataUrls();
                failedImagesRef.current = failedCount;
                setImageDataUrls(urls);

                // Log ONE summary warning if any images failed (not per-image)
                if (failedCount > 0) {
                    console.warn(
                        `[PDF] ${failedCount} image(s) failed to load (likely CORS). Exported with placeholders. ` +
                        `See storage.cors.json and CalendarPdfPrintRoot.tsx for setup instructions.`
                    );
                }
            }

            // Mark ready - this triggers the render effect
            setIsReady(true);
        }

        async function loadImagesAsDataUrls(): Promise<{ urls: Map<string, string>; failedCount: number }> {
            const urls = new Map<string, string>();
            let failedCount = 0;

            // Per-export cache to avoid duplicate fetches
            const cache = new ImageCache();

            // Collect unique asset IDs
            const assetIds = new Set<string>();
            for (const post of posts) {
                if (post.imageAssetId) {
                    assetIds.add(post.imageAssetId);
                }
            }

            // Fetch all in parallel, using cache
            const results = await Promise.all(
                Array.from(assetIds).map(async (assetId) => {
                    try {
                        const assetRef = doc(db, "workspaces", workspaceId, "assets", assetId);
                        const assetSnap = await getDoc(assetRef);
                        if (!assetSnap.exists()) {
                            failedCount++;
                            return { assetId, dataUrl: null };
                        }

                        const asset = assetSnap.data();
                        const downloadUrl = await getDownloadURL(ref(storage, asset.storagePath));

                        // Use cache to fetch (deduplicates if same URL appears)
                        const dataUrl = await cache.get(downloadUrl);

                        if (!dataUrl) {
                            failedCount++;
                        }
                        return { assetId, dataUrl };
                    } catch {
                        failedCount++;
                        return { assetId, dataUrl: null };
                    }
                })
            );

            for (const { assetId, dataUrl } of results) {
                if (dataUrl) {
                    urls.set(assetId, dataUrl);
                }
            }

            return { urls, failedCount };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Empty deps - run exactly once on mount

    // Phase 2: Once ready, wait for DOM then generate PDF
    useEffect(() => {
        if (!isReady) return;

        // Use setTimeout to ensure React has flushed the render
        const timer = setTimeout(async () => {
            await generatePdf();
        }, 50);

        return () => clearTimeout(timer);

        async function generatePdf() {
            try {
                // Wait for DOM to be fully painted
                await waitForFrames();

                // Validate container
                const container = containerRef.current;
                if (!container) {
                    throw new Error("PDF container element not found in DOM");
                }

                // Validate container has size
                const rect = container.getBoundingClientRect();
                if (rect.width === 0 || rect.height === 0) {
                    throw new Error(`PDF container has zero dimensions: ${rect.width}x${rect.height}`);
                }

                // Collect valid month elements
                const elements: HTMLElement[] = [];
                const labels: string[] = [];

                for (const monthKey of monthKeys) {
                    const el = monthRefsMap.current.get(monthKey);
                    if (!el || !el.isConnected) {
                        continue;
                    }
                    const elRect = el.getBoundingClientRect();
                    if (elRect.width > 0 && elRect.height > 0) {
                        elements.push(el);
                        labels.push(getMonthLabel(monthKey));
                    }
                }

                if (elements.length === 0) {
                    throw new Error("No month elements found to export. Ensure posts exist.");
                }

                // Generate PDF with progress callback
                const blob = await generateCalendarPdf(elements, labels, (progress) => {
                    callbacksRef.current.onProgress(progress);
                });

                // Download the PDF
                downloadPdf(blob, getPdfFilename());

                // Complete with optional warning about failed images
                const warning = failedImagesRef.current > 0
                    ? `${failedImagesRef.current} image(s) could not be loaded (CORS). Exported with placeholders.`
                    : undefined;

                callbacksRef.current.onComplete(warning);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const stack = err instanceof Error ? err.stack : undefined;
                console.error("[PDF] Generation failed:", message);
                callbacksRef.current.onError(message, stack);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady]); // Only run when isReady changes to true

    // Ref setter for month elements
    const setMonthRef = (monthKey: string, el: HTMLDivElement | null) => {
        if (el) {
            monthRefsMap.current.set(monthKey, el);
        }
    };

    // Render months offscreen but NOT with visibility:hidden (html2canvas needs visible elements)
    return (
        <div
            ref={containerRef}
            id="pdf-export-root"
            style={{
                position: "fixed",
                left: "-10000px",
                top: 0,
                width: "1024px",
                backgroundColor: "#ffffff",
                zIndex: -9999,
            }}
            aria-hidden="true"
        >
            {monthKeys.map((monthKey) => {
                const monthPosts = monthGroups.get(monthKey) || [];
                const days = generateMonthGrid(monthKey, monthPosts);

                return (
                    <CalendarPdfMonth
                        key={monthKey}
                        ref={(el) => setMonthRef(monthKey, el)}
                        monthKey={monthKey}
                        days={days}
                        imageDataUrls={imageDataUrls}
                        includeImages={includeImages}
                    />
                );
            })}
        </div>
    );
}
