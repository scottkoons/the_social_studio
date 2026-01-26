"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspaceUiSettings } from "@/hooks/useWorkspaceUiSettings";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import Surface from "@/components/ui/Surface";
import Toast from "@/components/ui/Toast";
import { Check, EyeOff, Hash, Smile, Ban, Building2, Store, RotateCcw, Save, Loader2 } from "lucide-react";
import { HashtagStyle, EmojiStyle, BusinessProfile, BusinessIndustry } from "@/lib/types";
import { BusinessTypeId, getBusinessTypeOptions, getIndustryProfile } from "@/lib/industryProfiles";
import WhyThisWorks from "@/components/ui/WhyThisWorks";

const BUSINESS_CONTEXT_MAX_LENGTH = 2000;
const BUSINESS_INDUSTRY_OPTIONS: { value: BusinessIndustry; label: string }[] = [
  { value: "restaurant", label: "Restaurant" },
  { value: "retail", label: "Retail" },
];

export default function SettingsPage() {
  const { user, workspaceId, workspaceLoading } = useAuth();
  const {
    settings,
    aiSettings,
    loading,
    setHidePastUnsent,
    setHashtagStyle,
    setEmojiStyle,
    setAvoidWords,
    setBusinessType,
    setStrictGuidance,
  } = useWorkspaceUiSettings();
  const [showSaved, setShowSaved] = useState<string | null>(null);
  const [localAvoidWords, setLocalAvoidWords] = useState(aiSettings.avoidWords);
  const avoidWordsDebounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Business Profile state
  const [savedBusinessProfile, setSavedBusinessProfile] = useState<BusinessProfile | null>(null);
  const [localBusinessName, setLocalBusinessName] = useState("");
  const [localBusinessIndustry, setLocalBusinessIndustry] = useState<BusinessIndustry>("restaurant");
  const [localProfileBrandVoice, setLocalProfileBrandVoice] = useState("");
  const [localBusinessContext, setLocalBusinessContext] = useState("");
  const [localBannedPhrases, setLocalBannedPhrases] = useState("");
  const [businessProfileLoading, setBusinessProfileLoading] = useState(true);
  const [businessProfileSaving, setBusinessProfileSaving] = useState(false);

  // Toast state
  const [toast, setToast] = useState<{ type: "success" | "error" | "warn"; message: string } | null>(null);

  // Sync local avoid words with settings when loaded
  useEffect(() => {
    setLocalAvoidWords(aiSettings.avoidWords);
  }, [aiSettings.avoidWords]);

  // Load business profile from Firestore
  useEffect(() => {
    if (!workspaceId) return;

    const loadBusinessProfile = async () => {
      setBusinessProfileLoading(true);
      try {
        const workspaceRef = doc(db, "workspaces", workspaceId);
        const workspaceDoc = await getDoc(workspaceRef);
        if (workspaceDoc.exists()) {
          const data = workspaceDoc.data();
          const profile = data?.settings?.businessProfile as BusinessProfile | undefined;
          if (profile) {
            setSavedBusinessProfile(profile);
            setLocalBusinessName(profile.businessName || "");
            setLocalBusinessIndustry(profile.industry || "restaurant");
            setLocalProfileBrandVoice(profile.brandVoice || "");
            setLocalBusinessContext(profile.businessContext || "");
            setLocalBannedPhrases(profile.bannedPhrases?.join(", ") || "");
          }
        }
      } catch (err) {
        console.error("Error loading business profile:", err);
      } finally {
        setBusinessProfileLoading(false);
      }
    };

    loadBusinessProfile();
  }, [workspaceId]);

  // Check if business profile has unsaved changes
  const hasBusinessProfileChanges = useCallback(() => {
    const savedName = savedBusinessProfile?.businessName || "";
    const savedIndustry = savedBusinessProfile?.industry || "restaurant";
    const savedBrandVoice = savedBusinessProfile?.brandVoice || "";
    const savedContext = savedBusinessProfile?.businessContext || "";
    const savedBanned = savedBusinessProfile?.bannedPhrases?.join(", ") || "";

    return (
      localBusinessName !== savedName ||
      localBusinessIndustry !== savedIndustry ||
      localProfileBrandVoice !== savedBrandVoice ||
      localBusinessContext !== savedContext ||
      localBannedPhrases !== savedBanned
    );
  }, [savedBusinessProfile, localBusinessName, localBusinessIndustry, localProfileBrandVoice, localBusinessContext, localBannedPhrases]);

  // Parse banned phrases from comma-separated string
  const parseBannedPhrases = (input: string): string[] => {
    return input
      .split(",")
      .map((phrase) => phrase.trim())
      .filter((phrase) => phrase.length > 0);
  };

  // Save business profile
  const handleSaveBusinessProfile = async () => {
    if (!workspaceId || !user) return;

    // Validate business name
    if (!localBusinessName.trim()) {
      setToast({ type: "error", message: "Business name is required" });
      return;
    }

    setBusinessProfileSaving(true);
    try {
      const profile: BusinessProfile = {
        businessName: localBusinessName.trim(),
        industry: localBusinessIndustry,
        brandVoice: localProfileBrandVoice.trim() || undefined,
        businessContext: localBusinessContext.trim() || undefined,
        bannedPhrases: parseBannedPhrases(localBannedPhrases),
      };

      const workspaceRef = doc(db, "workspaces", workspaceId);
      await setDoc(
        workspaceRef,
        {
          settings: {
            businessProfile: {
              ...profile,
              updatedAt: serverTimestamp(),
              updatedBy: user.uid,
            },
          },
        },
        { merge: true }
      );

      setSavedBusinessProfile(profile);
      setToast({ type: "success", message: "Business profile saved" });
    } catch (err) {
      console.error("Error saving business profile:", err);
      setToast({ type: "error", message: "Failed to save business profile" });
    } finally {
      setBusinessProfileSaving(false);
    }
  };

  // Reset business profile to saved values
  const handleResetBusinessProfile = () => {
    setLocalBusinessName(savedBusinessProfile?.businessName || "");
    setLocalBusinessIndustry(savedBusinessProfile?.industry || "restaurant");
    setLocalProfileBrandVoice(savedBusinessProfile?.brandVoice || "");
    setLocalBusinessContext(savedBusinessProfile?.businessContext || "");
    setLocalBannedPhrases(savedBusinessProfile?.bannedPhrases?.join(", ") || "");
  };

  // Auto-hide toast after 3 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const handleToggle = async () => {
    await setHidePastUnsent(!settings.hidePastUnsent);
    showSavedIndicator("hidePastUnsent");
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
    if (avoidWordsDebounceTimer.current) clearTimeout(avoidWordsDebounceTimer.current);
    avoidWordsDebounceTimer.current = setTimeout(async () => {
      await setAvoidWords(value);
      showSavedIndicator("avoidWords");
    }, 1000);
  };

  const handleBusinessTypeChange = async (value: BusinessTypeId) => {
    await setBusinessType(value);
    showSavedIndicator("businessType");
  };

  const handleStrictGuidanceToggle = async () => {
    await setStrictGuidance(!aiSettings.strictGuidance);
    showSavedIndicator("strictGuidance");
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

  // Loading state
  if (workspaceLoading || !workspaceId) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto">
        <Surface bordered padding="lg">
          <div className="py-16 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto mb-4" />
            <p className="text-sm text-[var(--text-secondary)]">Loading settings...</p>
          </div>
        </Surface>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-xl font-medium text-[var(--text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--text-secondary)]">
          Manage your workspace preferences
        </p>
      </div>

      <div className="space-y-6">
        {/* Display Settings */}
        <Surface bordered padding="none">
          <div className="px-6 py-4 border-b border-[var(--border-secondary)]">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">Display</h2>
          </div>
          <div className="px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-[var(--bg-tertiary)] rounded-md">
                  <EyeOff className="w-4 h-4 text-[var(--text-secondary)]" />
                </div>
                <div>
                  <label
                    htmlFor="hidePastUnsent"
                    className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
                  >
                    Hide past unsent posts
                  </label>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
                    Posts dated before today that were not sent will be hidden. Sent posts always remain visible.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {showSaved === "hidePastUnsent" && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                    <Check className="w-3 h-3" />
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
                    transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2
                    disabled:opacity-50 disabled:cursor-not-allowed
                    ${settings.hidePastUnsent ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-tertiary)]"}
                  `}
                >
                  <span
                    className={`
                      pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                      transition duration-200 ease-in-out
                      ${settings.hidePastUnsent ? "translate-x-5" : "translate-x-0"}
                    `}
                  />
                </button>
              </div>
            </div>
          </div>
        </Surface>

        {/* AI Settings */}
        <Surface bordered padding="none">
          <div className="px-6 py-4 border-b border-[var(--border-secondary)]">
            <h2 className="text-sm font-medium text-[var(--text-primary)]">AI Generation</h2>
          </div>
          <div className="divide-y divide-[var(--border-secondary)]">
            {/* Hashtag Style */}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/20 rounded-md">
                  <Hash className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Hashtag Density</label>
                    {showSaved === "hashtagStyle" && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                        <Check className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">
                    Control how many hashtags AI includes in your posts.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { value: "light", label: "Light", desc: "5-8 IG, 3-5 FB" },
                      { value: "medium", label: "Medium", desc: "10-15 IG, 5-8 FB" },
                      { value: "heavy", label: "Heavy", desc: "15-20 IG, 8-10 FB" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleHashtagStyleChange(option.value as HashtagStyle)}
                        className={`
                          px-3 py-2.5 rounded-lg border transition-all text-left
                          ${
                            aiSettings.hashtagStyle === option.value
                              ? "border-[var(--accent-primary)] bg-[var(--accent-bg)]"
                              : "border-[var(--border-primary)] hover:border-[var(--border-primary-hover)] bg-[var(--bg-secondary)]"
                          }
                        `}
                      >
                        <div
                          className={`text-sm font-medium ${
                            aiSettings.hashtagStyle === option.value
                              ? "text-[var(--accent-primary)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {option.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Emoji Style */}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/20 rounded-md">
                  <Smile className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-[var(--text-primary)]">Emoji Density</label>
                    {showSaved === "emojiStyle" && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                        <Check className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">
                    Control how many emojis AI includes in captions.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { value: "low", label: "Low", desc: "0-1 emojis" },
                      { value: "medium", label: "Medium", desc: "2-4 emojis" },
                      { value: "high", label: "High", desc: "5-8 emojis" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        onClick={() => handleEmojiStyleChange(option.value as EmojiStyle)}
                        className={`
                          px-3 py-2.5 rounded-lg border transition-all text-left
                          ${
                            aiSettings.emojiStyle === option.value
                              ? "border-[var(--accent-primary)] bg-[var(--accent-bg)]"
                              : "border-[var(--border-primary)] hover:border-[var(--border-primary-hover)] bg-[var(--bg-secondary)]"
                          }
                        `}
                      >
                        <div
                          className={`text-sm font-medium ${
                            aiSettings.emojiStyle === option.value
                              ? "text-[var(--accent-primary)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {option.label}
                        </div>
                        <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">{option.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Avoid Words */}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-red-100 dark:bg-red-900/20 rounded-md">
                  <Ban className="w-4 h-4 text-red-600 dark:text-red-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="avoidWords" className="text-sm font-medium text-[var(--text-primary)]">
                      Avoid Words
                    </label>
                    {showSaved === "avoidWords" && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                        <Check className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">
                    Words the AI should avoid. Posts will never start with these words.
                  </p>
                  <input
                    id="avoidWords"
                    type="text"
                    value={localAvoidWords}
                    onChange={(e) => handleAvoidWordsChange(e.target.value)}
                    placeholder="indulge, delicious, amazing"
                    className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]"
                  />
                </div>
              </div>
            </div>

            {/* Business Type */}
            <div className="px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/20 rounded-md">
                  <Building2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="businessType" className="text-sm font-medium text-[var(--text-primary)]">
                      Business Type
                    </label>
                    {showSaved === "businessType" && (
                      <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                        <Check className="w-3 h-3" />
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--text-tertiary)] mb-3">
                    Used to optimize AI scheduling, posting times, and language style.
                  </p>
                  <select
                    id="businessType"
                    value={aiSettings.businessType}
                    onChange={(e) => handleBusinessTypeChange(e.target.value as BusinessTypeId)}
                    className="w-full text-sm text-[var(--text-primary)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]"
                  >
                    {getBusinessTypeOptions().map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>

                  {/* Strict Guidance Toggle */}
                  <div className="mt-4 pt-4 border-t border-[var(--border-secondary)]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <label
                          htmlFor="strictGuidance"
                          className="text-sm font-medium text-[var(--text-primary)] cursor-pointer"
                        >
                          Strict AI Guidance
                        </label>
                        <p className="text-xs text-[var(--text-tertiary)] mt-1">
                          AI follows business type language rules strictly (recommended). Turn off for more creative freedom.
                        </p>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {showSaved === "strictGuidance" && (
                          <span className="inline-flex items-center gap-1 text-xs text-[var(--status-success)]">
                            <Check className="w-3 h-3" />
                            Saved
                          </span>
                        )}
                        <button
                          id="strictGuidance"
                          role="switch"
                          aria-checked={aiSettings.strictGuidance}
                          onClick={handleStrictGuidanceToggle}
                          disabled={loading}
                          className={`
                            relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                            transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${aiSettings.strictGuidance ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-tertiary)]"}
                          `}
                        >
                          <span
                            className={`
                              pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                              transition duration-200 ease-in-out
                              ${aiSettings.strictGuidance ? "translate-x-5" : "translate-x-0"}
                            `}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Surface>

        {/* Business Context */}
        <Surface bordered padding="none">
          <div className="px-6 py-4 border-b border-[var(--border-secondary)]">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-[var(--text-secondary)]" />
              <h2 className="text-sm font-medium text-[var(--text-primary)]">Business Context</h2>
            </div>
            <p className="text-xs text-[var(--text-tertiary)] mt-1">
              Optional info the AI can use to write more accurate, engaging posts.
            </p>
          </div>

          {businessProfileLoading ? (
            <div className="px-6 py-8 text-center">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)] mx-auto" />
            </div>
          ) : (
            <div className="px-6 py-5 space-y-5">
              {/* Business Name */}
              <div>
                <label htmlFor="businessName" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Business Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="businessName"
                  type="text"
                  value={localBusinessName}
                  onChange={(e) => setLocalBusinessName(e.target.value)}
                  placeholder="Your business name"
                  maxLength={100}
                  className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]"
                />
              </div>

              {/* Industry */}
              <div>
                <label htmlFor="businessIndustry" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Industry
                </label>
                <select
                  id="businessIndustry"
                  value={localBusinessIndustry}
                  onChange={(e) => setLocalBusinessIndustry(e.target.value as BusinessIndustry)}
                  className="w-full text-sm text-[var(--text-primary)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]"
                >
                  {BUSINESS_INDUSTRY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Brand Voice */}
              <div>
                <label htmlFor="profileBrandVoice" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Brand Voice
                </label>
                <p className="text-xs text-[var(--text-tertiary)] mb-2">
                  Describe your brand&apos;s tone and style to help AI match your voice.
                </p>
                <textarea
                  id="profileBrandVoice"
                  value={localProfileBrandVoice}
                  onChange={(e) => setLocalProfileBrandVoice(e.target.value)}
                  placeholder="E.g., Friendly and casual, with a touch of humor. We love using emojis and keeping things upbeat."
                  rows={3}
                  className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] resize-y min-h-[80px]"
                />
              </div>

              {/* Business Context */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="businessContext" className="text-sm font-medium text-[var(--text-primary)]">
                    Business Context
                  </label>
                  <span className={`text-xs ${localBusinessContext.length > BUSINESS_CONTEXT_MAX_LENGTH ? "text-red-500" : "text-[var(--text-muted)]"}`}>
                    {localBusinessContext.length} / {BUSINESS_CONTEXT_MAX_LENGTH}
                  </span>
                </div>
                <textarea
                  id="businessContext"
                  value={localBusinessContext}
                  onChange={(e) => setLocalBusinessContext(e.target.value)}
                  placeholder="What you sell, vibe, target customers, key products, specials, locations/areas you serve (if multiple), brand personality, any do/don't words, SEO keywords you care about, etc."
                  maxLength={BUSINESS_CONTEXT_MAX_LENGTH}
                  rows={5}
                  className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] resize-y min-h-[120px]"
                />
              </div>

              {/* Banned Phrases */}
              <div>
                <label htmlFor="bannedPhrases" className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
                  Do not use words/phrases
                </label>
                <p className="text-xs text-[var(--text-tertiary)] mb-2">
                  Comma-separated list of words or phrases the AI should avoid.
                </p>
                <input
                  id="bannedPhrases"
                  type="text"
                  value={localBannedPhrases}
                  onChange={(e) => setLocalBannedPhrases(e.target.value)}
                  placeholder="indulge, best ever, gourmet"
                  className="w-full text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg p-3 focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]"
                />
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-[var(--border-secondary)]">
                <button
                  onClick={handleResetBusinessProfile}
                  disabled={!hasBusinessProfileChanges() || businessProfileSaving}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <RotateCcw className="w-4 h-4" />
                  Reset
                </button>
                <button
                  onClick={handleSaveBusinessProfile}
                  disabled={!hasBusinessProfileChanges() || businessProfileSaving || !localBusinessName.trim()}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {businessProfileSaving ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save
                </button>
              </div>
            </div>
          )}
        </Surface>

        {/* AI Transparency - Why This Works */}
        <WhyThisWorks industry={getIndustryProfile(aiSettings.businessType)} />
      </div>

      {/* Toast */}
      {toast && (
        <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />
      )}
    </div>
  );
}
