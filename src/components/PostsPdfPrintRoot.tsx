"use client";

/**
 * PostsPdfPrintRoot - Renders posts in a TABLE layout for PDF export.
 *
 * Layout:
 * - Title: "Social Media Posts"
 * - Header row (teal): Date/Time | Image | Instagram Post | Facebook Post
 * - Data rows (alternating white/cream)
 * - 6 rows per page
 * - Page X of Y footer
 */

import { useRef, useEffect, useState } from "react";
import { PostDay } from "@/lib/types";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";
import PostsPdfRow from "./PostsPdfBlock";
import {
    getPostsPdfFilename,
    downloadPdf,
    waitForFrames,
    paginatePosts,
    PostsPdfExportProgress,
    PdfPage,
    PAGE_WIDTH_PX,
    PAGE_HEIGHT_PX,
    PAGE_MARGIN_PX,
    CONTENT_WIDTH_PX,
    TITLE_HEIGHT_PX,
    TITLE_MARGIN_BOTTOM_PX,
    HEADER_ROW_HEIGHT_PX,
    PAGE_FOOTER_HEIGHT_PX,
    COL_DATE_WIDTH_PX,
    COL_IMAGE_WIDTH_PX,
    COL_IG_WIDTH_PX,
    COL_FB_WIDTH_PX,
    HEADER_COLOR,
} from "@/lib/postsPdfExport";

interface PostsPdfPrintRootProps {
    posts: PostDay[];
    workspaceId: string;
    includeImages: boolean;
    onComplete: (warning?: string) => void;
    onError: (error: string, stack?: string) => void;
    onProgress: (progress: PostsPdfExportProgress) => void;
}

class ImageCache {
    private cache = new Map<string, Promise<string | null>>();

    get(url: string): Promise<string | null> {
        if (this.cache.has(url)) return this.cache.get(url)!;
        const promise = this.fetchAsDataUrl(url);
        this.cache.set(url, promise);
        return promise;
    }

    private async fetchAsDataUrl(url: string): Promise<string | null> {
        try {
            const response = await fetch(url, { mode: "cors" });
            if (!response.ok) return null;
            const blob = await response.blob();
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = () => resolve(null);
                reader.readAsDataURL(blob);
            });
        } catch {
            return null;
        }
    }
}

