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

const PROMPT_VERSION = "3.0.0"; // Text-only prompts (no image analysis)
const MODEL_NAME = "gpt-4o-mini"; // Text-only model (cheaper, no vision needed)

// Global hashtags that are automatically appended to all generated posts
const GLOBAL_HASHTAGS = [
  "#ColoradoMountainBrewery",
  "#TrueTasteOfColorado",
  "#ColoradoSprings",
];

// Appends global hashtags with case-insensitive deduplication
function appendGlobalHashtags(hashtags: string[]): string[] {
  const lowerSet = new Set(hashtags.map(tag => tag.toLowerCase()));
  const result = [...hashtags];

  for (const globalTag of GLOBAL_HASHTAGS) {
    if (!lowerSet.has(globalTag.toLowerCase())) {
      result.push(globalTag);
      lowerSet.add(globalTag.toLowerCase());
    }
  }

  return result;
}

interface PreviousOutputs {
  igCaption?: string;
  igHashtags?: string[];
  fbCaption?: string;
  fbHashtags?: string[];
}

interface GeneratePostCopyRequest {
  workspaceId: string;
  dateId: string;
  regenerate?: boolean;
  previousOutputs?: PreviousOutputs;
  requestId?: string;
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
  brandVoice: string,
  hashtagStyle: "light" | "medium" | "heavy",
  dateStr: string,
  isRegenerate: boolean = false,
  previousOutputs?: PreviousOutputs
): string {
  const hashtagCounts = {
    light: { ig: "5-8", fb: "3-5" },
    medium: { ig: "10-15", fb: "5-8" },
    heavy: { ig: "15-20", fb: "8-10" },
  };

  const counts = hashtagCounts[hashtagStyle] || hashtagCounts.medium;

  // Build context based ONLY on user-provided text
  let contextInfo = "";
  if (starterText) {
    contextInfo = `User-provided description/notes: "${starterText}"`;
  } else {
    contextInfo = `No description provided for this post (date: ${dateStr}). Create a generic engaging post and set needsInfo to true.`;
  }

  const brandContext = brandVoice
    ? `\n\nBrand Voice Guidelines:\n${brandVoice}`
    : "";

  // Build regeneration context to avoid repeating previous outputs
  let regenerateContext = "";
  if (isRegenerate && previousOutputs) {
    const avoidPhrases: string[] = [];
    if (previousOutputs.igCaption) {
      avoidPhrases.push(`Previous IG caption: "${previousOutputs.igCaption}"`);
    }
    if (previousOutputs.fbCaption) {
      avoidPhrases.push(`Previous FB caption: "${previousOutputs.fbCaption}"`);
    }
    if (previousOutputs.igHashtags?.length) {
      avoidPhrases.push(`Previous IG hashtags: ${previousOutputs.igHashtags.join(", ")}`);
    }
    if (previousOutputs.fbHashtags?.length) {
      avoidPhrases.push(`Previous FB hashtags: ${previousOutputs.fbHashtags.join(", ")}`);
    }

    if (avoidPhrases.length > 0) {
      regenerateContext = `

REGENERATION REQUEST: This is a regeneration. You MUST produce a MATERIALLY DIFFERENT variation from the previous output while staying on-brand. Use different wording, sentence structure, and emoji placement. Choose different but equally relevant hashtags.

AVOID REPEATING THESE (produce something fresh and different):
${avoidPhrases.join("\n")}`;
    }
  }

  return `You are a social media copywriter creating Instagram and Facebook posts.

${contextInfo}${brandContext}${regenerateContext}

CRITICAL RULES:
- Use ONLY the user-provided text above. Nothing else.
- Do NOT reference, describe, or assume anything about images.
- Do NOT mention visual elements, food appearance, plating, colors, or what any photo might show.
- If no description is provided, create generic engaging content and set needsInfo to true.
- Do NOT invent dishes, events, or promotions not explicitly mentioned in the text.

Create engaging, upbeat social media captions for both Instagram and Facebook.

Requirements:
- Instagram caption: 1-3 short paragraphs, engaging and emoji-friendly
- Facebook caption: Slightly longer and more informative, conversational tone
- Instagram hashtags: ${counts.ig} relevant tags derived ONLY from the provided text
- Facebook hashtags: ${counts.fb} relevant tags derived ONLY from the provided text
- All hashtags MUST include the "#" symbol (e.g. #FallSpecial, #DinnerTime)
- No spaces in hashtags (use camelCase if needed)
- No mentions of competitors or other brands
- Keep the tone upbeat and positive
- If there's limited context, set confidence lower and needsInfo to true${isRegenerate ? "\n- IMPORTANT: Create a FRESH, DIFFERENT variation - do not repeat the previous captions or hashtags" : ""}

Return ONLY valid JSON with this exact shape (no markdown, no code blocks, just JSON):
{
  "ig": { "caption": "...", "hashtags": ["#tag1", "#tag2"] },
  "fb": { "caption": "...", "hashtags": ["#tag1", "#tag2"] },
  "confidence": 0.0,
  "needsInfo": false
}

confidence should be 0.0-1.0:
- 0.9-1.0: Clear text context with good detail (topic, event, promo details)
- 0.7-0.89: Reasonable context but could use more detail
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

    // Normalize hashtags: ensure # prefix, trim, filter empty
    const normalizeHashtag = (t: string): string => {
      const cleaned = t.trim().replace(/\s+/g, "");
      if (!cleaned) return "";
      return cleaned.startsWith("#") ? cleaned : `#${cleaned}`;
    };

    const normalizeHashtagsArray = (tags: string[]): string[] => {
      return tags
        .map((t: string) => normalizeHashtag(t))
        .filter((t: string) => t !== "" && t !== "#");
    };

    // Normalize then append global hashtags
    const igHashtags = appendGlobalHashtags(normalizeHashtagsArray(parsed.ig.hashtags));
    const fbHashtags = appendGlobalHashtags(normalizeHashtagsArray(parsed.fb.hashtags));

    return {
      ig: {
        caption: parsed.ig.caption,
        hashtags: igHashtags,
      },
      fb: {
        caption: parsed.fb.caption,
        hashtags: fbHashtags,
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

    // 7. Get OpenAI client
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "OpenAI API key not configured");
    }
    const openai = new OpenAI({ apiKey });

    // 8. Build the prompt using ONLY user-provided text (images are completely ignored)
    const starterText = postData.starterText;

    // For regeneration, get previous outputs from request or current post data
    let prevOutputs: PreviousOutputs | undefined;
    if (regenerate) {
      prevOutputs = request.data.previousOutputs || {
        igCaption: postData.ai?.ig?.caption,
        igHashtags: postData.ai?.ig?.hashtags,
        fbCaption: postData.ai?.fb?.caption,
        fbHashtags: postData.ai?.fb?.hashtags,
      };
    }

    const prompt = buildPrompt(starterText, brandVoice, hashtagStyle, dateId, regenerate, prevOutputs);

    // Generate unique request ID for cache-busting and prompt variation
    const requestId = request.data.requestId || randomUUID();

    // 9. Call OpenAI for caption generation (text-only, no image interpretation)
    let aiOutput: AIOutputSchema | null = null;
    let attempts = 0;
    const maxAttempts = 2;

    while (!aiOutput && attempts < maxAttempts) {
      attempts++;
      try {
        // Include requestId as a nonce to ensure each request is unique
        const nonceMessage = `[Request ID: ${requestId}${regenerate ? " - REGENERATION" : ""}]`;

        const promptText = attempts === 1 ? prompt : `${prompt}\n\nPrevious response was invalid JSON. Please return ONLY valid JSON.`;

        const completion = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: [
            {
              role: "system",
              content: `You are a social media copywriter. Use ONLY the user-provided text description. Images are completely ignored - do NOT reference, describe, or assume anything about images. Do NOT mention visual elements, food appearance, or photos. Return ONLY valid JSON. ${nonceMessage}`,
            },
            {
              role: "user",
              content: promptText,
            },
          ],
          temperature: 0.8, // Higher temperature for more variation
          top_p: 0.95, // Enable nucleus sampling for diversity
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
