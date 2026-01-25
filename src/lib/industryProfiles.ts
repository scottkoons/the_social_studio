/**
 * Business Type Profiles Configuration
 *
 * Central config for business type-specific optimizations.
 * Adding a new business type requires only updating this file + dropdown option.
 */

export type BusinessTypeId = "restaurant" | "bar_brewery";

// Keep IndustryId as alias for backward compatibility
export type IndustryId = BusinessTypeId;

export interface PostingFrequency {
  min: number;
  max: number;
}

export interface TimeWindow {
  start: string; // HH:MM format
  end: string;
  dayTypes?: ("weekday" | "weekend")[]; // If specified, window only applies to these day types
}

export interface LanguageBias {
  avoidWords: string[];
  preferredTone?: string;
}

// Rationale copy for AI transparency
export interface IndustryRationale {
  whyThisWorks: string[]; // 3-4 bullet points
  postingTimeRationale: {
    ig: string;
    fb: string;
  };
  frequencyRationale: string;
  bestPracticeSource: string;
}

export interface IndustryProfile {
  id: BusinessTypeId;
  label: string;
  postingFrequency: {
    ig: PostingFrequency;
    fb: PostingFrequency;
  };
  preferredDays: number[]; // 0 = Sunday, 6 = Saturday (prioritized)
  lightDays: number[]; // Days to use only if needed to hit targets
  timeWindows: {
    ig: TimeWindow[];
    fb: TimeWindow[];
  };
  languageBias: LanguageBias;
  rationale: IndustryRationale;
}

export const INDUSTRY_PROFILES: Record<BusinessTypeId, IndustryProfile> = {
  restaurant: {
    id: "restaurant",
    label: "Restaurant",
    postingFrequency: {
      ig: { min: 6, max: 7 },
      fb: { min: 4, max: 6 },
    },
    preferredDays: [0, 3, 4, 5, 6], // Sun, Wed, Thu, Fri, Sat
    lightDays: [1, 2], // Mon, Tue - use only if needed
    timeWindows: {
      ig: [
        { start: "11:00", end: "13:00", dayTypes: ["weekday"] },
        { start: "16:30", end: "18:30", dayTypes: ["weekday"] },
        { start: "09:30", end: "11:00", dayTypes: ["weekend"] },
      ],
      fb: [
        { start: "11:00", end: "13:00", dayTypes: ["weekday"] },
        { start: "16:30", end: "18:30", dayTypes: ["weekday"] },
        { start: "09:30", end: "11:00", dayTypes: ["weekend"] },
      ],
    },
    languageBias: {
      avoidWords: ["indulge", "mouthwatering", "delectable", "scrumptious", "yummy", "nightlife", "party", "drinks"],
      preferredTone: "food-first, menu highlights, warm inviting language; avoid nightlife-heavy tone",
    },
    rationale: {
      whyThisWorks: [
        "Posts timed around meal decisions when hunger drives engagement",
        "Daily posting builds habit-forming visibility with your audience",
        "Warm, community-focused language matches dining-out psychology",
        "Visual-first content showcases dishes at their most appetizing",
      ],
      postingTimeRationale: {
        ig: "Weekdays 11am-1pm (lunch) or 4:30-6:30pm (dinner); Weekends 9:30-11am (brunch planning)",
        fb: "Weekdays 11am-1pm or 4:30-6:30pm; Weekends 9:30-11am when users plan outings",
      },
      frequencyRationale: "6-7 posts/week on IG, 4-6 on FB mirrors restaurant discovery patterns",
      bestPracticeSource: "Based on 2024 hospitality social media engagement studies",
    },
  },
  bar_brewery: {
    id: "bar_brewery",
    label: "Bar / Brewery",
    postingFrequency: {
      ig: { min: 5, max: 6 },
      fb: { min: 4, max: 5 },
    },
    preferredDays: [0, 4, 5, 6], // Sun, Thu, Fri, Sat
    lightDays: [1, 2, 3], // Mon, Tue, Wed - use only if needed
    timeWindows: {
      ig: [
        { start: "16:00", end: "18:00", dayTypes: ["weekday"] },
        { start: "18:30", end: "21:00", dayTypes: ["weekday"] },
        { start: "11:00", end: "13:00", dayTypes: ["weekend"] },
      ],
      fb: [
        { start: "16:00", end: "18:00", dayTypes: ["weekday"] },
        { start: "18:30", end: "21:00", dayTypes: ["weekday"] },
        { start: "11:00", end: "13:00", dayTypes: ["weekend"] },
      ],
    },
    languageBias: {
      avoidWords: ["indulge", "mouthwatering", "delectable", "scrumptious", "yummy", "fine dining", "gourmet"],
      preferredTone: "atmosphere + drinks + events energy; avoid overly food-descriptive tone unless food is mentioned",
    },
    rationale: {
      whyThisWorks: [
        "Posts catch users during happy hour planning and weekend outing decisions",
        "Event and atmosphere-focused content drives foot traffic",
        "Energetic language matches the social nature of bar/brewery visits",
        "Timing aligns with when people plan evening and weekend activities",
      ],
      postingTimeRationale: {
        ig: "Weekdays 4-6pm (happy hour) or 6:30-9pm (evening plans); Weekends 11am-1pm (day drinking)",
        fb: "Weekdays 4-6pm or 6:30-9pm; Weekends 11am-1pm when groups plan meetups",
      },
      frequencyRationale: "5-6 posts/week on IG, 4-5 on FB captures weekend-heavy audience",
      bestPracticeSource: "Based on 2024 beverage industry social media benchmarks",
    },
  },
};

