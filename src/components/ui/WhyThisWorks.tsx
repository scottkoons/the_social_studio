"use client";

import { useState } from "react";
import { Lightbulb, ChevronDown, ChevronUp, Clock, Info } from "lucide-react";
import { IndustryProfile } from "@/lib/industryProfiles";

interface WhyThisWorksProps {
  industry: IndustryProfile;
  timezone?: string;
}

export default function WhyThisWorks({ industry, timezone = "America/Denver" }: WhyThisWorksProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { rationale } = industry;

  return (
    <div className="border border-[var(--border-primary)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-amber-100 dark:bg-amber-800/40 rounded-lg">
            <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-[var(--text-primary)]">
              Why this plan works for {industry.label.toLowerCase()}s
            </h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">
              {rationale.bestPracticeSource}
            </p>
          </div>
        </div>
      </div>

      {/* Bullets */}
      <div className="p-4 space-y-2">
        {rationale.whyThisWorks.map((bullet, index) => (
          <div key={index} className="flex items-start gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500 dark:bg-amber-400 mt-1.5 flex-shrink-0" />
            <p className="text-sm text-[var(--text-secondary)]">{bullet}</p>
          </div>
        ))}
      </div>

      {/* Timezone Note */}
      <div className="px-4 py-2 bg-[var(--bg-tertiary)] border-t border-[var(--border-secondary)]">
        <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
          <Clock className="w-3.5 h-3.5" />
          <span>All times shown in {timezone.replace("_", " ")} local time</span>
        </div>
      </div>

      {/* Expandable Details */}
      <div className="border-t border-[var(--border-secondary)]">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-xs text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" />
            How this is determined
          </span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {isExpanded && (
          <div className="px-4 pb-4 space-y-3">
            <div>
              <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
                Posting Times
              </p>
              <div className="space-y-1.5">
                <p className="text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-pink-500">Instagram:</span> {rationale.postingTimeRationale.ig}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  <span className="font-medium text-blue-500">Facebook:</span> {rationale.postingTimeRationale.fb}
                </p>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-1">
                Posting Frequency
              </p>
              <p className="text-xs text-[var(--text-secondary)]">{rationale.frequencyRationale}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
