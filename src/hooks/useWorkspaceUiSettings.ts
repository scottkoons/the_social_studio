"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { HashtagStyle, EmojiStyle } from "@/lib/types";
import { IndustryId } from "@/lib/industryProfiles";

interface WorkspaceUiSettings {
    hidePastUnsent: boolean;
}

interface WorkspaceAiSettings {
    brandVoice: string;
    hashtagStyle: HashtagStyle;
    emojiStyle: EmojiStyle;
    avoidWords: string; // Comma-separated list of words/phrases to avoid
    industry: IndustryId;
}

interface WorkspaceSettings {
    ui: WorkspaceUiSettings;
    ai: WorkspaceAiSettings;
}

interface UseWorkspaceUiSettingsResult {
    settings: WorkspaceUiSettings;
    aiSettings: WorkspaceAiSettings;
    loading: boolean;
    setHidePastUnsent: (value: boolean) => Promise<void>;
    setBrandVoice: (value: string) => Promise<void>;
    setHashtagStyle: (value: HashtagStyle) => Promise<void>;
    setEmojiStyle: (value: EmojiStyle) => Promise<void>;
    setAvoidWords: (value: string) => Promise<void>;
    setIndustry: (value: IndustryId) => Promise<void>;
}

const DEFAULT_UI_SETTINGS: WorkspaceUiSettings = {
    hidePastUnsent: false,
};

const DEFAULT_AI_SETTINGS: WorkspaceAiSettings = {
    brandVoice: "",
    hashtagStyle: "medium",
    emojiStyle: "low",
    avoidWords: "indulge", // Default avoid word
    industry: "restaurant", // Default industry
};

const LOCAL_STORAGE_KEY = "workspaceSettings";

/**
 * Hook to manage workspace-level settings stored in Firestore.
 * Settings are stored at workspaces/{workspaceId} in the settings field.
 * Uses localStorage as a temporary fallback while Firestore loads.
 */