/**
 * Get default posting frequency for a business type (uses HIGH end)
 */
export function getDefaultPostingFrequency(businessTypeId?: string): { ig: number; fb: number } {
  const profile = getIndustryProfile(businessTypeId);
  return {
    ig: profile.postingFrequency.ig.max,
    fb: profile.postingFrequency.fb.max,
  };
}

/**
 * Get business type profile by ID, with fallback to restaurant
 * Handles invalid/legacy values by returning restaurant profile
 */
export function getIndustryProfile(businessTypeId?: string): IndustryProfile {
  // Handle undefined, null, or invalid values by falling back to restaurant
  if (!businessTypeId || !(businessTypeId in INDUSTRY_PROFILES)) {
    return INDUSTRY_PROFILES.restaurant;
  }
  return INDUSTRY_PROFILES[businessTypeId as BusinessTypeId];
}

// Alias for clarity
export const getBusinessTypeProfile = getIndustryProfile;

/**
 * Get all business type options for dropdowns
 */
export function getIndustryOptions(): { value: BusinessTypeId; label: string }[] {
  return Object.values(INDUSTRY_PROFILES).map((profile) => ({
    value: profile.id,
    label: profile.label,
  }));
}

// Alias for clarity
export const getBusinessTypeOptions = getIndustryOptions;

/**
 * Check if a day is a weekend (Sat/Sun)
 */
export function isWeekend(dayOfWeek: number): boolean {
  return dayOfWeek === 0 || dayOfWeek === 6;
}

/**
 * Get appropriate time window for a given day and platform
 */
export function getTimeWindowForDay(
  businessTypeId: string | undefined,
  platform: "ig" | "fb",
  dayOfWeek: number
): TimeWindow {
  const profile = getIndustryProfile(businessTypeId);
  const windows = profile.timeWindows[platform];
  const dayType = isWeekend(dayOfWeek) ? "weekend" : "weekday";

  // Find windows that match this day type
  const matchingWindows = windows.filter(
    (w) => !w.dayTypes || w.dayTypes.includes(dayType)
  );

  // Return a random matching window, or first window as fallback
  if (matchingWindows.length > 0) {
    return matchingWindows[Math.floor(Math.random() * matchingWindows.length)];
  }
  return windows[0];
}

/**
 * Check if a day is preferred for this business type
 */
export function isPreferredDay(businessTypeId: string | undefined, dayOfWeek: number): boolean {
  const profile = getIndustryProfile(businessTypeId);
  return profile.preferredDays.includes(dayOfWeek);
}

/**
 * Check if a day is a "light" day (Mon/Tue typically)
 */
export function isLightDay(businessTypeId: string | undefined, dayOfWeek: number): boolean {
  const profile = getIndustryProfile(businessTypeId);
  return profile.lightDays.includes(dayOfWeek);
}
