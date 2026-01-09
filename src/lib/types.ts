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
    userId: string;
    createdAt: Timestamp;
}