export function useWorkspaceUiSettings(): UseWorkspaceUiSettingsResult {
    const { workspaceId } = useAuth();
    const [settings, setSettings] = useState<WorkspaceSettings>(() => {
        // Try to load from localStorage as initial value for faster UX
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    return {
                        ui: { ...DEFAULT_UI_SETTINGS, ...parsed.ui },
                        ai: { ...DEFAULT_AI_SETTINGS, ...parsed.ai },
                    };
                } catch {
                    // Ignore parse errors
                }
            }
        }
        return { ui: DEFAULT_UI_SETTINGS, ai: DEFAULT_AI_SETTINGS };
    });
    const [loading, setLoading] = useState(true);

    // Subscribe to Firestore workspace document for real-time settings
    useEffect(() => {
        if (!workspaceId) {
            setLoading(false);
            return;
        }

        const workspaceRef = doc(db, "workspaces", workspaceId);

        const unsubscribe = onSnapshot(
            workspaceRef,
            (snapshot) => {
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const uiData = data?.settings?.ui || {};
                    const aiData = data?.settings?.ai || {};
                    const newSettings: WorkspaceSettings = {
                        ui: {
                            hidePastUnsent: uiData.hidePastUnsent ?? DEFAULT_UI_SETTINGS.hidePastUnsent,
                        },
                        ai: {
                            brandVoice: aiData.brandVoice ?? DEFAULT_AI_SETTINGS.brandVoice,
                            hashtagStyle: aiData.hashtagStyle ?? DEFAULT_AI_SETTINGS.hashtagStyle,
                            emojiStyle: aiData.emojiStyle ?? DEFAULT_AI_SETTINGS.emojiStyle,
                            avoidWords: aiData.avoidWords ?? DEFAULT_AI_SETTINGS.avoidWords,
                            industry: aiData.industry ?? DEFAULT_AI_SETTINGS.industry,
                        },
                    };
                    setSettings(newSettings);
                    // Update localStorage cache
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSettings));
                } else {
                    // Workspace doc doesn't exist yet, use defaults
                    setSettings({ ui: DEFAULT_UI_SETTINGS, ai: DEFAULT_AI_SETTINGS });
                }
                setLoading(false);
            },
            (error) => {
                console.error("Error loading workspace settings:", error);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [workspaceId]);

    // Update hidePastUnsent in Firestore
    const setHidePastUnsent = useCallback(
        async (value: boolean) => {
            if (!workspaceId) return;

            // Optimistic update
            setSettings((prev) => ({
                ...prev,
                ui: { ...prev.ui, hidePastUnsent: value },
            }));

            try {
                const workspaceRef = doc(db, "workspaces", workspaceId);
                await setDoc(
                    workspaceRef,
                    {
                        settings: {
                            ui: {
                                hidePastUnsent: value,
                            },
                        },
                    },
                    { merge: true }
                );
            } catch (error) {
                console.error("Error saving workspace settings:", error);
            }
        },
        [workspaceId]
    );

    // Update brandVoice in Firestore
    const setBrandVoice = useCallback(
        async (value: string) => {
            if (!workspaceId) return;

            // Optimistic update
            setSettings((prev) => ({
                ...prev,
                ai: { ...prev.ai, brandVoice: value },
            }));

            try {
                const workspaceRef = doc(db, "workspaces", workspaceId);
                await setDoc(
                    workspaceRef,
                    {
                        settings: {
                            ai: {
                                brandVoice: value,
                            },
                        },
                    },
                    { merge: true }
                );
            } catch (error) {
                console.error("Error saving brand voice:", error);
            }
        },
        [workspaceId]
    );

    // Update hashtagStyle in Firestore
    const setHashtagStyle = useCallback(
        async (value: HashtagStyle) => {
            if (!workspaceId) return;

            // Optimistic update
            setSettings((prev) => ({
                ...prev,
                ai: { ...prev.ai, hashtagStyle: value },
            }));

            try {
                const workspaceRef = doc(db, "workspaces", workspaceId);
                await setDoc(
                    workspaceRef,
                    {
                        settings: {
                            ai: {
                                hashtagStyle: value,
                            },
                        },
                    },
                    { merge: true }
                );
            } catch (error) {
                console.error("Error saving hashtag style:", error);
            }
        },
        [workspaceId]
    );

    // Update emojiStyle in Firestore
    const setEmojiStyle = useCallback(
        async (value: EmojiStyle) => {
            if (!workspaceId) return;

            // Optimistic update
            setSettings((prev) => ({
                ...prev,
                ai: { ...prev.ai, emojiStyle: value },
            }));

            try {
                const workspaceRef = doc(db, "workspaces", workspaceId);
                await setDoc(
                    workspaceRef,
                    {
                        settings: {
                            ai: {
                                emojiStyle: value,
                            },
                        },
                    },
                    { merge: true }
                );
            } catch (error) {
                console.error("Error saving emoji style:", error);
            }
        },
        [workspaceId]
    );

    // Update avoidWords in Firestore
    const setAvoidWords = useCallback(
        async (value: string) => {
            if (!workspaceId) return;

            // Optimistic update
            setSettings((prev) => ({
                ...prev,
                ai: { ...prev.ai, avoidWords: value },
            }));

            try {
                const workspaceRef = doc(db, "workspaces", workspaceId);
                await setDoc(
                    workspaceRef,
                    {
                        settings: {
                            ai: {
                                avoidWords: value,
                            },
                        },
                    },
                    { merge: true }
                );
            } catch (error) {
                console.error("Error saving avoid words:", error);
            }
        },
        [workspaceId]
    );

    // Update industry in Firestore
    const setIndustry = useCallback(
        async (value: IndustryId) => {
            if (!workspaceId) return;

            // Optimistic update
            setSettings((prev) => ({
                ...prev,
                ai: { ...prev.ai, industry: value },
            }));

            try {
                const workspaceRef = doc(db, "workspaces", workspaceId);
                await setDoc(
                    workspaceRef,
                    {
                        settings: {
                            ai: {
                                industry: value,
                            },
                        },
                    },
                    { merge: true }
                );
            } catch (error) {
                console.error("Error saving industry:", error);
            }
        },
        [workspaceId]
    );

    return {
        settings: settings.ui,
        aiSettings: settings.ai,
        loading,
        setHidePastUnsent,
        setBrandVoice,
        setHashtagStyle,
        setEmojiStyle,
        setAvoidWords,
        setIndustry,
    };
}
