import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { stripUndefined } from "@/lib/utils";
import { PostDay, PostPlatform } from "@/lib/types";
import { generatePostingTimeForDateChange } from "@/lib/postingTime";

export interface MovePostDayOptions {
    overwrite?: boolean;
    platform?: PostPlatform; // Platform for the post (used for new doc ID format)
}

export interface MovePostDayResult {
    ok: boolean;
    needsConfirmOverwrite?: boolean;
    error?: string;
}

/**
 * Moves a post from one date to another.
 *
 * This is the single source of truth for date-change logic used by:
 * - Input page (TableRow date change)
 * - Review page (inline date edit)
 * - Calendar drag/drop
 * - Calendar edit modal
 *
 * All screens stay in sync via Firestore onSnapshot listeners.
 *
 * @param workspaceId - The workspace ID
 * @param fromDocId - Source document ID (can be "YYYY-MM-DD" or "YYYY-MM-DD-platform")
 * @param toDate - Target date (YYYY-MM-DD)
 * @param options - { overwrite: boolean, platform?: PostPlatform }
 * @returns MovePostDayResult
 */
export async function movePostDay(
    workspaceId: string,
    fromDocId: string,
    toDate: string,
    options: MovePostDayOptions = {}
): Promise<MovePostDayResult> {
    const { overwrite = false, platform } = options;

    // Validate inputs
    if (!workspaceId) {
        return { ok: false, error: "Workspace ID is required" };
    }
    if (!fromDocId || !toDate) {
        return { ok: false, error: "Both source and target are required" };
    }

    // Determine the target doc ID based on platform
    // If platform is provided, use new format: YYYY-MM-DD-platform
    // Otherwise, use the legacy format: YYYY-MM-DD
    const toDocId = platform ? `${toDate}-${platform}` : toDate;

    // No-op if same document
    if (fromDocId === toDocId) {
        return { ok: true };
    }

    const sourceRef = doc(db, "workspaces", workspaceId, "post_days", fromDocId);
    const targetRef = doc(db, "workspaces", workspaceId, "post_days", toDocId);

    try {
        // Load source document
        const sourceSnap = await getDoc(sourceRef);
        if (!sourceSnap.exists()) {
            return { ok: false, error: `No post found with ID ${fromDocId}` };
        }

        const sourceData = sourceSnap.data() as PostDay;

        // Check if target exists
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists() && !overwrite) {
            // Signal that confirmation is needed
            return { ok: false, needsConfirmOverwrite: true };
        }

        // Build the new document payload
        // Copy all fields from source, update date and timestamp
        // Recalculate posting time for new date (re-roll rule)
        // Use stripUndefined to ensure no undefined values reach Firestore
        const newPostingTime = generatePostingTimeForDateChange(toDate);
        const newDocData = stripUndefined({
            ...sourceData,
            date: toDate,
            platform: platform || sourceData.platform, // Preserve platform
            postingTime: newPostingTime,
            postingTimeSource: "auto" as const,
            updatedAt: serverTimestamp(),
        });

        // Write to target
        await setDoc(targetRef, newDocData);

        // Delete source document
        await deleteDoc(sourceRef);

        return { ok: true };

    } catch (err) {
        console.error("movePostDay error:", err);
        return {
            ok: false,
            error: err instanceof Error ? err.message : "Failed to move post"
        };
    }
}

/**
 * Checks if moving to a date would require overwriting an existing post.
 * Useful for pre-checking before showing UI.
 */
export async function checkPostExistsAtDate(
    workspaceId: string,
    date: string,
    platform?: PostPlatform
): Promise<boolean> {
    if (!workspaceId || !date) return false;

    try {
        // Check using the appropriate doc ID format
        const docId = platform ? `${date}-${platform}` : date;
        const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);
        const snap = await getDoc(docRef);
        return snap.exists();
    } catch {
        return false;
    }
}
