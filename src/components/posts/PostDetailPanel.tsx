"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import { Trash2, Copy, Upload, Loader2, Sparkles, Check, Instagram, Facebook, X, ZoomIn, Info, Lock } from "lucide-react";
import SlidePanel from "@/components/ui/SlidePanel";
import ConfirmModal from "@/components/ui/ConfirmModal";
import AIModeBadge from "@/components/ui/AIModeBadge";
import Tooltip from "@/components/ui/Tooltip";
import { useAutosave } from "@/hooks/useAutosave";
import { PostDay, getPostDocId, GenerationMode } from "@/lib/types";
import { db, storage, functions } from "@/lib/firebase";
import { doc, updateDoc, deleteDoc, setDoc, getDoc, serverTimestamp, deleteField } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { useDropzone } from "react-dropzone";
import { normalizeHashtagsArray, appendGlobalHashtags, formatDisplayDate, isPastInDenver, getTodayInDenver } from "@/lib/utils";
import { randomTimeInWindow5Min } from "@/lib/postingTime";

interface GeneratePostCopyResponse {
  success: boolean;
  status: "generated" | "already_generated" | "error";
  message?: string;
}

interface PostDetailPanelProps {
  post: PostDay | null;
  workspaceId: string;
  imageUrl: string | null;
  isOpen: boolean;
  onClose: () => void;
  onDelete?: () => void;
  onDuplicate?: (targetDate: string) => void;
}

const statusSteps = [
  { key: "input", label: "Draft" },
  { key: "generated", label: "Generated" },
  { key: "edited", label: "Edited" },
  { key: "sent", label: "Sent" },
];

