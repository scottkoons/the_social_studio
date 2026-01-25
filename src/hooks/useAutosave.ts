"use client";

import { useRef, useCallback, useEffect, useState } from "react";

interface UseAutosaveOptions {
  debounceMs?: number;
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onError?: (error: Error) => void;
}

interface UseAutosaveReturn {
  queueSave: (data: Record<string, unknown>) => void;
  isSaving: boolean;
  lastSavedAt: Date | null;
  flush: () => Promise<void>;
}

export function useAutosave({
  debounceMs = 1000,
  onSave,
  onError,
}: UseAutosaveOptions): UseAutosaveReturn {
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const pendingDataRef = useRef<Record<string, unknown> | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isFlushingRef = useRef(false);

  // Perform the actual save
  const performSave = useCallback(async (data: Record<string, unknown>) => {
    try {
      setIsSaving(true);
      await onSave(data);
      setLastSavedAt(new Date());
    } catch (err) {
      if (onError && err instanceof Error) {
        onError(err);
      }
      console.error("Autosave error:", err);
    } finally {
      setIsSaving(false);
    }
  }, [onSave, onError]);

  // Queue a save with debouncing
  const queueSave = useCallback((data: Record<string, unknown>) => {
    // Merge new data with any pending data
    pendingDataRef.current = {
      ...pendingDataRef.current,
      ...data,
    };

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout
    timeoutRef.current = setTimeout(async () => {
      const dataToSave = pendingDataRef.current;
      pendingDataRef.current = null;

      if (dataToSave) {
        await performSave(dataToSave);
      }
    }, debounceMs);
  }, [debounceMs, performSave]);

  // Flush any pending saves immediately
  const flush = useCallback(async () => {
    if (isFlushingRef.current) return;
    isFlushingRef.current = true;

    // Clear timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    // Save pending data
    const dataToSave = pendingDataRef.current;
    pendingDataRef.current = null;

    if (dataToSave) {
      await performSave(dataToSave);
    }

    isFlushingRef.current = false;
  }, [performSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return {
    queueSave,
    isSaving,
    lastSavedAt,
    flush,
  };
}

export default useAutosave;
