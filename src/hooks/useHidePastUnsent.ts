"use client";

import { useMemo } from "react";
import { PostDay } from "@/lib/types";
import { getTodayInDenver } from "@/lib/utils";
import { useWorkspaceUiSettings } from "./useWorkspaceUiSettings";

interface UseHidePastUnsentResult {
    filteredPosts: PostDay[];
    hidePastUnsent: boolean;
    loading: boolean;
}

/**
 * Shared hook for filtering out past unsent posts based on global workspace settings.
 * A post is "past unsent" if date < today AND status !== "sent".
 * Sent posts are never hidden, even if their date is in the past.
 * Future posts are never hidden.
 */
export function useHidePastUnsent(posts: PostDay[]): UseHidePastUnsentResult {
    const { settings, loading } = useWorkspaceUiSettings();
    const hidePastUnsent = settings.hidePastUnsent;

    // Filter posts based on global setting
    const filteredPosts = useMemo(() => {
        if (!hidePastUnsent) return posts;

        const todayStr = getTodayInDenver();
        return posts.filter((p) => {
            // Never hide sent posts or future/today posts
            if (p.status === "sent") return true;
            if (p.date >= todayStr) return true;
            // Hide past unsent posts
            return false;
        });
    }, [posts, hidePastUnsent]);

    return {
        filteredPosts,
        hidePastUnsent,
        loading,
    };
}

/**
 * Utility function to filter posts for past unsent.
 * Can be used in contexts where the hook isn't appropriate (e.g., Calendar cells).
 */
export function filterPastUnsent(posts: PostDay[], hidePastUnsent: boolean): PostDay[] {
    if (!hidePastUnsent) return posts;

    const todayStr = getTodayInDenver();
    return posts.filter((p) => {
        if (p.status === "sent") return true;
        if (p.date >= todayStr) return true;
        return false;
    });
}

/**
 * Check if a single post should be hidden based on past unsent logic.
 */
export function isPostPastUnsent(post: PostDay): boolean {
    const todayStr = getTodayInDenver();
    return post.date < todayStr && post.status !== "sent";
}
