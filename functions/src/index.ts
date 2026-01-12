import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createHash, randomUUID } from "crypto";
import OpenAI from "openai";

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

// ============================================================================
// Import Image Function
// ============================================================================

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

function getFirebaseDownloadUrl(
  bucketName: string,
  storagePath: string,
  downloadToken: string
): string {
  const encodedPath = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

export const importImageFromUrl = onCall<ImportImageRequest>(
  {
    region: "us-central1",
    memory: "512MiB",
    timeoutSeconds: 60,
  },
  async (request): Promise<ImportImageResponse> => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const uid = request.auth.uid;
    const { workspaceId, dateId, imageUrl } = request.data;

    if (!workspaceId || typeof workspaceId !== "string") {
      throw new HttpsError("invalid-argument", "workspaceId is required");
    }
    if (!dateId || typeof dateId !== "string") {
      throw new HttpsError("invalid-argument", "dateId is required");
    }
    if (!imageUrl || typeof imageUrl !== "string") {
      throw new HttpsError("invalid-argument", "imageUrl is required");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(imageUrl);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Invalid protocol");
      }
    } catch {
      throw new HttpsError(
        "invalid-argument",
        `Invalid imageUrl format: "${imageUrl}". Must be a valid http/https URL.`
      );
    }

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
      throw new HttpsError("permission-denied", "Insufficient permissions to import images");
    }

    let response: Response;
    try {
      response = await fetch(imageUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "TheSocialStudio/1.0",
        },
      });
    } catch (error) {
      throw new HttpsError(
        "failed-precondition",
        `Failed to fetch image from "${imageUrl}": ${error instanceof Error ? error.message : "Network error"}`
      );
    }

    if (!response.ok) {
      throw new HttpsError(
        "failed-precondition",
        `Failed to fetch image: Server returned HTTP ${response.status} ${response.statusText}`
      );
    }

    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType) {
      throw new HttpsError(
        "invalid-argument",
        "Remote server did not return a content-type header. Cannot verify this is an image."
      );
    }
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      throw new HttpsError(
        "invalid-argument",
        `Invalid content type "${contentType}". Allowed types: ${ALLOWED_CONTENT_TYPES.join(", ")}`
      );
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
      const sizeMB = (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(2);
      throw new HttpsError(
        "invalid-argument",
        `Image too large: ${sizeMB}MB. Maximum allowed: 10MB`
      );
    }

    let buffer: Buffer;
    try {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (error) {
      throw new HttpsError(
        "failed-precondition",
        `Failed to download image data: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    if (buffer.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Downloaded image is empty (0 bytes)"
      );
    }

    if (buffer.length > MAX_SIZE_BYTES) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      throw new HttpsError(
        "invalid-argument",
        `Image too large: ${sizeMB}MB. Maximum allowed: 10MB`
      );
    }

    const hash = createHash("sha256")
      .update(imageUrl + Date.now().toString())
      .digest("hex")
      .substring(0, 16);

    const downloadToken = randomUUID();
    const ext = CONTENT_TYPE_TO_EXT[contentType] || "jpg";
    const fileName = `${hash}.${ext}`;
    const storagePath = `assets/${workspaceId}/${dateId}/${fileName}`;

    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    try {
      await file.save(buffer, {
        metadata: {
          contentType: contentType,
          cacheControl: "public, max-age=31536000",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            originalUrl: imageUrl,
            uploadedBy: uid,
          },
        },
      });
    } catch (error) {
      throw new HttpsError(
        "internal",
        `Failed to upload image to storage: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    const bucketName = bucket.name;
    const downloadUrl = getFirebaseDownloadUrl(bucketName, storagePath, downloadToken);

    const assetId = hash;
    const assetRef = db
      .collection("workspaces")
      .doc(workspaceId)
      .collection("assets")
      .doc(assetId);

    try {
      await assetRef.set({
        id: assetId,
        workspaceId: workspaceId,
        dateId: dateId,
        storagePath: storagePath,
        downloadUrl: downloadUrl,
        downloadToken: downloadToken,
        originalUrl: imageUrl,
        contentType: contentType,
        size: buffer.length,
        fileName: fileName,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: uid,
      });
    } catch (error) {
      throw new HttpsError(
        "internal",
        `Failed to create asset document: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    const postDayRef = db
      .collection("workspaces")
      .doc(workspaceId)
      .collection("post_days")
      .doc(dateId);

    try {
      await postDayRef.update({
        imageAssetId: assetId,
        imageUrl: downloadUrl,
        originalImageUrl: imageUrl,
        updatedAt: FieldValue.serverTimestamp(),
      });
    } catch (error) {
      throw new HttpsError(
        "internal",
        `Failed to update post_day document: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }

    return {
      success: true,
      assetId: assetId,
      downloadUrl: downloadUrl,
    };
  }
);

// ============================================================================
// Generate Post Copy Function
// ============================================================================

const PROMPT_VERSION = "1.0.0";
const MODEL_NAME = "gpt-4o-mini";

interface GeneratePostCopyRequest {
  workspaceId: string;
  dateId: string;
  regenerate?: boolean;
}

interface GeneratePostCopyResponse {
  success: boolean;
  status: "generated" | "already_generated" | "error";
  message?: string;
}

interface AIOutputSchema {
  ig: { caption: string; hashtags: string[] };
  fb: { caption: string; hashtags: string[] };
  confidence: number;
  needsInfo: boolean;
}

function buildPrompt(
  starterText: string | undefined,
  hasImage: boolean,
  brandVoice: string,
  hashtagStyle: "light" | "medium" | "heavy",
  dateStr: string
): string {
  const hashtagCounts = {
    light: { ig: "5-8", fb: "3-5" },
    medium: { ig: "10-15", fb: "5-8" },
    heavy: { ig: "15-20", fb: "8-10" },
  };

  const counts = hashtagCounts[hashtagStyle] || hashtagCounts.medium;

  let contextInfo = "";
  if (starterText) {
    contextInfo = `The user provided this starter text/topic: "${starterText}"`;
  } else if (hasImage) {
    contextInfo = `The user has an image for this post but no text description. Create engaging captions that work well with visual content.`;
  } else {
    contextInfo = `The user has neither text nor image for this post (date: ${dateStr}). Create a generic engaging post, but note this needs more information.`;
  }

  const brandContext = brandVoice
    ? `\n\nBrand Voice Guidelines:\n${brandVoice}`
    : "";

  return `You are a social media copywriter creating Instagram and Facebook posts.

${contextInfo}${brandContext}

Create engaging, upbeat social media captions for both Instagram and Facebook.

Requirements:
- Instagram caption: 1-2 short paragraphs max, engaging and emoji-friendly
- Facebook caption: Can be slightly longer but still concise, more conversational
- Instagram hashtags: ${counts.ig} relevant tags
- Facebook hashtags: ${counts.fb} relevant tags
- All hashtags must NOT include the "#" symbol - just the word
- No spaces in hashtags (use camelCase if needed)
- No mentions of competitors or other brands
- Keep the tone upbeat and positive
- If there's limited context, set confidence lower and needsInfo to true

Return ONLY valid JSON with this exact shape (no markdown, no code blocks, just JSON):
{
  "ig": { "caption": "...", "hashtags": ["tag1", "tag2"] },
  "fb": { "caption": "...", "hashtags": ["tag1", "tag2"] },
  "confidence": 0.0,
  "needsInfo": false
}

confidence should be 0.0-1.0:
- 0.9-1.0: Clear topic with good context
- 0.7-0.89: Reasonable context but could be better
- 0.5-0.69: Limited context, made reasonable assumptions
- 0.0-0.49: Very limited info, set needsInfo: true`;
}

function parseAIResponse(content: string): AIOutputSchema | null {
  try {
    // Try to extract JSON from the response
    let jsonStr = content.trim();

    // Remove markdown code blocks if present
    if (jsonStr.startsWith("```json")) {
      jsonStr = jsonStr.slice(7);
    } else if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.slice(3);
    }
    if (jsonStr.endsWith("```")) {
      jsonStr = jsonStr.slice(0, -3);
    }
    jsonStr = jsonStr.trim();

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (
      !parsed.ig ||
      !parsed.fb ||
      typeof parsed.ig.caption !== "string" ||
      typeof parsed.fb.caption !== "string" ||
      !Array.isArray(parsed.ig.hashtags) ||
      !Array.isArray(parsed.fb.hashtags)
    ) {
      return null;
    }

    return {
      ig: {
        caption: parsed.ig.caption,
        hashtags: parsed.ig.hashtags.map((t: string) =>
          t.replace(/^#/, "").replace(/\s+/g, "")
        ),
      },
      fb: {
        caption: parsed.fb.caption,
        hashtags: parsed.fb.hashtags.map((t: string) =>
          t.replace(/^#/, "").replace(/\s+/g, "")
        ),
      },
      confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
      needsInfo: Boolean(parsed.needsInfo),
    };
  } catch {
    return null;
  }
}

export const generatePostCopy = onCall<GeneratePostCopyRequest>(
  {
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
    secrets: ["OPENAI_API_KEY"],
  },
  async (request): Promise<GeneratePostCopyResponse> => {
    // 1. Auth check
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be authenticated");
    }

    const uid = request.auth.uid;
    const { workspaceId, dateId, regenerate = false } = request.data;

    // 2. Validate input
    if (!workspaceId || typeof workspaceId !== "string") {
      throw new HttpsError("invalid-argument", "workspaceId is required");
    }
    if (!dateId || typeof dateId !== "string") {
      throw new HttpsError("invalid-argument", "dateId is required");
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

    // 4. Load the post document
    const postRef = db
      .collection("workspaces")
      .doc(workspaceId)
      .collection("post_days")
      .doc(dateId);

    const postDoc = await postRef.get();
    if (!postDoc.exists) {
      throw new HttpsError("not-found", `Post not found for date: ${dateId}`);
    }

    const postData = postDoc.data()!;

    // 5. Check if already generated (unless regenerate is true)
    if (!regenerate && postData.ai?.ig?.caption && postData.ai?.fb?.caption) {
      return {
        success: true,
        status: "already_generated",
        message: "Content already generated. Set regenerate=true to regenerate.",
      };
    }

    // 6. Load workspace settings for brand voice
    const workspaceDoc = await db
      .collection("workspaces")
      .doc(workspaceId)
      .get();

    const workspaceData = workspaceDoc.data() || {};
    const brandVoice = workspaceData.settings?.ai?.brandVoice || "";
    const hashtagStyle = workspaceData.settings?.ai?.hashtagStyle || "medium";

    // 7. Build the prompt
    const starterText = postData.starterText;
    const hasImage = !!postData.imageAssetId;
    const prompt = buildPrompt(starterText, hasImage, brandVoice, hashtagStyle, dateId);

    // 8. Get OpenAI API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "OpenAI API key not configured");
    }

    const openai = new OpenAI({ apiKey });

    // 9. Call OpenAI
    let aiOutput: AIOutputSchema | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (!aiOutput && attempts < maxAttempts) {
      attempts++;
      try {
        const completion = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: [
            {
              role: "system",
              content: "You are a social media copywriter. Return ONLY valid JSON, no other text.",
            },
            {
              role: "user",
              content: attempts === 1 ? prompt : `${prompt}\n\nPrevious response was invalid JSON. Please return ONLY valid JSON.`,
            },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        });

        const content = completion.choices[0]?.message?.content;
        if (content) {
          aiOutput = parseAIResponse(content);
        }
      } catch (error) {
        console.error(`OpenAI API error (attempt ${attempts}):`, error);
        if (attempts >= maxAttempts) {
          // Write error to Firestore
          await postRef.update({
            status: "error",
            "ai.meta.errorMessage": error instanceof Error ? error.message : "OpenAI API error",
            "ai.meta.generatedAt": FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          });
          throw new HttpsError(
            "internal",
            `Failed to generate content: ${error instanceof Error ? error.message : "Unknown error"}`
          );
        }
      }
    }

    if (!aiOutput) {
      await postRef.update({
        status: "error",
        "ai.meta.errorMessage": "Failed to parse AI response after retries",
        "ai.meta.generatedAt": FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      throw new HttpsError("internal", "Failed to parse AI response");
    }

    // 10. Write AI output to Firestore
    await postRef.update({
      ai: {
        ig: {
          caption: aiOutput.ig.caption,
          hashtags: aiOutput.ig.hashtags,
        },
        fb: {
          caption: aiOutput.fb.caption,
          hashtags: aiOutput.fb.hashtags,
        },
        meta: {
          model: MODEL_NAME,
          generatedAt: FieldValue.serverTimestamp(),
          promptVersion: PROMPT_VERSION,
          confidence: aiOutput.confidence,
          needsInfo: aiOutput.needsInfo,
        },
      },
      status: "generated",
      updatedAt: FieldValue.serverTimestamp(),
    });

    return {
      success: true,
      status: "generated",
      message: `Generated content with ${Math.round(aiOutput.confidence * 100)}% confidence`,
    };
  }
);
