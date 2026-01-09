import { PostDay } from "./types";
import { computeFlags, computeConfidence } from "./utils";

/**
 * Stubs AI generation for a post.
 */
export async function generateAiStub(post: Partial<PostDay>): Promise<Partial<PostDay>> {
    const starterText = post.starterText || "";
    const hasImage = !!post.imageAssetId;

    let igCaption = "";
    let fbCaption = "";

    if (starterText) {
        igCaption = `✨ ${starterText} #socialstudio #planning`;
        fbCaption = `Check this out: ${starterText}. We're excited to share our progress with The Social Studio!`;
    } else if (hasImage) {
        igCaption = "Capturing the moment! 📸 #photography #vibes";
        fbCaption = "A picture is worth a thousand words. Here's what we've been up to lately.";
    } else {
        igCaption = "Planning something big... stay tuned! 🚀";
        fbCaption = "Big things are coming to The Social Studio. We can't wait to show you.";
    }

    const igHashtags = [
        "socialmedia", "scheduling", "marketing", "contentcreator", "studio",
        "planning", "productivity", "workflow", "digitalmarketing", "growth",
        "innovation", "creativity", "tools", "automation", "efficiency"
    ].slice(0, Math.floor(Math.random() * 8) + 12);

    const fbHashtags = [
        "TheSocialStudio", "PlanningTools", "SocialMediaManagement"
    ].slice(0, Math.floor(Math.random() * 4) + 3);

    const aiData = {
        igCaption,
        fbCaption,
        igHashtags,
        fbHashtags,
        flags: [], // Will be recomputed
        confidence: computeConfidence({ starterText: post.starterText }),
    };

    const updatedPost: Partial<PostDay> = {
        ...post,
        ai: aiData,
        status: post.status === "edited" ? "edited" : "generated",
    };

    // Recompute flags
    updatedPost.ai!.flags = computeFlags({
        date: post.date!,
        starterText: post.starterText,
        imageAssetId: post.imageAssetId
    });

    return updatedPost;
}