export default function PostsPdfPrintRoot({
    posts,
    workspaceId,
    includeImages,
    onComplete,
    onError,
    onProgress,
}: PostsPdfPrintRootProps) {
    const callbacksRef = useRef({ onProgress, onComplete, onError });
    callbacksRef.current = { onProgress, onComplete, onError };

    const hasStartedRef = useRef(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const [imageDataUrls, setImageDataUrls] = useState<Map<string, string>>(new Map());
    const [pages, setPages] = useState<PdfPage[]>([]);
    const [isReady, setIsReady] = useState(false);
    const failedImagesRef = useRef(0);

    // Phase 1: Load images then paginate
    useEffect(() => {
        if (hasStartedRef.current) return;
        hasStartedRef.current = true;

        loadImagesAndPaginate();

        async function loadImagesAndPaginate() {
            callbacksRef.current.onProgress({
                phase: "preparing",
                current: 0,
                total: posts.length,
            });

            if (includeImages) {
                const { urls, failedCount } = await loadImagesAsDataUrls();
                failedImagesRef.current = failedCount;
                setImageDataUrls(urls);

                if (failedCount > 0) {
                    console.warn(`[Posts PDF] ${failedCount} image(s) failed to load.`);
                }
            }

            const paginatedPages = paginatePosts(posts);
            setPages(paginatedPages);
            setIsReady(true);
        }

        async function loadImagesAsDataUrls(): Promise<{ urls: Map<string, string>; failedCount: number }> {
            const urls = new Map<string, string>();
            let failedCount = 0;
            const cache = new ImageCache();

            const assetIds = new Set<string>();
            for (const post of posts) {
                if (post.imageAssetId) assetIds.add(post.imageAssetId);
            }

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
                        const dataUrl = await cache.get(downloadUrl);

                        if (!dataUrl) failedCount++;
                        return { assetId, dataUrl };
                    } catch {
                        failedCount++;
                        return { assetId, dataUrl: null };
                    }
                })
            );

            for (const { assetId, dataUrl } of results) {
                if (dataUrl) urls.set(assetId, dataUrl);
            }

            return { urls, failedCount };
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Phase 2: Render PDF
    useEffect(() => {
        if (!isReady || pages.length === 0) return;

        const timer = setTimeout(async () => {
            await generatePdf();
        }, 200);

        return () => clearTimeout(timer);

        async function generatePdf() {
            try {
                await waitForFrames();
                await waitForFrames();

                const container = containerRef.current;
                if (!container) throw new Error("PDF container not found");

                const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
                    import("jspdf"),
                    import("html2canvas"),
                ]);

                const pdf = new jsPDF({
                    orientation: "landscape",
                    unit: "pt",
                    format: "letter",
                });

                const pageWidth = pdf.internal.pageSize.getWidth();
                const pageHeight = pdf.internal.pageSize.getHeight();

                for (let i = 0; i < pages.length; i++) {
                    callbacksRef.current.onProgress({
                        phase: "rendering",
                        current: i + 1,
                        total: pages.length,
                    });

                    const pageElement = container.querySelector(`[data-page="${i}"]`) as HTMLElement;
                    if (!pageElement || !pageElement.isConnected) {
                        console.warn(`[Posts PDF] Page ${i} not found`);
                        continue;
                    }

                    await waitForFrames();

                    const images = pageElement.querySelectorAll("img");
                    await Promise.all(
                        Array.from(images).map(
                            (img) =>
                                new Promise<void>((resolve) => {
                                    if (img.complete && img.naturalWidth > 0) resolve();
                                    else {
                                        img.onload = () => resolve();
                                        img.onerror = () => resolve();
                                        setTimeout(resolve, 3000);
                                    }
                                })
                        )
                    );

                    await waitForFrames();

                    const canvas = await html2canvas(pageElement, {
                        scale: 2,
                        useCORS: true,
                        allowTaint: false,
                        backgroundColor: "#ffffff",
                        logging: false,
                        removeContainer: true,
                        onclone: (clonedDoc, clonedElement) => {
                            const clonedImages = clonedElement.querySelectorAll("img");
                            clonedImages.forEach((img) => {
                                if (!img.complete || img.naturalWidth === 0) {
                                    const placeholder = clonedDoc.createElement("div");
                                    placeholder.style.backgroundColor = "#e5e7eb";
                                    placeholder.style.width = "100%";
                                    placeholder.style.height = "100%";
                                    img.parentElement?.replaceChild(placeholder, img);
                                }
                            });
                        },
                    });

                    if (i > 0) pdf.addPage();

                    const scale = Math.min(pageWidth / canvas.width, pageHeight / canvas.height);
                    const imgWidth = canvas.width * scale;
                    const imgHeight = canvas.height * scale;
                    const x = (pageWidth - imgWidth) / 2;
                    const y = (pageHeight - imgHeight) / 2;

                    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, imgWidth, imgHeight);
                }

                callbacksRef.current.onProgress({
                    phase: "finalizing",
                    current: pages.length,
                    total: pages.length,
                });

                const blob = pdf.output("blob");
                downloadPdf(blob, getPostsPdfFilename(posts));

                const warning = failedImagesRef.current > 0
                    ? `${failedImagesRef.current} image(s) could not be loaded.`
                    : undefined;

                callbacksRef.current.onComplete(warning);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                const stack = err instanceof Error ? err.stack : undefined;
                console.error("[Posts PDF] Generation failed:", message);
                callbacksRef.current.onError(message, stack);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isReady, pages]);

    return (
        <div
            style={{ position: "fixed", left: "-10000px", top: 0, zIndex: -9999 }}
            aria-hidden="true"
        >
            <div ref={containerRef}>
                {pages.map((page, pageIndex) => (
                    <div
                        key={`page-${pageIndex}`}
                        data-page={pageIndex}
                        style={{
                            width: `${PAGE_WIDTH_PX}px`,
                            height: `${PAGE_HEIGHT_PX}px`,
                            padding: `${PAGE_MARGIN_PX + 8}px ${PAGE_MARGIN_PX}px ${PAGE_MARGIN_PX}px ${PAGE_MARGIN_PX}px`,
                            backgroundColor: "#ffffff",
                            fontFamily: "system-ui, -apple-system, sans-serif",
                            boxSizing: "border-box",
                            marginBottom: "20px",
                            display: "flex",
                            flexDirection: "column",
                            overflow: "visible",
                        }}
                    >
                        {/* Title */}
                        <div
                            style={{
                                height: `${TITLE_HEIGHT_PX}px`,
                                display: "flex",
                                alignItems: "center",
                                marginBottom: `${TITLE_MARGIN_BOTTOM_PX}px`,
                            }}
                        >
                            <h1
                                style={{
                                    fontSize: "22px",
                                    fontWeight: 600,
                                    color: "#111827",
                                    margin: 0,
                                }}
                            >
                                Social Media Posts
                            </h1>
                        </div>

                        {/* Table Header Row */}
                        <div
                            style={{
                                display: "flex",
                                width: `${CONTENT_WIDTH_PX}px`,
                                height: `${HEADER_ROW_HEIGHT_PX}px`,
                                backgroundColor: HEADER_COLOR,
                                borderTopLeftRadius: "4px",
                                borderTopRightRadius: "4px",
                            }}
                        >
                            {includeImages ? (
                                <>
                                    {/* Full 4-column header when images are included */}
                                    <div
                                        style={{
                                            width: `${COL_DATE_WIDTH_PX}px`,
                                            padding: "0 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            borderRight: "1px solid rgba(255,255,255,0.2)",
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#ffffff" }}>
                                            Date/Time
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            width: `${COL_IMAGE_WIDTH_PX}px`,
                                            padding: "0 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            borderRight: "1px solid rgba(255,255,255,0.2)",
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#ffffff" }}>
                                            Image
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            width: `${COL_IG_WIDTH_PX}px`,
                                            padding: "0 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            borderRight: "1px solid rgba(255,255,255,0.2)",
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#ffffff" }}>
                                            Instagram Post
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            width: `${COL_FB_WIDTH_PX}px`,
                                            padding: "0 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#ffffff" }}>
                                            Facebook Post
                                        </span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    {/* Compact 2-column header when images are not included */}
                                    <div
                                        style={{
                                            width: "80px",
                                            flexShrink: 0,
                                            padding: "0 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            borderRight: "1px solid rgba(255,255,255,0.2)",
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#ffffff" }}>
                                            Date/Time
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            flex: 1,
                                            padding: "0 8px",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                        }}
                                    >
                                        <span style={{ fontSize: "10px", fontWeight: 600, color: "#ffffff" }}>
                                            Post Text
                                        </span>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Table Data Rows */}
                        <div
                            style={{
                                flex: 1,
                                width: `${CONTENT_WIDTH_PX}px`,
                                border: "1px solid #e5e7eb",
                                borderTop: "none",
                            }}
                        >
                            {page.posts.map((post, idx) => (
                                <PostsPdfRow
                                    key={`${post.date}-${idx}`}
                                    post={post}
                                    rowIndex={idx}
                                    imageDataUrl={
                                        post.imageAssetId
                                            ? imageDataUrls.get(post.imageAssetId)
                                            : undefined
                                    }
                                    includeImages={includeImages}
                                />
                            ))}
                        </div>

                        {/* Page Footer */}
                        <div
                            style={{
                                height: `${PAGE_FOOTER_HEIGHT_PX}px`,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                marginTop: "8px",
                            }}
                        >
                            <span style={{ fontSize: "8px", color: "#6b7280" }}>
                                Page {page.pageNumber} of {page.totalPages}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
