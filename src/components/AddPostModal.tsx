"use client";

import { useState, useCallback, useEffect } from "react";
import Image from "next/image";
import { X, Upload, Loader2, Calendar } from "lucide-react";
import { useDropzone } from "react-dropzone";
import { db, storage } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { generatePlatformPostingTimes } from "@/lib/postingTime";
import { getTodayInDenver, isPastInDenver } from "@/lib/utils";
import { format, addDays } from "date-fns";

interface AddPostModalProps {
  open: boolean;
  workspaceId: string;
  existingDates?: Set<string>;
  onClose: () => void;
  onSuccess: (date: string) => void;
  onError: (message: string) => void;
}

export default function AddPostModal({
  open,
  workspaceId,
  existingDates = new Set(),
  onClose,
  onSuccess,
  onError,
}: AddPostModalProps) {
  const [date, setDate] = useState("");
  const [starterText, setStarterText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);

  // Set default date to next available
  useEffect(() => {
    if (open) {
      let nextDate = new Date();
      let dateStr = format(nextDate, "yyyy-MM-dd");

      // Find next available date
      while (existingDates.has(dateStr) || isPastInDenver(dateStr)) {
        nextDate = addDays(nextDate, 1);
        dateStr = format(nextDate, "yyyy-MM-dd");
      }

      setDate(dateStr);
      setStarterText("");
      setImageFile(null);
      setImagePreview(null);
      setDateError(null);
    }
  }, [open, existingDates]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        onClose();
      }
    };

    if (open) {
      document.body.style.overflow = "hidden";
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // Image dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    const file = acceptedFiles[0];
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    useFsAccessApi: false,
  });

  const handleRemoveImage = () => {
    if (imagePreview) {
      URL.revokeObjectURL(imagePreview);
    }
    setImageFile(null);
    setImagePreview(null);
  };

  const handleDateChange = (value: string) => {
    setDate(value);

    if (isPastInDenver(value)) {
      setDateError("Cannot create posts in the past");
    } else if (existingDates.has(value)) {
      setDateError("A post already exists on this date");
    } else {
      setDateError(null);
    }
  };

  const handleCreate = async () => {
    if (!workspaceId || !date || dateError) return;

    setIsCreating(true);

    try {
      // Check if post already exists
      const docRef = doc(db, "workspaces", workspaceId, "post_days", date);
      const existingDoc = await getDoc(docRef);

      if (existingDoc.exists()) {
        setDateError("A post already exists on this date");
        setIsCreating(false);
        return;
      }

      // Generate posting times
      const postingTimes = generatePlatformPostingTimes(date, date);

      // Build post data
      const postData: Record<string, unknown> = {
        date,
        starterText: starterText.trim() || "",
        postingTimeIg: postingTimes.ig,
        postingTimeFb: postingTimes.fb,
        postingTimeIgSource: "auto",
        postingTimeFbSource: "auto",
        status: "input",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      // Upload image if provided
      if (imageFile) {
        const storagePath = `assets/${workspaceId}/${date}/${imageFile.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, imageFile);
        const downloadUrl = await getDownloadURL(storageRef);

        // Create asset document
        const assetId = crypto.randomUUID();
        await setDoc(doc(db, "workspaces", workspaceId, "assets", assetId), {
          id: assetId,
          storagePath,
          fileName: imageFile.name,
          contentType: imageFile.type,
          size: imageFile.size,
          downloadUrl,
          createdAt: serverTimestamp(),
          workspaceId,
        });

        postData.imageAssetId = assetId;
        postData.imageUrl = downloadUrl;
        postData.generationMode = starterText.trim() ? "hybrid" : "image";
      } else if (starterText.trim()) {
        postData.generationMode = "text";
      }

      // Create post
      await setDoc(docRef, postData);

      onSuccess(date);
      onClose();
    } catch (err) {
      console.error("Error creating post:", err);
      onError("Failed to create post");
    } finally {
      setIsCreating(false);
    }
  };

  if (!open) return null;

  const today = getTodayInDenver();
  const canCreate = date && !dateError && !isCreating;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[var(--bg-secondary)] rounded-xl shadow-lg max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-primary)]">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-[var(--accent-primary)]" />
            <h3 className="font-medium text-[var(--text-primary)]">Add New Post</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-5">
          {/* Date picker */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              min={today}
              onChange={(e) => handleDateChange(e.target.value)}
              className={`
                w-full px-3 py-2.5 border rounded-lg text-sm bg-[var(--input-bg)]
                focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)]
                ${dateError ? "border-red-500" : "border-[var(--input-border)]"}
              `}
            />
            {dateError && (
              <p className="text-xs text-red-500 mt-1">{dateError}</p>
            )}
          </div>

          {/* Image upload */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Image <span className="text-[var(--text-tertiary)]">(optional)</span>
            </label>
            {imagePreview ? (
              <div className="space-y-2">
                <div className="relative aspect-video bg-[var(--bg-tertiary)] rounded-lg overflow-hidden">
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="object-contain"
                    sizes="400px"
                  />
                </div>
                <button
                  onClick={handleRemoveImage}
                  className="text-sm text-[var(--status-error)] hover:underline"
                >
                  Remove image
                </button>
              </div>
            ) : (
              <div
                {...getRootProps()}
                className={`
                  aspect-video rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors
                  ${isDragActive
                    ? "border-[var(--accent-primary)] bg-[var(--accent-bg)]"
                    : "border-[var(--border-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)]"
                  }
                `}
              >
                <input {...getInputProps()} />
                <div className="text-center">
                  <Upload className="mx-auto mb-2 text-[var(--text-tertiary)]" size={28} />
                  <p className="text-sm text-[var(--text-secondary)]">Drop an image or click to upload</p>
                </div>
              </div>
            )}
          </div>

          {/* Starter text */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-primary)] mb-1.5">
              Guidance Text <span className="text-[var(--text-tertiary)]">(optional)</span>
            </label>
            <textarea
              value={starterText}
              onChange={(e) => setStarterText(e.target.value)}
              rows={3}
              placeholder="Add context to guide the AI generation..."
              className="w-full px-3 py-2.5 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 bg-[var(--bg-primary)] flex justify-end gap-2 border-t border-[var(--border-secondary)]">
          <button
            onClick={onClose}
            disabled={isCreating}
            className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!canCreate}
            className="px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            {isCreating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating...
              </>
            ) : (
              "Create Post"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
