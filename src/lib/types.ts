import { Timestamp } from "firebase/firestore";

// Lifecycle status for post workflow tracking
export type LifecycleStatus = "draft" | "exported" | "uploaded" | "posted" | "canceled";

// Export batch record for tracking exports
export interface ExportBatch {
    id?: string; // Firestore doc ID
    createdAt: Timestamp;
    createdBy: string; // uid
    platforms: ("instagram" | "facebook")[];
    dateRange: { start: string; end: string };
    postIds: string[];
    counts: { exported: number; skippedNoImage: number; skippedNoCaption: number };
    filenames: string[];
    mode: "buffer_csv";
}

export interface PostDayAI {
    ig: {
        caption: string;
        hashtags: string[];
    };
    fb: {
        caption: string;
        hashtags: string[];
    };
    meta: {
        model: string;
        generatedAt: Timestamp;
        promptVersion: string;
        confidence: number;
        needsInfo?: boolean;
        errorMessage?: string;
    };
}

export type PostPlatform = "facebook" | "instagram";

export interface PostDay {
    docId?: string; // Firestore document ID (new format: YYYY-MM-DD-platform, legacy: YYYY-MM-DD)
    date: string; // YYYY-MM-DD
    platform?: PostPlatform; // facebook or instagram (legacy posts may not have this)
    generationMode?: GenerationMode; // How AI generates content: image (analyze image only), hybrid (image + guidance), text (guidance only)
    starterText?: string; // Used as guidance text for hybrid/text modes
    imageAssetId?: string;
    imageUrl?: string; // Direct download URL (set by importImageFromUrl)
    postingTime?: string; // "HH:MM" 24-hour, Denver local time (legacy, single time)
    postingTimeSource?: "auto" | "manual"; // How the posting time was set (legacy)
    postingTimeIg?: string; // Instagram posting time "HH:MM" 24-hour, Denver local time
    postingTimeFb?: string; // Facebook posting time "HH:MM" 24-hour, Denver local time
    postingTimeIgSource?: "auto" | "manual"; // How the IG posting time was set
    postingTimeFbSource?: "auto" | "manual"; // How the FB posting time was set
    status: "input" | "generated" | "edited" | "sent" | "error";
    ai?: PostDayAI;
    buffer?: {
        pushedAt?: Timestamp;
    };
    // Lifecycle tracking fields
    lifecycleStatus?: LifecycleStatus;
    lastExportedAt?: Timestamp;
    lastExportBatchId?: string;
    lastExportFilename?: string;
    lastUploadedAt?: Timestamp;
    editedAfterUpload?: boolean;
    notes?: string;
    // Timestamps
    createdAt: Timestamp;
    updatedAt: Timestamp;
}

// Helper to get the document ID for a post
export function getPostDocId(post: PostDay): string {
    // Use docId if available (set when loading from Firestore)
    if (post.docId) return post.docId;
    // For new posts with platform, use date-platform format
    if (post.platform) return `${post.date}-${post.platform}`;
    // Legacy fallback: just the date
    return post.date;
}

export type HashtagStyle = "light" | "medium" | "heavy";
export type EmojiStyle = "low" | "medium" | "high";
export type GenerationMode = "image" | "hybrid" | "text";

// Default avoid words with synonym mappings for post-processing enforcement
export const AVOID_WORDS_SYNONYMS: Record<string, string[]> = {
    indulge: ["enjoy", "dig into", "try", "savor", "stop in for"],
    // Add more mappings as needed
};

export interface WorkspaceAISettings {
    brandVoice: string;
    hashtagStyle: HashtagStyle;
    emojiStyle: EmojiStyle;
}

export interface Asset {
    id: string;
    storagePath: string;
    fileName: string;
    contentType: string;
    size: number;
    workspaceId: string;
    createdAt: Timestamp;
}

export type MemberRole = "owner" | "admin" | "editor" | "viewer";

export interface Workspace {
    id: string;
    name: string;
    ownerUid: string;
    createdAt: Timestamp;
}

export interface WorkspaceMember {
    uid: string;
    role: MemberRole;
    createdAt: Timestamp;
}

export interface UserProfile {
    email: string;
    displayName?: string;
    defaultWorkspaceId?: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
}
