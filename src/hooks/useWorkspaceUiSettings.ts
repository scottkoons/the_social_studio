"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

interface WorkspaceUiSettings {
    hidePastUnsent: boolean;
}

interface UseWorkspaceUiSettingsResult {
    settings: WorkspaceUiSettings;
    loading: boolean;
    setHidePastUnsent: (value: boolean) => Promise<void>;
}

const DEFAULT_SETTINGS: WorkspaceUiSettings = {
    hidePastUnsent: false,
};

const LOCAL_STORAGE_KEY = "workspaceUiSettings";

/**
 * Hook to manage workspace-level UI settings stored in Firestore.
 * Settings are stored at workspaces/{workspaceId} in the settings.ui field.
 * Uses localStorage as a temporary fallback while Firestore loads.
 */
export function useWorkspaceUiSettings(): UseWorkspaceUiSettingsResult {
    const { workspaceId } = useAuth();
    const [settings, setSettings] = useState<WorkspaceUiSettings>(() => {
        // Try to load from localStorage as initial value for faster UX
        if (typeof window !== "undefined") {
            const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
            if (stored) {
                try {
                    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
                } catch {
                    // Ignore parse errors
                }
            }
        }
        return DEFAULT_SETTINGS;
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
                    const uiSettings = data?.settings?.ui || {};
                    const newSettings: WorkspaceUiSettings = {
                        hidePastUnsent: uiSettings.hidePastUnsent ?? DEFAULT_SETTINGS.hidePastUnsent,
                    };
                    setSettings(newSettings);
                    // Update localStorage cache
                    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newSettings));
                } else {
                    // Workspace doc doesn't exist yet, use defaults
                    setSettings(DEFAULT_SETTINGS);
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
            setSettings((prev) => ({ ...prev, hidePastUnsent: value }));
            localStorage.setItem(
                LOCAL_STORAGE_KEY,
                JSON.stringify({ ...settings, hidePastUnsent: value })
            );

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
                // Revert on error - the onSnapshot will sync the correct value
            }
        },
        [workspaceId, settings]
    );

    return {
        settings,
        loading,
        setHidePastUnsent,
    };
}
