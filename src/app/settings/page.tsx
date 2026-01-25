"use client";

import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import PageHeader from "@/components/ui/PageHeader";
import DashboardCard from "@/components/ui/DashboardCard";
import { Check, EyeOff, Sparkles, Hash, Smile, Ban } from "lucide-react";
import { HashtagStyle, EmojiStyle } from "@/lib/types";

export default function SettingsPage() {
    const { workspaceId, workspaceLoading } = useAuth();
    const { settings, aiSettings, loading, setHidePastUnsent, setBrandVoice, setHashtagStyle, setEmojiStyle, setAvoidWords } = useWorkspaceUiSettings();
    const [showSaved, setShowSaved] = useState<string | null>(null);
    const [localBrandVoice, setLocalBrandVoice] = useState(aiSettings.brandVoice);
    const [localAvoidWords, setLocalAvoidWords] = useState(aiSettings.avoidWords);
    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const avoidWordsDebounceTimer = useRef<NodeJS.Timeout | null>(null);

    // Sync local brand voice with settings when loaded from external source
    useEffect(() => {
        setLocalBrandVoice(aiSettings.brandVoice);
    }, [aiSettings.brandVoice]);

    // Sync local avoid words with settings when loaded from external source
    useEffect(() => {
        setLocalAvoidWords(aiSettings.avoidWords);
    }, [aiSettings.avoidWords]);

    const handleToggle = async () => {
        await setHidePastUnsent(!settings.hidePastUnsent);
        showSavedIndicator("hidePastUnsent");
    };

    const handleBrandVoiceChange = (value: string) => {
        setLocalBrandVoice(value);

        // Debounce the save
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
            await setBrandVoice(value);
            showSavedIndicator("brandVoice");
        }, 1000);
    };

    const handleHashtagStyleChange = async (style: HashtagStyle) => {
        await setHashtagStyle(style);
        showSavedIndicator("hashtagStyle");
    };

    const handleEmojiStyleChange = async (style: EmojiStyle) => {
        await setEmojiStyle(style);
        showSavedIndicator("emojiStyle");
    };

    const handleAvoidWordsChange = (value: string) => {
        setLocalAvoidWords(value);

        // Debounce the save
        if (avoidWordsDebounceTimer.current) clearTimeout(avoidWordsDebounceTimer.current);
        avoidWordsDebounceTimer.current = setTimeout(async () => {
            await setAvoidWords(value);
            showSavedIndicator("avoidWords");
        }, 1000);
    };

    const showSavedIndicator = (key: string) => {
        setShowSaved(key);
    };

    // Hide "Saved" indicator after 2 seconds
    useEffect(() => {
        if (showSaved) {
            const timer = setTimeout(() => setShowSaved(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [showSaved]);

    // Show loading while workspace is being resolved
    if (workspaceLoading || !workspaceId) {
        return (
            <div className="p-4 md:p-8 max-w-7xl mx-auto">
                <DashboardCard>
                    <div className="py-16 text-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4"></div>
                        <p className="text-sm text-[var(--text-secondary)]">Loading settings...</p>
                    </div>
                </DashboardCard>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
            <PageHeader
                title="Settings"
                subtitle="Manage your workspace preferences."
            />

            {/* Display Settings */}
            <DashboardCard>
                <div className="space-y-6">
                    <div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Display Settings</h2>
                        <p className="text-sm text-[var(--text-secondary)] mt-1">
                            Control how content is displayed across your workspace.
                        </p>
                    </div>

                    <div className="border-t border-[var(--border-secondary)] pt-6">
                        {/* Hide Past Unsent Toggle */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-[var(--bg-tertiary)] rounded-lg">
                                    <EyeOff size={18} className="text-[var(--text-secondary)]" />
                                </div>
                                <div>
                                    <label
                                        htmlFor="hidePastUnsent"
                                        className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
                                    >
                                        Hide past unsent posts
                                    </label>
                                    <p className="text-sm text-[var(--text-secondary)] mt-0.5">
                                        Hides posts dated before today that were not sent to Buffer.
                                        Sent posts always remain visible.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-3">
                                {showSaved === "hidePastUnsent" && (
                                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                        <Check size={14} />
                                        Saved
                                    </span>
                                )}

                                <button
                                    id="hidePastUnsent"
                                    role="switch"
                                    aria-checked={settings.hidePastUnsent}
                                    onClick={handleToggle}
                                    disabled={loading}
                                    className={`
                                        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                                        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] focus:ring-offset-2 focus:ring-offset-[var(--bg-primary)]
                                        disabled:opacity-50 disabled:cursor-not-allowed
                                        ${settings.hidePastUnsent ? 'bg-[var(--accent-primary)]' : 'bg-[var(--bg-tertiary)]'}
                                    `}
                                >
                                    <span
                                        className={`
                                            pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                                            transition duration-200 ease-in-out
                                            ${settings.hidePastUnsent ? 'translate-x-5' : 'translate-x-0'}
                                        `}
                                    />
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </DashboardCard>

            {/* AI Generation Settings */}
            <div className="mt-6">
                <DashboardCard>
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">AI Generation Settings</h2>
                            <p className="text-sm text-[var(--text-secondary)] mt-1">
                                Customize how AI generates your social media captions.
                            </p>
                        </div>

                        <div className="border-t border-[var(--border-secondary)] pt-6 space-y-6">
                            {/* Brand Voice */}
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                                    <Sparkles size={18} className="text-purple-600 dark:text-purple-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <label
                                            htmlFor="brandVoice"
                                            className="text-sm font-medium text-[var(--text-primary)]"
                                        >
                                            Brand Voice
                                        </label>
                                        {showSaved === "brandVoice" && (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <Check size={14} />
                                                Saved
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                                        Describe your brand&apos;s tone and style. This helps AI generate captions that match your voice.
                                    </p>
                                    <textarea
                                        id="brandVoice"
                                        value={localBrandVoice}
                                        onChange={(e) => handleBrandVoiceChange(e.target.value)}
                                        placeholder="E.g., Friendly and casual, with a touch of humor. We love using emojis and keeping things upbeat. Our audience is young professionals who appreciate authenticity."
                                        className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] min-h-[100px] resize-y"
                                    />
                                </div>
                            </div>

                            {/* Hashtag Style */}
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                                    <Hash size={18} className="text-blue-600 dark:text-blue-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-[var(--text-primary)]">
                                            Hashtag Density
                                        </label>
                                        {showSaved === "hashtagStyle" && (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <Check size={14} />
                                                Saved
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                                        Control how many hashtags AI includes in your posts.
                                    </p>
                                    <div className="flex gap-2">
                                        {[
                                            { value: "light", label: "Light", desc: "5-8 IG, 3-5 FB" },
                                            { value: "medium", label: "Medium", desc: "10-15 IG, 5-8 FB" },
                                            { value: "heavy", label: "Heavy", desc: "15-20 IG, 8-10 FB" },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => handleHashtagStyleChange(option.value as HashtagStyle)}
                                                className={`
                                                    flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left
                                                    ${aiSettings.hashtagStyle === option.value
                                                        ? 'border-[var(--accent-primary)] bg-[var(--accent-bg)]'
                                                        : 'border-[var(--border-primary)] hover:border-[var(--border-primary-hover)] bg-[var(--bg-card)]'
                                                    }
                                                `}
                                            >
                                                <div className={`text-sm font-medium ${aiSettings.hashtagStyle === option.value ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>
                                                    {option.label}
                                                </div>
                                                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                    {option.desc}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Emoji Style */}
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                                    <Smile size={18} className="text-amber-600 dark:text-amber-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <label className="text-sm font-medium text-[var(--text-primary)]">
                                            Emoji Density
                                        </label>
                                        {showSaved === "emojiStyle" && (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <Check size={14} />
                                                Saved
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                                        Control how many emojis AI includes in your captions.
                                    </p>
                                    <div className="flex gap-2">
                                        {[
                                            { value: "low", label: "Low", desc: "0–1 emojis" },
                                            { value: "medium", label: "Medium", desc: "2–4 emojis" },
                                            { value: "high", label: "High", desc: "5–8 emojis" },
                                        ].map((option) => (
                                            <button
                                                key={option.value}
                                                onClick={() => handleEmojiStyleChange(option.value as EmojiStyle)}
                                                className={`
                                                    flex-1 px-4 py-3 rounded-lg border-2 transition-all text-left
                                                    ${aiSettings.emojiStyle === option.value
                                                        ? 'border-[var(--accent-primary)] bg-[var(--accent-bg)]'
                                                        : 'border-[var(--border-primary)] hover:border-[var(--border-primary-hover)] bg-[var(--bg-card)]'
                                                    }
                                                `}
                                            >
                                                <div className={`text-sm font-medium ${aiSettings.emojiStyle === option.value ? 'text-[var(--accent-primary)]' : 'text-[var(--text-primary)]'}`}>
                                                    {option.label}
                                                </div>
                                                <div className="text-xs text-[var(--text-secondary)] mt-0.5">
                                                    {option.desc}
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Avoid Words */}
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                                    <Ban size={18} className="text-red-600 dark:text-red-400" />
                                </div>
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <label
                                            htmlFor="avoidWords"
                                            className="text-sm font-medium text-[var(--text-primary)]"
                                        >
                                            Avoid Words / Phrases
                                        </label>
                                        {showSaved === "avoidWords" && (
                                            <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
                                                <Check size={14} />
                                                Saved
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                                        Comma-separated list of words the AI should avoid. Posts will never start with these words, and they&apos;ll be limited to one use per batch.
                                    </p>
                                    <input
                                        id="avoidWords"
                                        type="text"
                                        value={localAvoidWords}
                                        onChange={(e) => handleAvoidWordsChange(e.target.value)}
                                        placeholder="indulge, delicious, amazing"
                                        className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]"
                                    />
                                    <p className="text-xs text-[var(--text-muted)] mt-2">
                                        Changing this setting only affects new generations, not existing posts.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </DashboardCard>
            </div>
        </div>
    );
}
