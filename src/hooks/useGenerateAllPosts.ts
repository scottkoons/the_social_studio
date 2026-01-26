"use client";

import { useState, useCallback } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { PostDay, getPostDocId, GenerationMode, EmojiStyle } from "@/lib/types";
import { isPostPastDue } from "@/lib/utils";

const CONCURRENCY_LIMIT = 3;

interface GeneratePostCopyResponse {
  success: boolean;
  status: "generated" | "already_generated" | "error";
  message?: string;
}

interface GenerateAllResult {
  generated: number;
  skipped: number;
  failed: number;
}

interface UseGenerateAllPostsOptions {
  workspaceId: string | null;
  emojiStyle?: EmojiStyle;
  avoidWords?: string;
}

interface UseGenerateAllPostsReturn {
  generateAll: (posts: PostDay[]) => Promise<GenerateAllResult>;
  isGenerating: boolean;
}

/**
 * Reusable hook for batch AI generation of posts
 * Extracted from Posts page for use across Dashboard and Posts
 */
export function useGenerateAllPosts({
  workspaceId,
  emojiStyle,
  avoidWords,
}: UseGenerateAllPostsOptions): UseGenerateAllPostsReturn {
  const [isGenerating, setIsGenerating] = useState(false);

  const generateAll = useCallback(
    async (posts: PostDay[]): Promise<GenerateAllResult> => {
      if (!workspaceId || isGenerating || posts.length === 0) {
        return { generated: 0, skipped: 0, failed: 0 };
      }

      setIsGenerating(true);

      const generatePostCopy = httpsCallable<
        {
          workspaceId: string;
          dateId: string;
          regenerate: boolean;
          generationMode?: GenerationMode;
          guidanceText?: string;
          requestId?: string;
          emojiStyle?: EmojiStyle;
          avoidWords?: string;
        },
        GeneratePostCopyResponse
      >(functions, "generatePostCopy");

      let generated = 0;
      let skipped = 0;
      let failed = 0;

      const toProcess: PostDay[] = [];

      // Pre-filter posts
      for (const post of posts) {
        const isPast = isPostPastDue(post);
        if (isPast && post.status !== "sent") {
          skipped++;
          continue;
        }

        const effectiveMode =
          post.generationMode ||
          (post.imageAssetId ? (post.starterText ? "hybrid" : "image") : "text");
        if (effectiveMode === "text" && (!post.starterText || post.starterText.trim() === "")) {
          skipped++;
          continue;
        }

        toProcess.push(post);
      }

      // Process concurrently
      const queue = [...toProcess];
      const inFlight: Promise<void>[] = [];

      const processOne = async (post: PostDay) => {
        const docId = getPostDocId(post);

        try {
          await generatePostCopy({
            workspaceId,
            dateId: docId,
            regenerate: true,
            generationMode: post.generationMode,
            guidanceText: post.starterText,
            requestId: crypto.randomUUID(),
            emojiStyle,
            avoidWords,
          });
          generated++;
        } catch (err) {
          console.error(`Generate error for ${docId}:`, err);
          failed++;
        }
      };

      while (queue.length > 0 || inFlight.length > 0) {
        while (queue.length > 0 && inFlight.length < CONCURRENCY_LIMIT) {
          const post = queue.shift()!;
          const promise = processOne(post).then(() => {
            const idx = inFlight.indexOf(promise);
            if (idx > -1) inFlight.splice(idx, 1);
          });
          inFlight.push(promise);
        }

        if (inFlight.length > 0) {
          await Promise.race(inFlight);
        }
      }

      setIsGenerating(false);

      return { generated, skipped, failed };
    },
    [workspaceId, isGenerating, emojiStyle, avoidWords]
  );

  return { generateAll, isGenerating };
}
