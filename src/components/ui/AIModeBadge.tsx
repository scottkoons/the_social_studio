"use client";

import { Image, FileText, Layers } from "lucide-react";
import { GenerationMode } from "@/lib/types";
import Tooltip from "./Tooltip";

interface AIModeBadgeProps {
  mode: GenerationMode;
  showTooltip?: boolean;
  size?: "sm" | "md";
}

const modeConfig: Record<GenerationMode, {
  label: string;
  tooltip: string;
  icon: typeof Image;
  bgClass: string;
  textClass: string;
}> = {
  image: {
    label: "Image",
    tooltip: "AI analyzes the image to generate captions",
    icon: Image,
    bgClass: "bg-blue-50 dark:bg-blue-900/20",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  hybrid: {
    label: "Hybrid",
    tooltip: "AI uses both image and your guidance text",
    icon: Layers,
    bgClass: "bg-purple-50 dark:bg-purple-900/20",
    textClass: "text-purple-600 dark:text-purple-400",
  },
  text: {
    label: "Text",
    tooltip: "AI uses only your guidance text",
    icon: FileText,
    bgClass: "bg-emerald-50 dark:bg-emerald-900/20",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
};

export default function AIModeBadge({ mode, showTooltip = true, size = "sm" }: AIModeBadgeProps) {
  const config = modeConfig[mode];
  const Icon = config.icon;

  const sizeClasses = size === "sm"
    ? "px-2 py-1 text-xs gap-1"
    : "px-2.5 py-1.5 text-sm gap-1.5";

  const iconSize = size === "sm" ? 12 : 14;

  const badge = (
    <span
      className={`inline-flex items-center rounded-full font-medium ${config.bgClass} ${config.textClass} ${sizeClasses}`}
    >
      <Icon size={iconSize} />
      {config.label}
    </span>
  );

  if (showTooltip) {
    return (
      <Tooltip content={config.tooltip}>
        {badge}
      </Tooltip>
    );
  }

  return badge;
}
