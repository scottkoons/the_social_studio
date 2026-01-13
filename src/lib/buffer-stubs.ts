import { PostDay } from "./types";
import { isStrictlyFutureInDenver } from "./utils";
import { serverTimestamp } from "firebase/firestore";

export interface BufferResult {
    success: boolean;
    message: string;
    pushedAt?: any;
}

/**
 * Formats an array of hashtags for Buffer.
 * - Trims whitespace
 * - Ignores empty values
 * - Ensures each starts with # (for backwards compatibility with older data)
 * - Joins with a single space
 */
export function formatHashtags(hashtags: string[]): string {
    return hashtags
        .map(tag => tag.trim())
        .filter(tag => tag !== "")
        .map(tag => tag.startsWith("#") ? tag : `#${tag}`)
        .join(" ");
}

/**
 * Builds the final text for Buffer by combining caption and formatted hashtags.
 * Hashtags are appended after a blank line.
 */
export function buildBufferText(caption: string, hashtags: string[]): string {
    const formattedHashtags = formatHashtags(hashtags);
    if (!formattedHashtags) {
        return caption.trim();
    }
    return `${caption.trim()}\n\n${formattedHashtags}`;
}

/**
 * Stubs sending a post to Buffer.
 */
export async function sendToBufferStub(post: PostDay): Promise<BufferResult> {
    if (!isStrictlyFutureInDenver(post.date)) {
        return {
            success: false,
            message: `Row with date ${post.date} is not in the future. Today counts as past.`
        };
    }

    // Build formatted text for each platform
    const igText = post.ai?.ig
        ? buildBufferText(post.ai.ig.caption, post.ai.ig.hashtags)
        : "";
    const fbText = post.ai?.fb
        ? buildBufferText(post.ai.fb.caption, post.ai.fb.hashtags)
        : "";

    // Simulate API call with formatted output
    console.log("Sending to Buffer:", {
        date: post.date,
        instagram: igText,
        facebook: fbText,
    });

    return {
        success: true,
        message: "Successfully pushed to Buffer (stub).",
        pushedAt: serverTimestamp()
    };
}
