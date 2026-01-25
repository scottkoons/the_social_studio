/**
 * Industry Profiles Configuration
 *
 * Central config for industry-specific optimizations.
 * Adding a new industry requires only updating this file + dropdown option.
 */

export type IndustryId = "restaurant" | "retail";

export interface PostingFrequency {
  min: number;
  max: number;
}

export interface TimeWindow {
  start: string; // HH:MM format
  end: string;
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
  bestPracticeSource: string; // e.g., "Based on 2024 industry engagement studies"
}

export interface IndustryProfile {
  id: IndustryId;
  label: string;
  postingFrequency: {
    ig: PostingFrequency;
    fb: PostingFrequency;
  };
  preferredDays: number[]; // 0 = Sunday, 6 = Saturday
  timeWindows: {
    ig: TimeWindow[];
    fb: TimeWindow[];
  };
  languageBias: LanguageBias;
  rationale: IndustryRationale;
}

export const INDUSTRY_PROFILES: Record<IndustryId, IndustryProfile> = {
  restaurant: {
    id: "restaurant",
    label: "Restaurant",
    postingFrequency: {
      ig: { min: 6, max: 7 },
      fb: { min: 4, max: 6 },
    },
    preferredDays: [0, 1, 2, 3, 4, 5, 6], // All days
    timeWindows: {
      ig: [
        { start: "11:00", end: "13:00" }, // Lunch consideration
        { start: "17:00", end: "19:00" }, // Dinner consideration
      ],
      fb: [
        { start: "11:00", end: "13:00" },
        { start: "18:00", end: "20:00" },
      ],
    },
    languageBias: {
      avoidWords: ["indulge", "mouthwatering", "delectable", "scrumptious", "yummy"],
      preferredTone: "warm and inviting, focusing on community and fresh ingredients",
    },
    rationale: {
      whyThisWorks: [
        "Posts timed around meal decisions when hunger drives engagement",
        "Daily posting builds habit-forming visibility with your audience",
        "Warm, community-focused language matches dining-out psychology",
        "Visual-first content showcases dishes at their most appetizing",
      ],
      postingTimeRationale: {
        ig: "11am-1pm (lunch) and 5-7pm (dinner) when people decide where to eat",
        fb: "11am-1pm and 6-8pm when Facebook users browse during meal planning",
      },
      frequencyRationale: "6-7 posts/week on IG, 4-6 on FB mirrors restaurant discovery patterns",
      bestPracticeSource: "Based on 2024 hospitality social media engagement studies",
    },
  },
  retail: {
    id: "retail",
    label: "Retail",
    postingFrequency: {
      ig: { min: 5, max: 6 },
      fb: { min: 3, max: 5 },
    },
    preferredDays: [0, 1, 2, 3, 4, 5, 6], // All days
    timeWindows: {
      ig: [
        { start: "10:00", end: "12:00" }, // Morning shopping
        { start: "19:00", end: "21:00" }, // Evening browsing
      ],
      fb: [
        { start: "12:00", end: "14:00" },
        { start: "19:00", end: "21:00" },
      ],
    },
    languageBias: {
      avoidWords: ["indulge", "splurge", "treat yourself", "must-have"],
      preferredTone: "helpful and enthusiastic, focusing on value and quality",
    },
    rationale: {
      whyThisWorks: [
        "Posts reach shoppers during peak browsing and purchase-intent windows",
        "Consistent cadence keeps products top-of-mind without overwhelming",
        "Value-focused messaging aligns with retail purchase psychology",
        "Product imagery drives click-through and store visits",
      ],
      postingTimeRationale: {
        ig: "10am-12pm (morning browse) and 7-9pm (evening shopping) when buyers are active",
        fb: "12-2pm (lunch break browse) and 7-9pm (evening relaxation) for discovery",
      },
      frequencyRationale: "5-6 posts/week on IG, 3-5 on FB balances visibility with quality",
      bestPracticeSource: "Based on 2024 retail social commerce benchmarks",
    },
  },
};

/**
 * Get default posting frequency for an industry (uses HIGH end)
 */
export function getDefaultPostingFrequency(industryId: IndustryId): { ig: number; fb: number } {
  const profile = INDUSTRY_PROFILES[industryId];
  return {
    ig: profile.postingFrequency.ig.max,
    fb: profile.postingFrequency.fb.max,
  };
}

/**
 * Get industry profile by ID, with fallback to restaurant
 */
export function getIndustryProfile(industryId?: IndustryId): IndustryProfile {
  return INDUSTRY_PROFILES[industryId || "restaurant"];
}

/**
 * Get all industry options for dropdowns
 */
export function getIndustryOptions(): { value: IndustryId; label: string }[] {
  return Object.values(INDUSTRY_PROFILES).map((profile) => ({
    value: profile.id,
    label: profile.label,
  }));
}
