import { Timestamp } from "firebase/firestore";

export interface PostDay {
    date: string; // YYYY-MM-DD, also used as Firestore doc ID
    starterText?: string;
    imageAssetId?: string;
    status: "input" | "generated" | "edited" | "sent" | "error";
    ai?: {
        igCaption: string;
        fbCaption: string;
        igHashtags: string[];
        fbHashtags: string[];
        flags: string[];
        confidence: number;
    };
    buffer?: {
        pushedAt?: Timestamp;
    };
    createdAt: Timestamp;
    updatedAt: Timestamp;
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
