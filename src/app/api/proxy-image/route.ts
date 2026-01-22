import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    try {
        const { url } = await request.json();

        if (!url || typeof url !== "string") {
            return NextResponse.json(
                { error: "URL is required" },
                { status: 400 }
            );
        }

        // Validate URL format
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch {
            return NextResponse.json(
                { error: "Invalid URL format" },
                { status: 400 }
            );
        }

        // Only allow http/https
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
            return NextResponse.json(
                { error: "Only HTTP/HTTPS URLs are supported" },
                { status: 400 }
            );
        }

        // Fetch the image
        const response = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (compatible; ImageProxy/1.0)",
            },
        });

        if (!response.ok) {
            return NextResponse.json(
                { error: `Failed to fetch image: ${response.status}` },
                { status: 400 }
            );
        }

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) {
            return NextResponse.json(
                { error: "URL does not point to an image" },
                { status: 400 }
            );
        }

        const arrayBuffer = await response.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");

        // Extract filename from URL
        const urlPath = parsedUrl.pathname;
        const urlFilename = urlPath.split("/").pop() || `image-${Date.now()}`;
        const extension = contentType.split("/")[1]?.split(";")[0] || "jpg";
        const fileName = urlFilename.includes(".") ? urlFilename : `${urlFilename}.${extension}`;

        return NextResponse.json({
            base64,
            contentType,
            fileName,
            size: arrayBuffer.byteLength,
        });
    } catch (error) {
        console.error("Proxy image error:", error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Failed to fetch image" },
            { status: 500 }
        );
    }
}
