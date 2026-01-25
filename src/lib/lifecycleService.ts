import { db } from "./firebase";
import {
    collection,
    doc,
    writeBatch,
    serverTimestamp,
    Timestamp,
    query,
    where,
    getDocs,
} from "firebase/firestore";
import { PostDay, LifecycleStatus, ExportBatch } from "./types";

/**
 * Gets the effective lifecycle status for a post, with fallback to "draft" for legacy data.
 */
export function getLifecycleStatus(post: PostDay): LifecycleStatus {
    return post.lifecycleStatus || "draft";
}

/**
 * Creates an export batch record and updates all exported posts atomically.
 * Posts that were skipped (no image/caption) are NOT updated.
 */
export async function createExportBatch(params: {
    workspaceId: string;
    userId: string;
    platforms: ("instagram" | "facebook")[];
    exportedPostIds: string[];
    skippedNoImage: number;
    skippedNoCaption: number;
    filenames: string[];
    posts: PostDay[];
}): Promise<{ batchId: string }> {
    const {
        workspaceId,
        userId,
        platforms,
        exportedPostIds,
        skippedNoImage,
        skippedNoCaption,
        filenames,
        posts,
    } = params;

    // Calculate date range from exported posts
    const exportedPosts = posts.filter((p) =>
        exportedPostIds.includes(p.docId || p.date)
    );
    const dates = exportedPosts.map((p) => p.date).sort();
    const dateRange = {
        start: dates[0] || "",
        end: dates[dates.length - 1] || "",
    };

    // Create batch document
    const batchRef = doc(collection(db, "workspaces", workspaceId, "export_batches"));
    const batchId = batchRef.id;

    const exportBatchData: Omit<ExportBatch, "id"> = {
        createdAt: serverTimestamp() as Timestamp,
        createdBy: userId,
        platforms,
        dateRange,
        postIds: exportedPostIds,
        counts: {
            exported: exportedPostIds.length,
            skippedNoImage,
            skippedNoCaption,
        },
        filenames,
        mode: "buffer_csv",
    };

    // Use Firestore batch for atomic updates
    const batch = writeBatch(db);

    // Create the export batch document
    batch.set(batchRef, exportBatchData);

    // Update each exported post with lifecycle metadata
    for (const postId of exportedPostIds) {
        const postRef = doc(db, "workspaces", workspaceId, "post_days", postId);
        const post = posts.find((p) => (p.docId || p.date) === postId);
        const currentStatus = post?.lifecycleStatus;

        // Determine new status: preserve "uploaded" or "posted" if already set
        const shouldPreserveStatus =
            currentStatus === "uploaded" || currentStatus === "posted";

        const updateData: Record<string, unknown> = {
            lastExportedAt: serverTimestamp(),
            lastExportBatchId: batchId,
            lastExportFilename: filenames[0] || "",
            updatedAt: serverTimestamp(),
        };

        // Only update lifecycleStatus if not already uploaded/posted
        if (!shouldPreserveStatus) {
            updateData.lifecycleStatus = "exported";
        }

        batch.update(postRef, updateData);
    }

    // Commit all changes atomically
    await batch.commit();

    return { batchId };
}

/**
 * Marks all exported posts as uploaded.
 * Only updates posts with lifecycleStatus = "exported".
 */
export async function markPostsAsUploaded(params: {
    workspaceId: string;
    postIds?: string[]; // Optional: specific posts to mark. If not provided, marks all exported posts.
}): Promise<{ updatedCount: number }> {
    const { workspaceId, postIds } = params;

    // Get posts to update
    const postsRef = collection(db, "workspaces", workspaceId, "post_days");
    let postsToUpdate: string[] = [];

    if (postIds && postIds.length > 0) {
        // Use provided post IDs
        postsToUpdate = postIds;
    } else {
        // Query for all exported posts
        const q = query(postsRef, where("lifecycleStatus", "==", "exported"));
        const snapshot = await getDocs(q);
        postsToUpdate = snapshot.docs.map((doc) => doc.id);
    }

    if (postsToUpdate.length === 0) {
        return { updatedCount: 0 };
    }

    // Firestore batch writes have a limit of 500 operations
    const BATCH_SIZE = 500;
    let updatedCount = 0;

    for (let i = 0; i < postsToUpdate.length; i += BATCH_SIZE) {
        const batchPostIds = postsToUpdate.slice(i, i + BATCH_SIZE);
        const batch = writeBatch(db);

        for (const postId of batchPostIds) {
            const postRef = doc(db, "workspaces", workspaceId, "post_days", postId);
            batch.update(postRef, {
                lifecycleStatus: "uploaded",
                lastUploadedAt: serverTimestamp(),
                editedAfterUpload: false,
                updatedAt: serverTimestamp(),
            });
            updatedCount++;
        }

        await batch.commit();
    }

    return { updatedCount };
}

/**
 * Gets the count of posts by lifecycle status.
 */
export function getLifecycleCounts(posts: PostDay[]): Record<LifecycleStatus, number> {
    const counts: Record<LifecycleStatus, number> = {
        draft: 0,
        exported: 0,
        uploaded: 0,
        posted: 0,
        canceled: 0,
    };

    for (const post of posts) {
        const status = getLifecycleStatus(post);
        counts[status]++;
    }

    return counts;
}

/**
 * Marks a single post's editedAfterUpload flag when edited after being uploaded or posted.
 * Should be called when any AI content is modified on an uploaded/posted post.
 */
export async function markPostEditedAfterUpload(
    workspaceId: string,
    postId: string,
    currentStatus: LifecycleStatus | undefined
): Promise<void> {
    // Only mark if the post is already uploaded or posted
    if (currentStatus !== "uploaded" && currentStatus !== "posted") {
        return;
    }

    const postRef = doc(db, "workspaces", workspaceId, "post_days", postId);
    const batch = writeBatch(db);
    batch.update(postRef, {
        editedAfterUpload: true,
        updatedAt: serverTimestamp(),
    });
    await batch.commit();
}
