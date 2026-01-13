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
  skipped?: boolean;
  assetId?: string;
  downloadUrl?: string;
  error?: string;
  reason?: string;
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

    // Fetch the image - return skip response instead of throwing for expected failures
    let response: Response;
    try {
      response = await fetch(imageUrl, {
        redirect: "follow",
        headers: {
          "User-Agent": "TheSocialStudio/1.0",
        },
      });
    } catch (error) {
      // Network error - skip this image
      return {
        success: false,
        skipped: true,
        reason: `Could not fetch URL: ${error instanceof Error ? error.message : "Network error"}`,
      };
    }

    if (!response.ok) {
      // HTTP error - skip this image
      return {
        success: false,
        skipped: true,
        reason: `Server returned HTTP ${response.status} ${response.statusText}`,
      };
    }

    // Validate content-type
    const contentType = response.headers.get("content-type")?.split(";")[0].trim();
    if (!contentType) {
      return {
        success: false,
        skipped: true,
        reason: "No content-type header. Cannot verify this is an image.",
      };
    }
    if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
      // Common case: URL returned HTML or other non-image content
      let reason = `Not an image (${contentType})`;
      if (contentType === "text/html") {
        reason = "URL returned an HTML page, not an image";
      } else if (contentType === "application/json") {
        reason = "URL returned JSON, not an image";
      }
      return {
        success: false,
        skipped: true,
        reason,
      };
    }

    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_SIZE_BYTES) {
      const sizeMB = (parseInt(contentLength, 10) / (1024 * 1024)).toFixed(2);
      return {
        success: false,
        skipped: true,
        reason: `Image too large: ${sizeMB}MB (max 10MB)`,
      };
    }

    let buffer: Buffer;
    try {
      const arrayBuffer = await response.arrayBuffer();
      buffer = Buffer.from(arrayBuffer);
    } catch (error) {
      return {
        success: false,
        skipped: true,
        reason: `Failed to download: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    if (buffer.length === 0) {
      return {
        success: false,
        skipped: true,
        reason: "Downloaded file is empty (0 bytes)",
      };
    }

    if (buffer.length > MAX_SIZE_BYTES) {
      const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
      return {
        success: false,
        skipped: true,
        reason: `Image too large: ${sizeMB}MB (max 10MB)`,
      };
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

// ============================================================================
// Emoji Utilities for Enforcement
// ============================================================================

// We use \p{Extended_Pictographic} which covers actual pictographic emojis
// WITHOUT matching plain text characters like #, *, 0-9
// This is the correct Unicode property for "visual" emojis

// Fallback regex for environments without Unicode property support
// Covers major emoji ranges without matching plain ASCII
const EMOJI_REGEX_FALLBACK = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FAFF}]|[\u{1F000}-\u{1F02F}]|[\u{1F0A0}-\u{1F0FF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]/gu;

// Cache whether Unicode property escapes are supported
let unicodePropertiesSupported: boolean | null = null;

function supportsUnicodeProperties(): boolean {
  if (unicodePropertiesSupported === null) {
    try {
      new RegExp("\\p{Extended_Pictographic}", "u");
      unicodePropertiesSupported = true;
    } catch {
      unicodePropertiesSupported = false;
    }
  }
  return unicodePropertiesSupported;
}

// Get a fresh regex instance (needed because of lastIndex state with /g flag)
function getEmojiRegex(): RegExp {
  if (supportsUnicodeProperties()) {
    return new RegExp("\\p{Extended_Pictographic}", "gu");
  }
  return new RegExp(EMOJI_REGEX_FALLBACK.source, "gu");
}

// Find all emojis in text - handles compound emojis (ZWJ sequences) as single units
function findEmojis(text: string): string[] {
  // Use segmenter for accurate emoji counting if available (Node 16+)
  // This correctly handles compound emojis like family emojis, flags, etc.
  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const segments = [...segmenter.segment(text)];
    return segments
      .map(s => s.segment)
      .filter(segment => {
        // A grapheme is an emoji if it contains any Extended_Pictographic character
        const regex = getEmojiRegex();
        return regex.test(segment);
      });
  }

  // Fallback: simple regex matching (may not handle compound emojis perfectly)
  const regex = getEmojiRegex();
  const matches = text.match(regex);
  return matches || [];
}

// Count emojis in text
function countEmojis(text: string): number {
  return findEmojis(text).length;
}

// Strip all emojis from text
function stripEmojis(text: string): string {
  const regex = getEmojiRegex();
  // Also remove ZWJ and variation selectors that might be orphaned
  return text
    .replace(regex, "")
    .replace(/[\u200D\uFE0E\uFE0F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Trim emojis to max count (removes from end first)
function trimEmojisToMax(text: string, maxCount: number): string {
  if (maxCount <= 0) {
    return stripEmojis(text);
  }

  const emojis = findEmojis(text);
  if (emojis.length <= maxCount) {
    return text; // Already within limit
  }

  // Find positions of all emojis using grapheme segmenter if available
  const positions: { emoji: string; index: number; length: number }[] = [];

  if (typeof Intl !== "undefined" && "Segmenter" in Intl) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    const segments = [...segmenter.segment(text)];
    let currentIndex = 0;

    for (const segment of segments) {
      const regex = getEmojiRegex();
      if (regex.test(segment.segment)) {
        positions.push({
          emoji: segment.segment,
          index: currentIndex,
          length: segment.segment.length
        });
      }
      currentIndex += segment.segment.length;
    }
  } else {
    // Fallback: simple regex matching
    const regex = getEmojiRegex();
    let match;
    while ((match = regex.exec(text)) !== null) {
      positions.push({
        emoji: match[0],
        index: match.index,
        length: match[0].length
      });
    }
  }

  // Keep only the first maxCount emojis, remove the rest (from end)
  const toRemove = positions.slice(maxCount);
  let result = text;

  // Remove from end to preserve indices
  for (let i = toRemove.length - 1; i >= 0; i--) {
    const pos = toRemove[i];
    result = result.slice(0, pos.index) + result.slice(pos.index + pos.length);
  }

  // Clean up any double spaces and orphaned ZWJ/variation selectors
  return result
    .replace(/[\u200D\uFE0E\uFE0F]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Enforce emoji limits on a caption based on emojiStyle
// LIMITS: none=0, light=1, medium=2 (per caption)
type EmojiStyleType = "none" | "light" | "medium";

interface EmojiEnforcementResult {
  caption: string;
  originalCount: number;
  finalCount: number;
  stripped: number;
}

function enforceEmojiLimit(caption: string, emojiStyle: EmojiStyleType): EmojiEnforcementResult {
  const originalCount = countEmojis(caption);

  // STRICT LIMITS: none=0, light=1, medium=2
  const maxEmojis: Record<EmojiStyleType, number> = {
    none: 0,
    light: 1,
    medium: 2,
  };

  const max = maxEmojis[emojiStyle] ?? 2;

  let result: string;
  if (max === 0) {
    result = stripEmojis(caption);
  } else if (originalCount > max) {
    result = trimEmojisToMax(caption, max);
  } else {
    result = caption;
  }

  const finalCount = countEmojis(result);

  return {
    caption: result,
    originalCount,
    finalCount,
    stripped: originalCount - finalCount,
  };
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
  emojiStyle: "none" | "light" | "medium",
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

  // Emoji style instructions - STRICT enforcement rules
  // LIMITS: none=0, light=1, medium=2 (per caption)
  const emojiInstructions = {
    none: "ABSOLUTE RULE: Do NOT use ANY emojis whatsoever. ZERO emojis allowed. No exceptions. The captions must be 100% plain text only - no emoji characters of any kind.",
    light: "Use emojis VERY SPARINGLY - MAXIMUM 1 emoji per caption total. Only if essential for tone.",
    medium: "Use emojis SPARINGLY - MAXIMUM 2 emojis per caption total. Place them strategically.",
  };

  const emojiGuidance = emojiInstructions[emojiStyle] || emojiInstructions.medium;

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
- Instagram caption: 1-3 short paragraphs, engaging
- Facebook caption: Slightly longer and more informative, conversational tone
- Emoji usage: ${emojiGuidance}
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
    const emojiStyle = workspaceData.settings?.ai?.emojiStyle || "medium";

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

    const prompt = buildPrompt(starterText, brandVoice, hashtagStyle, emojiStyle, dateId, regenerate, prevOutputs);

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

        // Build system message with emoji rules - STRICT LIMITS
        const emojiSystemRule = emojiStyle === "none"
          ? "ABSOLUTE RULE: You MUST NOT use ANY emojis. ZERO emojis allowed. Plain text only."
          : emojiStyle === "light"
          ? "STRICT: Maximum 1 emoji per caption only."
          : "STRICT: Maximum 2 emojis per caption only.";

        const completion = await openai.chat.completions.create({
          model: MODEL_NAME,
          messages: [
            {
              role: "system",
              content: `You are a social media copywriter. Use ONLY the user-provided text description. Images are completely ignored - do NOT reference, describe, or assume anything about images. Do NOT mention visual elements, food appearance, or photos. ${emojiSystemRule} Return ONLY valid JSON. ${nonceMessage}`,
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

    // 10. Enforce emoji limits (server-side post-processing)
    console.info(`[EmojiEnforcement] emojiStyle=${emojiStyle}, dateId=${dateId}`);

    const igEnforcement = enforceEmojiLimit(aiOutput.ig.caption, emojiStyle as EmojiStyleType);
    const fbEnforcement = enforceEmojiLimit(aiOutput.fb.caption, emojiStyle as EmojiStyleType);

    // Apply enforced captions
    aiOutput.ig.caption = igEnforcement.caption;
    aiOutput.fb.caption = fbEnforcement.caption;

    // Log enforcement results
    if (igEnforcement.stripped > 0 || fbEnforcement.stripped > 0) {
      console.info(
        `[EmojiEnforcement] Stripped emojis - IG: ${igEnforcement.originalCount} -> ${igEnforcement.finalCount} (removed ${igEnforcement.stripped}), ` +
        `FB: ${fbEnforcement.originalCount} -> ${fbEnforcement.finalCount} (removed ${fbEnforcement.stripped})`
      );
    } else {
      console.info(
        `[EmojiEnforcement] No stripping needed - IG: ${igEnforcement.finalCount} emojis, FB: ${fbEnforcement.finalCount} emojis`
      );
    }

    // 11. Write AI output to Firestore
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
