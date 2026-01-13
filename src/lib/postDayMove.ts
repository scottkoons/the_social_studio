import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp } from "firebase/firestore";
import { stripUndefined } from "@/lib/utils";
import { PostDay } from "@/lib/types";

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
 * All screens stay in sync via Firestore onSnapshot listeners.
 *
 * @param workspaceId - The workspace ID
 * @param fromDate - Source date (YYYY-MM-DD)
 * @param toDate - Target date (YYYY-MM-DD)
 * @param options - { overwrite: boolean } - whether to overwrite existing post at target
 * @returns MovePostDayResult
 */
export async function movePostDay(
    workspaceId: string,
    fromDate: string,
    toDate: string,
    options: MovePostDayOptions = {}
): Promise<MovePostDayResult> {
    const { overwrite = false } = options;

    // No-op if same date
    if (fromDate === toDate) {
        return { ok: true };
    }

    // Validate inputs
    if (!workspaceId) {
        return { ok: false, error: "Workspace ID is required" };
    }
    if (!fromDate || !toDate) {
        return { ok: false, error: "Both source and target dates are required" };
    }

    const sourceRef = doc(db, "workspaces", workspaceId, "post_days", fromDate);
    const targetRef = doc(db, "workspaces", workspaceId, "post_days", toDate);

    try {
        // Load source document
        const sourceSnap = await getDoc(sourceRef);
        if (!sourceSnap.exists()) {
            return { ok: false, error: `No post found for date ${fromDate}` };
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
        // Use stripUndefined to ensure no undefined values reach Firestore
        const newDocData = stripUndefined({
            ...sourceData,
            date: toDate,
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
