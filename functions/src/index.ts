import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createHash } from "crypto";

initializeApp();

const db = getFirestore();
const storage = getStorage();

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

interface ImportImageRequest {
  workspaceId: string;
  dateId: string;
  imageUrl: string;
}

interface ImportImageResponse {
  success: boolean;
  assetId?: string;
  downloadUrl?: string;
  error?: string;
}

export const importImageFromUrl = onCall<ImportImageRequest>(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<ImportImageResponse> => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const uid = request.auth.uid;
    const { workspaceId, dateId, imageUrl } = request.data;

    // 2. Validate input
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new HttpsError("invalid-argument", "workspaceId is required");
    }
    if (!dateId || typeof dateId !== "string") {
      throw new HttpsError("invalid-argument", "dateId is required");
    }
    if (!imageUrl || typeof imageUrl !== "string") {
      throw new HttpsError("invalid-argument", "imageUrl is required");
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      throw new HttpsError("invalid-argument", "Invalid imageUrl format");
    }

    // 3. Check workspace membership
    const memberDoc = await db
      .collection("workspaces")
      .doc(workspaceId)
      .collection("members")
      .doc(uid)
      .get();

    if (!memberDoc.exists) {
      throw new HttpsError("permission-denied", "Not a member of this workspace");
    }

    const memberData = memberDoc.data();
    const role = memberData?.role;

    if (!role || !["owner", "admin", "editor"].includes(role)) {
      throw new HttpsError("permission-denied", "Insufficient permissions");
    }

    // 4. Fetch the remote image
    let response: Response;
    try {
      response = await fetch(imageUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "TheSocialStudio/1.0",
        },
      });

      if (!response.ok) {
        throw new HttpsError(
          "failed-precondition",
          `Failed to fetch image: HTTP ${response.status}`
        );
      }
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError(
        "failed-precondition",
        `Failed to fetch image: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    // 5. Check content-type
    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType || !ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid content type: ${contentType}. Allowed: ${ALLOWED_CONTENT_TYPES.join(", ")}`
      );
    }

    // 6. Check content-length if available
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
      throw new HttpsError(
        "invalid-argument",
        `Image too large: ${contentLength} bytes. Max: ${MAX_SIZE_BYTES} bytes`
      );
    }

    // 7. Download image bytes
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > MAX_SIZE_BYTES) {
      throw new HttpsError(
        "invalid-argument",
        `Image too large: ${buffer.length} bytes. Max: ${MAX_SIZE_BYTES} bytes`
      );
    }

    // 8. Generate hash and path
    const hash = createHash("sha256")
      .update(imageUrl + Date.now().toString())
      .digest("hex")
      .substring(0, 16);

    const ext = CONTENT_TYPE_TO_EXT[contentType] || "jpg";
    const fileName = `${hash}.${ext}`;
    const storagePath = `assets/${workspaceId}/${dateId}/${fileName}`;

    // 9. Upload to Firebase Storage
    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    await file.save(buffer, {
      metadata: {
        contentType: contentType,
        cacheControl: "public, max-age=31536000",
        metadata: {
          originalUrl: imageUrl,
          uploadedBy: uid,
        },
      },
    });

    // 10. Generate download URL
    const [downloadUrl] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500", // Far future expiry
    });

    // 11. Create asset document
    const assetId = hash;
    const assetRef = db
      .collection("workspaces")
      .doc(workspaceId)
      .collection("assets")
      .doc(assetId);

    await assetRef.set({
      id: assetId,
      workspaceId: workspaceId,
      dateId: dateId,
      storagePath: storagePath,
      downloadUrl: downloadUrl,
      originalUrl: imageUrl,
      contentType: contentType,
      size: buffer.length,
      fileName: fileName,
      createdAt: FieldValue.serverTimestamp(),
      createdBy: uid,
    });

    // 12. Update post_day document
    const postDayRef = db
      .collection("workspaces")
      .doc(workspaceId)
      .collection("post_days")
      .doc(dateId);

    await postDayRef.update({
      imageAssetId: assetId,
      imageUrl: downloadUrl,
      originalImageUrl: imageUrl,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      assetId: assetId,
      downloadUrl: downloadUrl,
    };
  }
);
