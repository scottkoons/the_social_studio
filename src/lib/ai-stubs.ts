import { PostDay, PostDayAI } from "./types";
import { Timestamp } from "firebase/firestore";

/**
 * Stubs AI generation for a post (for local testing only).
 * Production uses the generatePostCopy Cloud Function.
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

    const aiData: PostDayAI = {
        ig: {
            caption: igCaption,
            hashtags: igHashtags,
        },
        fb: {
            caption: fbCaption,
            hashtags: fbHashtags,
        },
        meta: {
            model: "stub",
            generatedAt: Timestamp.now(),
            promptVersion: "stub-1.0",
            confidence: starterText ? 0.7 : 0.5,
            needsInfo: !starterText && !hasImage,
        },
    };

    const updatedPost: Partial<PostDay> = {
        ...post,
        ai: aiData,
        status: post.status === "edited" ? "edited" : "generated",
    };

    return updatedPost;
}
