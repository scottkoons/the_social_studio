import { onCall, HttpsError } from "firebase-functions/v2/https";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { createHash, randomUUID } from "crypto";
import OpenAI from "openai";
import sharp from "sharp";

initializeApp();

const db = getFirestore();
const storage = getStorage();

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_DIMENSION = 1920; // Max width or height for optimization
const WEBP_QUALITY = 85; // WebP quality (0-100)

const ALLOWED_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

/**
 * Optimizes an image buffer: resizes if needed and converts to WebP
 */
async function optimizeImageBuffer(
  buffer: Buffer
): Promise<{ buffer: Buffer; width: number; height: number }> {
  // Get image metadata
  const metadata = await sharp(buffer).metadata();
  const { width = 0, height = 0 } = metadata;

  let pipeline = sharp(buffer);

  // Resize if either dimension exceeds max
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    pipeline = pipeline.resize(MAX_DIMENSION, MAX_DIMENSION, {
      fit: "inside",
      withoutEnlargement: true,
    });
  }

  // Convert to WebP
  const optimizedBuffer = await pipeline
    .webp({ quality: WEBP_QUALITY })
    .toBuffer();

  // Get final dimensions
  const finalMetadata = await sharp(optimizedBuffer).metadata();

  return {
    buffer: optimizedBuffer,
    width: finalMetadata.width || width,
    height: finalMetadata.height || height,
  };
}

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

    // Optimize image: resize if needed and convert to WebP
    let optimizedBuffer: Buffer;
    let imageWidth: number;
    let imageHeight: number;

    try {
      const optimized = await optimizeImageBuffer(buffer);
      optimizedBuffer = optimized.buffer;
      imageWidth = optimized.width;
      imageHeight = optimized.height;
    } catch (error) {
      return {
        success: false,
        skipped: true,
        reason: `Failed to optimize image: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }

    const hash = createHash("sha256")
      .update(imageUrl + Date.now().toString())
      .digest("hex")
      .substring(0, 16);

    const downloadToken = randomUUID();
    // Always use .webp extension since we convert to WebP
    const fileName = `${hash}.webp`;
    const storagePath = `assets/${workspaceId}/${dateId}/${fileName}`;

    const bucket = storage.bucket();
    const file = bucket.file(storagePath);

    try {
      await file.save(optimizedBuffer, {
        metadata: {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000",
          metadata: {
            firebaseStorageDownloadTokens: downloadToken,
            originalUrl: imageUrl,
            uploadedBy: uid,
            originalContentType: contentType,
            width: String(imageWidth),
            height: String(imageHeight),
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
        contentType: "image/webp",
        originalContentType: contentType,
        size: optimizedBuffer.length,
        width: imageWidth,
        height: imageHeight,
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

const PROMPT_VERSION = "4.0.0"; // Supports image analysis when no starter text
const MODEL_NAME_TEXT = "gpt-4o-mini"; // Text-only model (cheaper)
const MODEL_NAME_VISION = "gpt-4o"; // Vision model for image analysis

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
// LIMITS: low=0-1, medium=2-4, high=5-8 (per caption)
type EmojiStyleType = "low" | "medium" | "high";

interface EmojiEnforcementResult {
  caption: string;
  originalCount: number;
  finalCount: number;
  stripped: number;
  added: number;
}

// Pool of emojis to add when AI doesn't generate enough
const EMOJI_POOL = [
  "🎉", "✨", "🔥", "❤️", "🙌", "💯", "👏", "🍻", "🍺", "⭐",
  "💪", "🎊", "👍", "😍", "🥳", "💥", "🌟", "😊", "🤩", "💫"
];

// Add emojis to caption to meet minimum requirement
function addEmojisToCaption(caption: string, countToAdd: number): string {
  if (countToAdd <= 0) return caption;

  // Get emojis already in the caption to avoid duplicates
  const existingEmojis = new Set(findEmojis(caption));

  // Filter pool to avoid duplicates
  const availableEmojis = EMOJI_POOL.filter(e => !existingEmojis.has(e));

  // Shuffle available emojis for variety
  const shuffled = [...availableEmojis].sort(() => Math.random() - 0.5);

  // Take what we need
  const emojisToAdd = shuffled.slice(0, countToAdd);

  // If we don't have enough unique emojis, add duplicates from pool
  while (emojisToAdd.length < countToAdd) {
    emojisToAdd.push(EMOJI_POOL[Math.floor(Math.random() * EMOJI_POOL.length)]);
  }

  // Strategy: distribute emojis throughout the caption
  // Split caption into sentences/phrases
  const sentences = caption.split(/(?<=[.!?])\s+/);

  if (sentences.length === 1) {
    // Single sentence - add emojis at end
    return caption + " " + emojisToAdd.join(" ");
  }

  // Multiple sentences - distribute emojis
  let result = "";
  let emojiIndex = 0;

  for (let i = 0; i < sentences.length; i++) {
    result += sentences[i];

    // Add emoji after some sentences (not all, to look natural)
    if (emojiIndex < emojisToAdd.length && (i % 2 === 0 || i === sentences.length - 1)) {
      result += " " + emojisToAdd[emojiIndex];
      emojiIndex++;
    }

    if (i < sentences.length - 1) {
      result += " ";
    }
  }

  // Add any remaining emojis at the end
  while (emojiIndex < emojisToAdd.length) {
    result += " " + emojisToAdd[emojiIndex];
    emojiIndex++;
  }

  return result;
}

function enforceEmojiLimit(caption: string, emojiStyle: EmojiStyleType): EmojiEnforcementResult {
  const originalCount = countEmojis(caption);

  // LIMITS: low=0-1, medium=2-4, high=5-8 (per caption)
  const emojiLimits: Record<EmojiStyleType, { min: number; max: number }> = {
    low: { min: 0, max: 1 },
    medium: { min: 2, max: 4 },
    high: { min: 5, max: 8 },
  };

  const limits = emojiLimits[emojiStyle] ?? { min: 0, max: 1 };

  let result: string = caption;
  let added = 0;
  let stripped = 0;

  // First, add emojis if below minimum
  if (originalCount < limits.min) {
    const toAdd = limits.min - originalCount;
    result = addEmojisToCaption(result, toAdd);
    added = toAdd;
  }

  // Then, strip emojis if above maximum
  const currentCount = countEmojis(result);
  if (currentCount > limits.max) {
    result = trimEmojisToMax(result, limits.max);
    stripped = currentCount - limits.max;
  }

  const finalCount = countEmojis(result);

  return {
    caption: result,
    originalCount,
    finalCount,
    stripped,
    added,
  };
}

// ============================================================================
// Avoid Words Utilities for Post-Processing Enforcement
// ============================================================================

// Synonym map for replacing avoided words
const AVOID_WORDS_SYNONYMS: Record<string, string[]> = {
  indulge: ["enjoy", "dig into", "try", "savor", "stop in for"],
  // Add more mappings as needed
};

// Parse comma-separated avoid words string into array
function parseAvoidWords(avoidWordsStr: string): string[] {
  if (!avoidWordsStr || !avoidWordsStr.trim()) return [];
  return avoidWordsStr
    .split(",")
    .map(w => w.trim().toLowerCase())
    .filter(w => w.length > 0);
}

// Check if text starts with any avoided word (case-insensitive)
function startsWithAvoidedWord(text: string, avoidWords: string[]): string | null {
  const lowerText = text.toLowerCase().trim();
  for (const word of avoidWords) {
    // Check if starts with the word followed by space or punctuation
    const pattern = new RegExp(`^${escapeRegex(word)}(?:\\s|[.,!?;:]|$)`, "i");
    if (pattern.test(lowerText)) {
      return word;
    }
  }
  return null;
}

// Escape special regex characters
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Get a random synonym for an avoided word
function getSynonym(word: string): string {
  const lowerWord = word.toLowerCase();
  const synonyms = AVOID_WORDS_SYNONYMS[lowerWord];
  if (synonyms && synonyms.length > 0) {
    return synonyms[Math.floor(Math.random() * synonyms.length)];
  }
  // Default fallback synonyms if no specific mapping
  const defaultSynonyms = ["enjoy", "try", "check out", "experience"];
  return defaultSynonyms[Math.floor(Math.random() * defaultSynonyms.length)];
}

// Replace avoided word with synonym (preserves case of first letter)
function replaceAvoidedWord(text: string, word: string, synonym: string): string {
  const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
  return text.replace(pattern, (match) => {
    // Preserve capitalization
    if (match[0] === match[0].toUpperCase()) {
      return synonym.charAt(0).toUpperCase() + synonym.slice(1);
    }
    return synonym;
  });
}

// Rewrite first sentence if it starts with avoided word
function rewriteFirstSentence(text: string, avoidedWord: string): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences.length === 0) return text;

  const firstSentence = sentences[0];
  const synonym = getSynonym(avoidedWord);

  // Replace the avoided word at the start with the synonym
  const pattern = new RegExp(`^${escapeRegex(avoidedWord)}`, "i");
  sentences[0] = firstSentence.replace(pattern, (match) => {
    if (match[0] === match[0].toUpperCase()) {
      return synonym.charAt(0).toUpperCase() + synonym.slice(1);
    }
    return synonym;
  });

  return sentences.join(" ");
}

// Batch tracking for avoid-word frequency limits
interface AvoidWordsUsageTracker {
  usage: Map<string, number>;
  maxPerBatch: number;
}

function createAvoidWordsTracker(
  maxPerBatch: number = 1,
  initialUsage?: Record<string, number>
): AvoidWordsUsageTracker {
  const usage = new Map<string, number>();
  if (initialUsage) {
    for (const [word, count] of Object.entries(initialUsage)) {
      usage.set(word, count);
    }
  }
  return {
    usage,
    maxPerBatch,
  };
}

// Convert tracker usage to plain object for response
function trackerUsageToObject(tracker: AvoidWordsUsageTracker): Record<string, number> {
  const result: Record<string, number> = {};
  for (const [word, count] of tracker.usage) {
    result[word] = count;
  }
  return result;
}

// Enforce avoid-words rules on a caption
function enforceAvoidWords(
  caption: string,
  avoidWords: string[],
  tracker: AvoidWordsUsageTracker
): string {
  if (avoidWords.length === 0) return caption;

  let result = caption;

  // Rule 1: Never start with an avoided word
  const startsWithAvoided = startsWithAvoidedWord(result, avoidWords);
  if (startsWithAvoided) {
    result = rewriteFirstSentence(result, startsWithAvoided);
    console.info(`[AvoidWords] Rewrote first sentence starting with "${startsWithAvoided}"`);
  }

  // Rule 2: Enforce frequency limit across batch
  for (const word of avoidWords) {
    const pattern = new RegExp(`\\b${escapeRegex(word)}\\b`, "gi");
    const matches = result.match(pattern);

    if (matches && matches.length > 0) {
      const currentUsage = tracker.usage.get(word) || 0;
      const allowedRemaining = tracker.maxPerBatch - currentUsage;

      if (allowedRemaining <= 0) {
        // Already exceeded - replace all occurrences
        const synonym = getSynonym(word);
        result = replaceAvoidedWord(result, word, synonym);
        console.info(`[AvoidWords] Replaced all "${word}" with "${synonym}" (batch limit exceeded)`);
      } else if (matches.length > allowedRemaining) {
        // Need to replace some occurrences
        let replaced = 0;
        const toReplace = matches.length - allowedRemaining;

        result = result.replace(pattern, (match) => {
          if (replaced < toReplace) {
            replaced++;
            const synonym = getSynonym(word);
            // Preserve capitalization
            if (match[0] === match[0].toUpperCase()) {
              return synonym.charAt(0).toUpperCase() + synonym.slice(1);
            }
            return synonym;
          }
          return match;
        });

        // Track usage
        tracker.usage.set(word, currentUsage + allowedRemaining);
        console.info(`[AvoidWords] Replaced ${toReplace} of ${matches.length} "${word}" occurrences`);
      } else {
        // All occurrences are within limit
        tracker.usage.set(word, currentUsage + matches.length);
      }
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
  generationMode?: "image" | "hybrid" | "text"; // Explicit generation mode (overrides auto-detection)
  guidanceText?: string; // Guidance text for hybrid/text modes (overrides post's starterText)
  previousOutputs?: PreviousOutputs;
  requestId?: string;
  emojiStyle?: "low" | "medium" | "high"; // Required for regenerate, uses workspace setting as fallback
  avoidWords?: string; // Comma-separated list of words to avoid
  avoidWordsUsage?: Record<string, number>; // Current usage counts for batch tracking
}

interface GeneratePostCopyResponse {
  success: boolean;
  status: "generated" | "already_generated" | "error";
  message?: string;
  avoidWordsUsage?: Record<string, number>; // Updated usage counts for batch tracking
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
  emojiStyle: "low" | "medium" | "high",
  dateStr: string,
  isRegenerate: boolean = false,
  previousOutputs?: PreviousOutputs,
  avoidWords: string[] = []
): string {
  const hashtagCounts = {
    light: { ig: "5-8", fb: "3-5" },
    medium: { ig: "10-15", fb: "5-8" },
    heavy: { ig: "15-20", fb: "8-10" },
  };

  const counts = hashtagCounts[hashtagStyle] || hashtagCounts.medium;

  // Emoji style instructions - STRICT enforcement rules
  // LIMITS: low=0-1, medium=2-4 (min 2), high=5-8 (per caption)
  const emojiInstructions = {
    low: "EMOJI RULE: Use 0 or 1 emoji MAXIMUM per caption. Keep it minimal.",
    medium: "EMOJI RULE: You MUST use EXACTLY 2-4 emojis per caption. This is REQUIRED - no fewer than 2, no more than 4. Scatter them naturally throughout the caption.",
    high: "EMOJI RULE: You MUST use EXACTLY 5-8 emojis per caption. This is REQUIRED - no fewer than 5, no more than 8. Be expressive! Add emojis at the start, middle, and end of sentences. Use varied emojis like 🎉 ✨ 🔥 ❤️ 🙌 💯 🍺 🍻 etc.",
  };

  const emojiGuidance = emojiInstructions[emojiStyle] || emojiInstructions.low;

  // Build context based ONLY on user-provided text
  let contextInfo = "";
  if (starterText) {
    contextInfo = `User-provided description/notes: "${starterText}"`;
  } else {
    contextInfo = `No description provided for this post (date: ${dateStr}). Create a generic engaging post and set needsInfo to true.`;
  }

  const brandContext = brandVoice
    ? `\n\n**MANDATORY BRAND VOICE INSTRUCTIONS** (YOU MUST FOLLOW THESE EXACTLY):\n${brandVoice}\n\nThe above brand voice instructions are CRITICAL and MUST be followed precisely. Do not ignore them.`
    : "";

  // Build avoid-words instruction if any are specified
  const avoidWordsContext = avoidWords.length > 0
    ? `\n\n**AVOID WORDS RULES** (CRITICAL - MUST FOLLOW):
- NEVER start a post with any of these words: ${avoidWords.join(", ")}
- Avoid using these words entirely when possible
- If absolutely necessary, use each avoided word at most ONCE across ALL posts
- Avoided words: ${avoidWords.join(", ")}`
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

${contextInfo}${brandContext}${avoidWordsContext}${regenerateContext}

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
- CRITICAL: Do NOT include hashtags in the caption text. Hashtags go ONLY in the hashtags array.
- Instagram hashtags: ${counts.ig} relevant tags derived ONLY from the provided text (in the hashtags array only)
- Facebook hashtags: ${counts.fb} relevant tags derived ONLY from the provided text (in the hashtags array only)
- All hashtags MUST include the "#" symbol (e.g. #FallSpecial, #DinnerTime)
- No spaces in hashtags (use camelCase if needed)
- No mentions of competitors or other brands
- Keep the tone upbeat and positive
- If there's limited context, set confidence lower and needsInfo to true${isRegenerate ? "\n- IMPORTANT: Create a FRESH, DIFFERENT variation - do not repeat the previous captions or hashtags" : ""}

Return ONLY valid JSON with this exact shape (no markdown, no code blocks, just JSON):
{
  "ig": { "caption": "Caption text WITHOUT hashtags", "hashtags": ["#tag1", "#tag2"] },
  "fb": { "caption": "Caption text WITHOUT hashtags", "hashtags": ["#tag1", "#tag2"] },
  "confidence": 0.0,
  "needsInfo": false
}

confidence should be 0.0-1.0:
- 0.9-1.0: Clear text context with good detail (topic, event, promo details)
- 0.7-0.89: Reasonable context but could use more detail
- 0.5-0.69: Limited context, made reasonable assumptions
- 0.0-0.49: Very limited info, set needsInfo: true`;
}

/**
 * Builds a vision-based prompt for when there's an image but no starter text.
 * The AI will analyze the image and generate posts based on what it sees.
 */
function buildVisionPrompt(
  brandVoice: string,
  hashtagStyle: "light" | "medium" | "heavy",
  emojiStyle: "low" | "medium" | "high",
  dateStr: string,
  isRegenerate: boolean = false,
  previousOutputs?: PreviousOutputs,
  avoidWords: string[] = []
): string {
  const hashtagCounts = {
    light: { ig: "5-8", fb: "3-5" },
    medium: { ig: "10-15", fb: "5-8" },
    heavy: { ig: "15-20", fb: "8-10" },
  };

  const counts = hashtagCounts[hashtagStyle] || hashtagCounts.medium;

  const emojiInstructions = {
    low: "EMOJI RULE: Use 0 or 1 emoji MAXIMUM per caption. Keep it minimal.",
    medium: "EMOJI RULE: You MUST use EXACTLY 2-4 emojis per caption. This is REQUIRED - no fewer than 2, no more than 4.",
    high: "EMOJI RULE: You MUST use EXACTLY 5-8 emojis per caption. This is REQUIRED - no fewer than 5, no more than 8.",
  };

  const emojiGuidance = emojiInstructions[emojiStyle] || emojiInstructions.low;

  const brandContext = brandVoice
    ? `\n\n**MANDATORY BRAND VOICE INSTRUCTIONS** (YOU MUST FOLLOW THESE EXACTLY):\n${brandVoice}\n\nThe above brand voice instructions are CRITICAL and MUST be followed precisely.`
    : "";

  // Build avoid-words instruction if any are specified
  const avoidWordsContext = avoidWords.length > 0
    ? `\n\n**AVOID WORDS RULES** (CRITICAL):
- NEVER start a post with: ${avoidWords.join(", ")}
- Avoid these words entirely when possible
- Avoided words: ${avoidWords.join(", ")}`
    : "";

  let regenerateContext = "";
  if (isRegenerate && previousOutputs) {
    const avoidPhrases: string[] = [];
    if (previousOutputs.igCaption) {
      avoidPhrases.push(`Previous IG caption: "${previousOutputs.igCaption}"`);
    }
    if (previousOutputs.fbCaption) {
      avoidPhrases.push(`Previous FB caption: "${previousOutputs.fbCaption}"`);
    }
    if (avoidPhrases.length > 0) {
      regenerateContext = `\n\nREGENERATION: Produce DIFFERENT content from:\n${avoidPhrases.join("\n")}`;
    }
  }

  return `You are a social media copywriter. Analyze the provided image and create engaging social media posts.

IMPORTANT - Image Analysis Instructions:
1. Look carefully at what's in the image - food, drinks, people, events, signage, etc.
2. PAY SPECIAL ATTENTION to any TEXT visible in the image (menu items, promotional text, event names, specials, prices)
3. Use the visual details and any text to write relevant, specific captions
4. If you see food/drink items, describe them appetizingly
5. If you see promotional text or specials, incorporate that information
6. If you see an event or atmosphere, capture that energy${brandContext}${avoidWordsContext}${regenerateContext}

Create engaging captions for Instagram and Facebook based on what you see in the image.

Requirements:
- Instagram caption: 1-3 short paragraphs, engaging and visual
- Facebook caption: Slightly longer, conversational, informative
- ${emojiGuidance}
- CRITICAL: Do NOT include hashtags in the caption text. Hashtags go ONLY in the hashtags array.
- Instagram hashtags: ${counts.ig} relevant tags based on what you see (in the hashtags array only)
- Facebook hashtags: ${counts.fb} relevant tags based on what you see (in the hashtags array only)
- All hashtags MUST include the "#" symbol
- Keep the tone upbeat, inviting, and on-brand

Return ONLY valid JSON (no markdown, no code blocks):
{
  "ig": { "caption": "Caption text WITHOUT hashtags", "hashtags": ["#tag1", "#tag2"] },
  "fb": { "caption": "Caption text WITHOUT hashtags", "hashtags": ["#tag1", "#tag2"] },
  "confidence": 0.85,
  "needsInfo": false
}`;
}

/**
 * Builds a hybrid prompt for when there's both an image AND guidance text.
 * The AI will analyze the image but prioritize the guidance text for context.
 */
function buildHybridPrompt(
  guidanceText: string,
  brandVoice: string,
  hashtagStyle: "light" | "medium" | "heavy",
  emojiStyle: "low" | "medium" | "high",
  dateStr: string,
  isRegenerate: boolean = false,
  previousOutputs?: PreviousOutputs,
  avoidWords: string[] = []
): string {
  const hashtagCounts = {
    light: { ig: "5-8", fb: "3-5" },
    medium: { ig: "10-15", fb: "5-8" },
    heavy: { ig: "15-20", fb: "8-10" },
  };

  const counts = hashtagCounts[hashtagStyle] || hashtagCounts.medium;

  const emojiInstructions = {
    low: "EMOJI RULE: Use 0 or 1 emoji MAXIMUM per caption. Keep it minimal.",
    medium: "EMOJI RULE: You MUST use EXACTLY 2-4 emojis per caption. This is REQUIRED - no fewer than 2, no more than 4.",
    high: "EMOJI RULE: You MUST use EXACTLY 5-8 emojis per caption. This is REQUIRED - no fewer than 5, no more than 8.",
  };

  const emojiGuidance = emojiInstructions[emojiStyle] || emojiInstructions.low;

  const brandContext = brandVoice
    ? `\n\n**MANDATORY BRAND VOICE INSTRUCTIONS** (YOU MUST FOLLOW THESE EXACTLY):\n${brandVoice}\n\nThe above brand voice instructions are CRITICAL and MUST be followed precisely.`
    : "";

  const avoidWordsContext = avoidWords.length > 0
    ? `\n\n**AVOID WORDS RULES** (CRITICAL):
- NEVER start a post with: ${avoidWords.join(", ")}
- Avoid these words entirely when possible
- Avoided words: ${avoidWords.join(", ")}`
    : "";

  let regenerateContext = "";
  if (isRegenerate && previousOutputs) {
    const avoidPhrases: string[] = [];
    if (previousOutputs.igCaption) {
      avoidPhrases.push(`Previous IG caption: "${previousOutputs.igCaption}"`);
    }
    if (previousOutputs.fbCaption) {
      avoidPhrases.push(`Previous FB caption: "${previousOutputs.fbCaption}"`);
    }
    if (avoidPhrases.length > 0) {
      regenerateContext = `\n\nREGENERATION: Produce DIFFERENT content from:\n${avoidPhrases.join("\n")}`;
    }
  }

  return `You are a social media copywriter. You have BOTH an image AND guidance text to work with.

**GUIDANCE TEXT (PRIMARY CONTEXT - USE THIS!):**
"${guidanceText}"

IMPORTANT - Combined Analysis Instructions:
1. The guidance text above tells you what this post is about - USE IT!
2. Also analyze the image for visual details that complement the guidance
3. The guidance text takes priority - it tells you the topic, promotion, or message
4. Use visual details from the image to make the post more vivid and specific
5. If the image shows food/drinks, describe them appetizingly in context of the guidance
6. Incorporate any text visible in the image if relevant${brandContext}${avoidWordsContext}${regenerateContext}

Create engaging captions for Instagram and Facebook that combine the guidance with visual appeal.

Requirements:
- Instagram caption: 1-3 short paragraphs, engaging and on-topic
- Facebook caption: Slightly longer, conversational, informative
- ${emojiGuidance}
- CRITICAL: Do NOT include hashtags in the caption text. Hashtags go ONLY in the hashtags array.
- Instagram hashtags: ${counts.ig} relevant tags (in the hashtags array only)
- Facebook hashtags: ${counts.fb} relevant tags (in the hashtags array only)
- All hashtags MUST include the "#" symbol
- Keep the tone upbeat, inviting, and on-brand

Return ONLY valid JSON (no markdown, no code blocks):
{
  "ig": { "caption": "Caption text WITHOUT hashtags", "hashtags": ["#tag1", "#tag2"] },
  "fb": { "caption": "Caption text WITHOUT hashtags", "hashtags": ["#tag1", "#tag2"] },
  "confidence": 0.9,
  "needsInfo": false
}`;
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

    // Normalize then append global hashtags - use same hashtags for both platforms
    const igHashtags = appendGlobalHashtags(normalizeHashtagsArray(parsed.ig.hashtags));
    // Use IG hashtags for both platforms (more comprehensive set)
    const sharedHashtags = igHashtags;

    return {
      ig: {
        caption: parsed.ig.caption,
        hashtags: sharedHashtags,
      },
      fb: {
        caption: parsed.fb.caption,
        hashtags: sharedHashtags,
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

    // Log brand voice for debugging
    console.info(`[BrandVoice] brandVoice="${brandVoice ? brandVoice.substring(0, 100) + (brandVoice.length > 100 ? '...' : '') : '(empty)'}"`);

    // SAFEGUARD: emojiStyle must be explicitly passed in the request
    // This prevents stale/cached values from being used
    const requestEmojiStyle = request.data.emojiStyle;
    const workspaceEmojiStyle = workspaceData.settings?.ai?.emojiStyle;

    // Validate emojiStyle is one of the valid values
    const validEmojiStyles = ["low", "medium", "high"];
    let emojiStyle: "low" | "medium" | "high";

    if (requestEmojiStyle && validEmojiStyles.includes(requestEmojiStyle)) {
      // Use explicitly passed emojiStyle (preferred - ensures fresh value)
      emojiStyle = requestEmojiStyle;
    } else if (workspaceEmojiStyle && validEmojiStyles.includes(workspaceEmojiStyle)) {
      // Fall back to workspace setting
      emojiStyle = workspaceEmojiStyle as "low" | "medium" | "high";
    } else {
      // Default to "low" if nothing valid is found
      emojiStyle = "low";
    }

    console.info(`[EmojiStyle] Using emojiStyle="${emojiStyle}" (request=${requestEmojiStyle}, workspace=${workspaceEmojiStyle})`);

    // Get avoidWords: prefer request value, fall back to workspace setting
    const requestAvoidWords = request.data.avoidWords;
    const workspaceAvoidWords = workspaceData.settings?.ai?.avoidWords || "indulge";
    const avoidWordsStr = requestAvoidWords !== undefined ? requestAvoidWords : workspaceAvoidWords;
    const avoidWords = parseAvoidWords(avoidWordsStr);

    console.info(`[AvoidWords] Using avoidWords: ${avoidWords.length > 0 ? avoidWords.join(", ") : "(none)"}`);

    // 7. Get OpenAI client
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new HttpsError("failed-precondition", "OpenAI API key not configured");
    }
    const openai = new OpenAI({ apiKey });

    // 8. Determine generation mode: text-based, image-based, or hybrid
    // Request can override with explicit generationMode and guidanceText
    const requestGenerationMode = request.data.generationMode;
    const requestGuidanceText = request.data.guidanceText;

    // Get guidance text: prefer request value, fall back to post's starterText
    const guidanceText = requestGuidanceText !== undefined ? requestGuidanceText : postData.starterText;
    const hasGuidanceText = !!guidanceText && guidanceText.trim().length > 0;
    const hasImage = !!postData.imageAssetId;


    // Get image URL - either from post data or by fetching from asset/storage
    let imageUrl = postData.imageUrl || postData.downloadUrl;

    if (!imageUrl && hasImage && postData.imageAssetId) {
      // Fetch the asset document to get the storage path or download URL
      const assetRef = db
        .collection("workspaces")
        .doc(workspaceId)
        .collection("assets")
        .doc(postData.imageAssetId);

      const assetDoc = await assetRef.get();
      if (assetDoc.exists) {
        const assetData = assetDoc.data()!;
        // Check for pre-computed download URL first
        if (assetData.downloadUrl) {
          imageUrl = assetData.downloadUrl;
        } else if (assetData.storagePath && assetData.downloadToken) {
          // Construct Firebase download URL using the token
          const bucketName = storage.bucket().name;
          const encodedPath = encodeURIComponent(assetData.storagePath);
          imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${assetData.downloadToken}`;
        } else if (assetData.storagePath) {
          // Try to get download URL via Firebase Admin (public URL)
          try {
            const bucket = storage.bucket();
            const file = bucket.file(assetData.storagePath);
            // Make the file publicly readable temporarily and get URL
            const [metadata] = await file.getMetadata();
            if (metadata.metadata?.firebaseStorageDownloadTokens) {
              const token = metadata.metadata.firebaseStorageDownloadTokens;
              const encodedPath = encodeURIComponent(assetData.storagePath);
              imageUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodedPath}?alt=media&token=${token}`;
            }
          } catch (err) {
            console.warn(`[ImageUrl] Failed to get metadata for ${assetData.storagePath}:`, err);
          }
        }
      }
    }

    console.info(`[ImageUrl] hasImage=${hasImage}, imageUrl=${imageUrl ? "present (" + imageUrl.substring(0, 50) + "...)" : "missing"}`);

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

    // Decide which mode to use based on explicit generationMode or auto-detect
    // Modes: "image" (vision only), "hybrid" (vision + text), "text" (text only)
    let effectiveMode: "image" | "hybrid" | "text";

    if (requestGenerationMode) {
      // Explicit mode from request - respect it
      effectiveMode = requestGenerationMode;
    } else if (postData.generationMode) {
      // Mode saved on post document
      effectiveMode = postData.generationMode;
    } else {
      // Auto-detect based on what's available (legacy behavior)
      if (hasImage && hasGuidanceText) {
        effectiveMode = "hybrid";
      } else if (hasImage) {
        effectiveMode = "image";
      } else {
        effectiveMode = "text";
      }
    }

    // Determine if we need vision capabilities
    const useVision = (effectiveMode === "image" || effectiveMode === "hybrid") && hasImage && imageUrl;
    const modelName = useVision ? MODEL_NAME_VISION : MODEL_NAME_TEXT;

    console.info(`[GenerateMode] effectiveMode=${effectiveMode}, hasGuidanceText=${hasGuidanceText}, hasImage=${hasImage}, useVision=${useVision}, model=${modelName}`);

    // Build appropriate prompt based on effective mode
    let prompt: string;
    if (effectiveMode === "hybrid" && hasGuidanceText) {
      // Hybrid mode: image + guidance text
      prompt = buildHybridPrompt(guidanceText!, brandVoice, hashtagStyle, emojiStyle, dateId, regenerate, prevOutputs, avoidWords);
    } else if (effectiveMode === "image") {
      // Image-only mode: vision prompt
      prompt = buildVisionPrompt(brandVoice, hashtagStyle, emojiStyle, dateId, regenerate, prevOutputs, avoidWords);
    } else {
      // Text mode: text-only prompt (including fallback when guidance text is missing for hybrid)
      prompt = buildPrompt(guidanceText, brandVoice, hashtagStyle, emojiStyle, dateId, regenerate, prevOutputs, avoidWords);
    }

    // Generate unique request ID for cache-busting and prompt variation
    const requestId = request.data.requestId || randomUUID();

    // 9. Call OpenAI for caption generation
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
        const emojiSystemRule = emojiStyle === "low"
          ? "EMOJI REQUIREMENT: Maximum 1 emoji per caption."
          : emojiStyle === "medium"
          ? "EMOJI REQUIREMENT: You MUST include 2-4 emojis in each caption. This is mandatory."
          : "EMOJI REQUIREMENT: You MUST include 5-8 emojis in each caption. This is mandatory - use emojis liberally throughout!";

        // Add brand voice to system message if provided
        const brandVoiceSystemRule = brandVoice
          ? ` BRAND VOICE REQUIREMENT: You MUST follow these brand voice instructions exactly: "${brandVoice}".`
          : "";

        // Build messages based on effective mode
        let messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[];

        if (effectiveMode === "hybrid" && useVision && imageUrl) {
          // Hybrid mode: image + guidance text
          messages = [
            {
              role: "system",
              content: `You are a social media copywriter. You have both an image AND guidance text. The guidance text tells you what the post is about - prioritize it! Use the image for visual details to enhance the message. ${emojiSystemRule}${brandVoiceSystemRule} Return ONLY valid JSON. ${nonceMessage}`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              ],
            },
          ];
        } else if (effectiveMode === "image" && useVision && imageUrl) {
          // Image-only mode: analyze image
          messages = [
            {
              role: "system",
              content: `You are a social media copywriter. Analyze the image carefully and create engaging posts based on what you see. Pay special attention to any TEXT in the image (menu items, specials, promotions, prices, event names). ${emojiSystemRule}${brandVoiceSystemRule} Return ONLY valid JSON. ${nonceMessage}`,
            },
            {
              role: "user",
              content: [
                { type: "text", text: promptText },
                { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
              ],
            },
          ];
        } else {
          // Text-only mode
          messages = [
            {
              role: "system",
              content: `You are a social media copywriter. Use ONLY the user-provided text description. Do NOT reference or describe images. ${emojiSystemRule}${brandVoiceSystemRule} Return ONLY valid JSON. ${nonceMessage}`,
            },
            {
              role: "user",
              content: promptText,
            },
          ];
        }

        const completion = await openai.chat.completions.create({
          model: modelName,
          messages,
          temperature: 0.8,
          top_p: 0.95,
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

    // 10. Enforce avoid-words rules (server-side post-processing)
    // Use incoming usage data for batch tracking across multiple posts
    const incomingUsage = request.data.avoidWordsUsage;
    let avoidWordsTracker: AvoidWordsUsageTracker | null = null;

    if (avoidWords.length > 0) {
      console.info(`[AvoidWords] Enforcing avoid-words rules for dateId=${dateId}, incomingUsage=${JSON.stringify(incomingUsage || {})}`);

      // Create tracker with incoming usage for batch-level frequency limits
      avoidWordsTracker = createAvoidWordsTracker(1, incomingUsage);

      // Enforce on IG caption first
      aiOutput.ig.caption = enforceAvoidWords(aiOutput.ig.caption, avoidWords, avoidWordsTracker);

      // Enforce on FB caption (shares tracker for batch-level limits)
      aiOutput.fb.caption = enforceAvoidWords(aiOutput.fb.caption, avoidWords, avoidWordsTracker);

      console.info(`[AvoidWords] Updated usage: ${JSON.stringify(trackerUsageToObject(avoidWordsTracker))}`);
    }

    // 11. Enforce emoji limits (server-side post-processing)
    console.info(`[EmojiEnforcement] emojiStyle=${emojiStyle}, dateId=${dateId}`);

    const igEnforcement = enforceEmojiLimit(aiOutput.ig.caption, emojiStyle as EmojiStyleType);
    const fbEnforcement = enforceEmojiLimit(aiOutput.fb.caption, emojiStyle as EmojiStyleType);

    // Apply enforced captions
    aiOutput.ig.caption = igEnforcement.caption;
    aiOutput.fb.caption = fbEnforcement.caption;

    // Log enforcement results
    const igAction = igEnforcement.added > 0 ? `added ${igEnforcement.added}` : igEnforcement.stripped > 0 ? `removed ${igEnforcement.stripped}` : "unchanged";
    const fbAction = fbEnforcement.added > 0 ? `added ${fbEnforcement.added}` : fbEnforcement.stripped > 0 ? `removed ${fbEnforcement.stripped}` : "unchanged";

    console.info(
      `[EmojiEnforcement] IG: ${igEnforcement.originalCount} -> ${igEnforcement.finalCount} (${igAction}), ` +
      `FB: ${fbEnforcement.originalCount} -> ${fbEnforcement.finalCount} (${fbAction})`
    );

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
          model: modelName,
          generatedAt: FieldValue.serverTimestamp(),
          promptVersion: PROMPT_VERSION,
          confidence: aiOutput.confidence,
          needsInfo: aiOutput.needsInfo,
          usedVision: useVision,
        },
      },
      status: "generated",
      updatedAt: FieldValue.serverTimestamp(),
    });

    const modeDescriptions = {
      image: "from image analysis",
      hybrid: "from image + guidance text",
      text: "from guidance text",
    };
    const modeDesc = modeDescriptions[effectiveMode] || "from text";
    return {
      success: true,
      status: "generated",
      message: `Generated content ${modeDesc} with ${Math.round(aiOutput.confidence * 100)}% confidence`,
      avoidWordsUsage: avoidWordsTracker ? trackerUsageToObject(avoidWordsTracker) : undefined,
    };
  }
);
