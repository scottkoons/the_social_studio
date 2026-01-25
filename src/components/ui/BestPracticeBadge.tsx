"use client";

import { Sparkles } from "lucide-react";
import Tooltip from "./Tooltip";

interface BestPracticeBadgeProps {
  tooltip: string;
  label?: string;
}

export default function BestPracticeBadge({ tooltip, label = "Best practice" }: BestPracticeBadgeProps) {
  return (
    <Tooltip content={tooltip}>
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 cursor-help">
        <Sparkles className="w-2.5 h-2.5" />
        {label}
      </span>
    </Tooltip>
  );
}
