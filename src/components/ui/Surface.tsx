"use client";

import { ReactNode } from "react";

interface SurfaceProps {
  children: ReactNode;
  className?: string;
  bordered?: boolean;
  padding?: "none" | "sm" | "md" | "lg";
  as?: "div" | "section" | "article";
}

const paddingClasses = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-6",
};

export default function Surface({
  children,
  className = "",
  bordered = false,
  padding = "md",
  as: Component = "div",
}: SurfaceProps) {
  const baseClasses = "bg-[var(--bg-secondary)] rounded-lg";
  const borderClasses = bordered ? "border border-[var(--border-primary)]" : "";
  const paddingClass = paddingClasses[padding];

  return (
    <Component
      className={`${baseClasses} ${borderClasses} ${paddingClass} ${className}`}
    >
      {children}
    </Component>
  );
}
