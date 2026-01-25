import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { stripUndefined, getTodayInDenver } from "@/lib/utils";
import { PostDay } from "@/lib/types";
import { generatePlatformPostingTimesForDateChange } from "@/lib/postingTime";

export interface MovePostDayOptions {
    overwrite?: boolean;
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
 * Rules:
 * - Cannot move to a past date
 * - Only one post per date allowed
 *
 * All screens stay in sync via Firestore onSnapshot listeners.
 *
 * @param workspaceId - The workspace ID
 * @param fromDocId - Source document ID (YYYY-MM-DD)
 * @param toDate - Target date (YYYY-MM-DD)
 * @param options - { overwrite: boolean }
 * @returns MovePostDayResult
 */
export async function movePostDay(
    workspaceId: string,
    fromDocId: string,
    toDate: string,
    options: MovePostDayOptions = {}
): Promise<MovePostDayResult> {
    const { overwrite = false } = options;

    // Validate inputs
    if (!workspaceId) {
        return { ok: false, error: "Workspace ID is required" };
    }
    if (!fromDocId || !toDate) {
        return { ok: false, error: "Both source and target are required" };
    }

    // Rule: Cannot move to a past date
    const today = getTodayInDenver();
    if (toDate < today) {
        return { ok: false, error: "Cannot move to a past date" };
    }

    // Target doc ID is just the date (one doc per date)
    const toDocId = toDate;

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

        // Check if target exists (rule: one post per date)
        const targetSnap = await getDoc(targetRef);
        if (targetSnap.exists() && !overwrite) {
            // Signal that confirmation is needed
            return { ok: false, needsConfirmOverwrite: true };
        }

        // Build the new document payload
        // Copy all fields from source, update date and timestamp
        // Recalculate posting times for new date (re-roll rule)
        // Use stripUndefined to ensure no undefined values reach Firestore
        // Exclude legacy fields that we don't want in new documents
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { postingTime, postingTimeSource, platform, ...sourceDataWithoutLegacy } = sourceData;

        const newPostingTimes = generatePlatformPostingTimesForDateChange(toDate);
        const newDocData = stripUndefined({
            ...sourceDataWithoutLegacy,
            date: toDate,
            postingTimeIg: newPostingTimes.ig,
            postingTimeFb: newPostingTimes.fb,
            postingTimeIgSource: "auto" as const,
            postingTimeFbSource: "auto" as const,
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
    date: string
): Promise<boolean> {
    if (!workspaceId || !date) return false;

    try {
        const docRef = doc(db, "workspaces", workspaceId, "post_days", date);
        const snap = await getDoc(docRef);
        return snap.exists();
    } catch {
        return false;
    }
}
