import { PostDay } from "./types";
import { isStrictlyFutureInDenver } from "./utils";
import { serverTimestamp, Timestamp } from "firebase/firestore";

export interface BufferResult {
    success: boolean;
    message: string;
    pushedAt?: any;
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

    // Simulate API call
    console.log("Sending to Buffer:", post);

    return {
        success: true,
        message: "Successfully pushed to Buffer (stub).",
        pushedAt: serverTimestamp()
    };
}
