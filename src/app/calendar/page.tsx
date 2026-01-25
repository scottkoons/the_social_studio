"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// V2 Redirect: /calendar -> /posts
export default function CalendarPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/posts");
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-[var(--border-primary)] border-t-[var(--accent-primary)]" />
    </div>
  );
}