export default function PostDetailPanel({
  post,
  workspaceId,
  imageUrl: initialImageUrl,
  isOpen,
  onClose,
  onDelete,
  onDuplicate,
}: PostDetailPanelProps) {
  // Form state
  const [generationMode, setGenerationMode] = useState<GenerationMode>("image");
  const [guidanceText, setGuidanceText] = useState("");
  const [igCaption, setIgCaption] = useState("");
  const [igHashtags, setIgHashtags] = useState("");
  const [fbCaption, setFbCaption] = useState("");
  const [fbHashtags, setFbHashtags] = useState("");

  // Image state
  const [localImageUrl, setLocalImageUrl] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  // UI state
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [duplicateDate, setDuplicateDate] = useState("");
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<"idle" | "saving" | "saved">("idle");
  const [showImageLightbox, setShowImageLightbox] = useState(false);

  // Infer generation mode from post data
  const inferGenerationMode = (hasImage: boolean, hasGuidance: boolean): GenerationMode => {
    if (hasImage && hasGuidance) return "hybrid";
    if (hasImage) return "image";
    return "text";
  };

  // Autosave hook
  const { queueSave, isSaving, lastSavedAt } = useAutosave({
    debounceMs: 1000,
    onSave: async (data) => {
      if (!post || !workspaceId) return;
      const docId = getPostDocId(post);
      const docRef = doc(db, "workspaces", workspaceId, "post_days", docId);
      await updateDoc(docRef, {
        ...data,
        updatedAt: serverTimestamp(),
      });
    },
    onError: (error) => {
      console.error("Autosave error:", error);
    },
  });

  // Show save indicator
  useEffect(() => {
    if (isSaving) {
      setSaveIndicator("saving");
    } else if (lastSavedAt) {
      setSaveIndicator("saved");
      const timer = setTimeout(() => setSaveIndicator("idle"), 2000);
      return () => clearTimeout(timer);
    }
  }, [isSaving, lastSavedAt]);

  // Close lightbox on ESC
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && showImageLightbox) {
        setShowImageLightbox(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showImageLightbox]);

  // Initialize form when post changes
  useEffect(() => {
    if (!post) return;

    setGenerationMode(post.generationMode || inferGenerationMode(!!post.imageAssetId, !!post.starterText));
    setGuidanceText(post.starterText || "");
    setIgCaption(post.ai?.ig?.caption || "");
    setIgHashtags(post.ai?.ig?.hashtags?.join(", ") || "");
    setFbCaption(post.ai?.fb?.caption || "");
    setFbHashtags(post.ai?.fb?.hashtags?.join(", ") || "");
    setLocalImageUrl(initialImageUrl);
  }, [post, initialImageUrl]);

  // Handle field changes with autosave
  const handleFieldChange = useCallback(
    (field: string, value: unknown, nestedPath?: string) => {
      if (nestedPath) {
        queueSave({ [nestedPath]: value });
      } else {
        queueSave({ [field]: value });
      }
    },
    [queueSave]
  );

  // Image dropzone
  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0 || !post || !workspaceId) return;
      // Block image upload for past posts
      if (isPastInDenver(post.date)) return;

      const file = acceptedFiles[0];
      setLocalImageUrl(URL.createObjectURL(file));
      setIsUploadingImage(true);

      try {
        // Upload to storage
        const storagePath = `assets/${workspaceId}/${post.date}/${file.name}`;
        const storageRef = ref(storage, storagePath);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // Create asset document
        const assetId = crypto.randomUUID();
        await setDoc(doc(db, "workspaces", workspaceId, "assets", assetId), {
          id: assetId,
          storagePath,
          fileName: file.name,
          contentType: file.type,
          size: file.size,
          downloadUrl,
          createdAt: serverTimestamp(),
          workspaceId,
        });

        // Update post with new asset
        const docId = getPostDocId(post);
        await updateDoc(doc(db, "workspaces", workspaceId, "post_days", docId), {
          imageAssetId: assetId,
          imageUrl: downloadUrl,
          updatedAt: serverTimestamp(),
        });

        setLocalImageUrl(downloadUrl);
      } catch (err) {
        console.error("Image upload error:", err);
      } finally {
        setIsUploadingImage(false);
      }
    },
    [post, workspaceId]
  );

  const isImageUploadDisabled = isPastInDenver(post?.date || "");

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [] },
    multiple: false,
    useFsAccessApi: false,
    disabled: isImageUploadDisabled,
  });

  const handleRemoveImage = async () => {
    if (!post || !workspaceId) return;

    setLocalImageUrl(null);

    const docId = getPostDocId(post);
    await updateDoc(doc(db, "workspaces", workspaceId, "post_days", docId), {
      imageAssetId: deleteField(),
      imageUrl: deleteField(),
      updatedAt: serverTimestamp(),
    });
  };

  // Handle generation mode change
  const handleGenerationModeChange = (mode: GenerationMode) => {
    setGenerationMode(mode);
    handleFieldChange("generationMode", mode);
  };

  // Handle text field changes with autosave
  const handleGuidanceChange = (value: string) => {
    setGuidanceText(value);
    handleFieldChange("starterText", value || deleteField());
  };

  const handleIgCaptionChange = (value: string) => {
    setIgCaption(value);
    handleFieldChange("ai.ig.caption", value, "ai.ig.caption");
  };

  const handleIgHashtagsChange = (value: string) => {
    setIgHashtags(value);
    const parsed = appendGlobalHashtags(normalizeHashtagsArray(value.split(",")));
    handleFieldChange("ai.ig.hashtags", parsed, "ai.ig.hashtags");
  };

  const handleFbCaptionChange = (value: string) => {
    setFbCaption(value);
    handleFieldChange("ai.fb.caption", value, "ai.fb.caption");
  };

  const handleFbHashtagsChange = (value: string) => {
    setFbHashtags(value);
    const parsed = appendGlobalHashtags(normalizeHashtagsArray(value.split(",")));
    handleFieldChange("ai.fb.hashtags", parsed, "ai.fb.hashtags");
  };

  // Regenerate AI content
  const handleRegenerate = async () => {
    if (!post || !workspaceId) return;

    setIsRegenerating(true);

    const generatePostCopy = httpsCallable<
      {
        workspaceId: string;
        dateId: string;
        regenerate: boolean;
        generationMode?: GenerationMode;
        guidanceText?: string;
        previousOutputs?: {
          igCaption?: string;
          igHashtags?: string[];
          fbCaption?: string;
          fbHashtags?: string[];
        };
        requestId?: string;
      },
      GeneratePostCopyResponse
    >(functions, "generatePostCopy");

    try {
      const docId = getPostDocId(post);
      const result = await generatePostCopy({
        workspaceId,
        dateId: docId,
        regenerate: true,
        generationMode,
        guidanceText: guidanceText || undefined,
        previousOutputs: {
          igCaption: igCaption || undefined,
          igHashtags: igHashtags ? normalizeHashtagsArray(igHashtags.split(",")) : undefined,
          fbCaption: fbCaption || undefined,
          fbHashtags: fbHashtags ? normalizeHashtagsArray(fbHashtags.split(",")) : undefined,
        },
        requestId: crypto.randomUUID(),
      });

      if (result.data.status === "generated") {
        // Re-fetch the post to get new AI content
        const postRef = doc(db, "workspaces", workspaceId, "post_days", docId);
        const updatedPost = await getDoc(postRef);

        if (updatedPost.exists()) {
          const data = updatedPost.data();
          setIgCaption(data.ai?.ig?.caption || "");
          setIgHashtags(data.ai?.ig?.hashtags?.join(", ") || "");
          setFbCaption(data.ai?.fb?.caption || "");
          setFbHashtags(data.ai?.fb?.hashtags?.join(", ") || "");
        }
      }
    } catch (err) {
      console.error("Regenerate error:", err);
    } finally {
      setIsRegenerating(false);
    }
  };

  // Delete post
  const handleDelete = async () => {
    if (!post || !workspaceId) return;

    try {
      const docId = getPostDocId(post);
      await deleteDoc(doc(db, "workspaces", workspaceId, "post_days", docId));
      setShowDeleteConfirm(false);
      onClose();
      onDelete?.();
    } catch (err) {
      console.error("Delete error:", err);
    }
  };

  // Duplicate post
  const handleDuplicate = async () => {
    if (!post || !workspaceId || !duplicateDate) return;

    // Validate that target date is not in the past
    if (isPastInDenver(duplicateDate)) {
      alert("Cannot duplicate to a past date. Please select today or a future date.");
      return;
    }

    setIsDuplicating(true);

    try {
      const targetDocId = duplicateDate;
      const targetDocRef = doc(db, "workspaces", workspaceId, "post_days", targetDocId);
      const targetDoc = await getDoc(targetDocRef);

      if (targetDoc.exists()) {
        alert(`A post already exists on ${duplicateDate}. Choose a different date.`);
        setIsDuplicating(false);
        return;
      }

      const duplicatePostingTime = randomTimeInWindow5Min(duplicateDate, duplicateDate);
      const parsedIgHashtags = appendGlobalHashtags(normalizeHashtagsArray(igHashtags.split(",")));
      const parsedFbHashtags = appendGlobalHashtags(normalizeHashtagsArray(fbHashtags.split(",")));

      await setDoc(targetDocRef, {
        date: duplicateDate,
        generationMode,
        starterText: guidanceText || undefined,
        imageAssetId: post.imageAssetId,
        imageUrl: post.imageUrl,
        postingTime: duplicatePostingTime,
        postingTimeSource: "auto",
        ai: {
          ig: { caption: igCaption, hashtags: parsedIgHashtags },
          fb: { caption: fbCaption, hashtags: parsedFbHashtags },
          meta: post.ai?.meta,
        },
        status: "edited",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      setShowDuplicateModal(false);
      setDuplicateDate("");
      onDuplicate?.(duplicateDate);
    } catch (err) {
      console.error("Duplicate error:", err);
    } finally {
      setIsDuplicating(false);
    }
  };

  if (!post) return null;

  const currentStatusIndex = statusSteps.findIndex((s) => s.key === post.status);
  const isPastPost = isPastInDenver(post.date);

  return (
    <>
      <SlidePanel
        isOpen={isOpen}
        onClose={onClose}
        title={formatDisplayDate(post.date)}
        width="lg"
      >
        <div className="flex flex-col h-full">
          {/* Past date warning banner */}
          {isPastPost && (
            <div className="px-6 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium">This date has passed</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    Posts cannot be scheduled in the past. Image uploads are disabled.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Save indicator & AI mode badge */}
          <div className="px-6 py-2 border-b border-[var(--border-secondary)] flex items-center justify-between text-xs">
            <span className="text-[var(--text-tertiary)]">
              {saveIndicator === "saving" && (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Saving...
                </span>
              )}
              {saveIndicator === "saved" && (
                <span className="flex items-center gap-1.5 text-[var(--status-success)]">
                  <Check className="w-3 h-3" />
                  Saved
                </span>
              )}
              {saveIndicator === "idle" && "Changes save automatically"}
            </span>
            <AIModeBadge mode={generationMode} size="sm" />
          </div>

          <div className="flex-1 overflow-y-auto">
            {/* Image section */}
            <div className="p-6 border-b border-[var(--border-secondary)]">
              {localImageUrl ? (
                <div className="space-y-3">
                  <div
                    className="relative aspect-video bg-[var(--bg-tertiary)] rounded-lg overflow-hidden cursor-pointer group"
                    onClick={() => setShowImageLightbox(true)}
                  >
                    <Image
                      src={localImageUrl}
                      alt="Post image"
                      fill
                      className="object-contain"
                      sizes="500px"
                    />
                    {isUploadingImage && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white animate-spin" />
                      </div>
                    )}
                    {/* Zoom indicator on hover */}
                    {!isUploadingImage && (
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/50 rounded-full p-2">
                          <ZoomIn className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Image action buttons - disabled for past posts */}
                  {!isPastPost ? (
                    <div className="flex gap-2">
                      <div {...getRootProps()} className="flex-1">
                        <input {...getInputProps()} />
                        <button
                          type="button"
                          disabled={isUploadingImage}
                          className="w-full px-3 py-2 text-sm font-medium text-[var(--text-secondary)] bg-[var(--bg-tertiary)] hover:bg-[var(--bg-card-hover)] rounded-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          <Upload className="w-4 h-4" />
                          Replace
                        </button>
                      </div>
                      <button
                        onClick={handleRemoveImage}
                        disabled={isUploadingImage}
                        className="px-3 py-2 text-sm font-medium text-[var(--status-error)] hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Image changes disabled for past dates</span>
                    </div>
                  )}
                </div>
              ) : isPastPost ? (
                /* Disabled upload for past posts */
                <div className="aspect-video rounded-lg border-2 border-dashed border-[var(--border-primary)] bg-[var(--bg-tertiary)] flex items-center justify-center cursor-not-allowed opacity-60">
                  <div className="text-center">
                    <Lock className="mx-auto mb-2 text-[var(--text-muted)]" size={32} />
                    <p className="text-sm text-[var(--text-muted)]">Image upload disabled for past dates</p>
                  </div>
                </div>
              ) : (
                <div
                  {...getRootProps()}
                  className={`
                    aspect-video rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-colors
                    ${isDragActive ? "border-[var(--accent-primary)] bg-[var(--accent-bg)]" : "border-[var(--border-primary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)]"}
                  `}
                >
                  <input {...getInputProps()} />
                  <div className="text-center">
                    <Upload className="mx-auto mb-2 text-[var(--text-tertiary)]" size={32} />
                    <p className="text-sm text-[var(--text-secondary)]">Drop an image or click to upload</p>
                  </div>
                </div>
              )}
            </div>

            {/* Generation Mode */}
            <div className="p-6 border-b border-[var(--border-secondary)]">
              <div className="flex items-center justify-between mb-3">
                <label className="micro-label">Generation Mode</label>
                <Tooltip content="Image mode works best for visually striking content. Hybrid mode lets you add context the AI can't see. Text mode is for posts without images.">
                  <span className="flex items-center gap-1 text-[10px] text-[var(--text-tertiary)] cursor-help">
                    <Info className="w-3 h-3" />
                    Best practice tip
                  </span>
                </Tooltip>
              </div>
              <div className="flex rounded-lg border border-[var(--border-primary)] overflow-hidden">
                {[
                  { value: "image" as GenerationMode, label: "Image" },
                  { value: "hybrid" as GenerationMode, label: "Hybrid" },
                  { value: "text" as GenerationMode, label: "Text" },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleGenerationModeChange(option.value)}
                    className={`
                      flex-1 px-3 py-2 text-sm font-medium transition-colors
                      ${generationMode === option.value
                        ? "bg-[var(--accent-primary)] text-white"
                        : "bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]"
                      }
                    `}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                {generationMode === "image" && "AI analyzes the image to generate captions."}
                {generationMode === "hybrid" && "AI uses both image and guidance text."}
                {generationMode === "text" && "AI uses only your guidance text."}
              </p>
            </div>

            {/* Guidance Text */}
            {(generationMode === "hybrid" || generationMode === "text") && (
              <div className="p-6 border-b border-[var(--border-secondary)]">
                <label className="micro-label block mb-2">Guidance Text</label>
                <textarea
                  value={guidanceText}
                  onChange={(e) => handleGuidanceChange(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--input-focus-ring)] focus:border-[var(--input-focus-ring)] resize-none"
                  placeholder="Add context to guide the AI..."
                />
              </div>
            )}

            {/* Status Stepper */}
            <div className="p-6 border-b border-[var(--border-secondary)]">
              <label className="micro-label block mb-3">Status</label>
              <div className="flex items-center gap-2">
                {statusSteps.map((step, index) => {
                  const isActive = index <= currentStatusIndex;
                  const isCurrent = step.key === post.status;
                  return (
                    <div key={step.key} className="flex items-center gap-2">
                      <div
                        className={`
                          w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium
                          ${isCurrent ? "bg-[var(--accent-primary)] text-white" : ""}
                          ${isActive && !isCurrent ? "bg-[var(--status-success)] text-white" : ""}
                          ${!isActive ? "bg-[var(--bg-tertiary)] text-[var(--text-muted)]" : ""}
                        `}
                      >
                        {isActive && !isCurrent ? <Check className="w-3 h-3" /> : index + 1}
                      </div>
                      <span
                        className={`text-xs ${isCurrent ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-tertiary)]"}`}
                      >
                        {step.label}
                      </span>
                      {index < statusSteps.length - 1 && (
                        <div className={`w-8 h-0.5 ${isActive ? "bg-[var(--status-success)]" : "bg-[var(--bg-tertiary)]"}`} />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Regenerate AI */}
            <div className="p-6 border-b border-[var(--border-secondary)]">
              <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 rounded-lg">
                <div>
                  <h3 className="text-sm font-medium text-purple-900 dark:text-purple-200">Regenerate AI</h3>
                  <p className="text-xs text-purple-600 dark:text-purple-400">Generate new captions</p>
                </div>
                <button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || (generationMode === "text" && !guidanceText.trim())}
                  className="px-3 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-md transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isRegenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {isRegenerating ? "Generating..." : "Regenerate"}
                </button>
              </div>
            </div>

            {/* Instagram Section */}
            <div className="p-6 border-b border-[var(--border-secondary)]">
              <div className="flex items-center gap-2 mb-4">
                <Instagram className="w-4 h-4 text-pink-500" />
                <span className="micro-label">Instagram</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Caption</label>
                  <textarea
                    value={igCaption}
                    onChange={(e) => handleIgCaptionChange(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--input-focus-ring)] resize-none"
                    placeholder="Instagram caption..."
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Hashtags</label>
                  <input
                    type="text"
                    value={igHashtags}
                    onChange={(e) => handleIgHashtagsChange(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--input-focus-ring)]"
                    placeholder="#tag1, #tag2, #tag3"
                  />
                </div>
              </div>
            </div>

            {/* Facebook Section */}
            <div className="p-6 border-b border-[var(--border-secondary)]">
              <div className="flex items-center gap-2 mb-4">
                <Facebook className="w-4 h-4 text-blue-500" />
                <span className="micro-label">Facebook</span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Caption</label>
                  <textarea
                    value={fbCaption}
                    onChange={(e) => handleFbCaptionChange(e.target.value)}
                    rows={4}
                    className="w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--input-focus-ring)] resize-none"
                    placeholder="Facebook caption..."
                  />
                </div>
                <div>
                  <label className="text-xs text-[var(--text-tertiary)] mb-1 block">Hashtags</label>
                  <input
                    type="text"
                    value={fbHashtags}
                    onChange={(e) => handleFbHashtagsChange(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:ring-1 focus:ring-[var(--input-focus-ring)]"
                    placeholder="#tag1, #tag2, #tag3"
                  />
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="p-6">
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-[var(--status-error)] hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
                <button
                  onClick={() => setShowDuplicateModal(true)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] rounded-md transition-colors flex items-center justify-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                  Duplicate
                </button>
              </div>
            </div>
          </div>
        </div>
      </SlidePanel>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        open={showDeleteConfirm}
        title="Delete Post?"
        description={`Are you sure you want to delete the post for ${formatDisplayDate(post.date)}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        confirmVariant="danger"
      />

      {/* Duplicate Modal */}
      {showDuplicateModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--bg-secondary)] rounded-xl shadow-lg max-w-sm w-full mx-4 overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-primary)]">
              <h3 className="font-medium text-[var(--text-primary)]">Duplicate Post</h3>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-[var(--text-secondary)] mb-3">
                Select a date for the duplicate:
              </p>
              <input
                type="date"
                value={duplicateDate}
                min={getTodayInDenver()}
                onChange={(e) => setDuplicateDate(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--input-border)] bg-[var(--input-bg)] rounded-lg text-sm"
              />
              <p className="text-xs text-[var(--text-tertiary)] mt-2">
                Only today and future dates can be selected
              </p>
            </div>
            <div className="px-5 py-4 bg-[var(--bg-primary)] flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDuplicateModal(false);
                  setDuplicateDate("");
                }}
                className="px-4 py-2 text-sm font-medium text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={handleDuplicate}
                disabled={!duplicateDate || isDuplicating}
                className="px-4 py-2 text-sm font-medium bg-[var(--accent-primary)] text-white rounded-md disabled:opacity-50 flex items-center gap-2"
              >
                {isDuplicating && <Loader2 className="w-4 h-4 animate-spin" />}
                Duplicate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {showImageLightbox && localImageUrl && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90"
          onClick={() => setShowImageLightbox(false)}
        >
          {/* Close button */}
          <button
            onClick={() => setShowImageLightbox(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label="Close"
          >
            <X className="w-6 h-6 text-white" />
          </button>

          {/* Image container */}
          <div
            className="relative max-w-[90vw] max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <Image
              src={localImageUrl}
              alt="Post image"
              width={1200}
              height={1200}
              className="max-w-full max-h-[90vh] object-contain"
              priority
            />
          </div>

          {/* Keyboard hint */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/50 text-xs">
            Press ESC or click anywhere to close
          </div>
        </div>
      )}
    </>
  );
}
