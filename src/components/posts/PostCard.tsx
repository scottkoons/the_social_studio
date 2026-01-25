"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Instagram, Facebook, Edit2, Image as ImageIcon, FileText, Layers } from "lucide-react";
import StatusDot from "@/components/ui/StatusDot";
import Tooltip from "@/components/ui/Tooltip";
import { PostDay, getPostDocId } from "@/lib/types";
import { formatTimeForDisplay } from "@/lib/postingTime";
import { db, storage } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { ref, getDownloadURL } from "firebase/storage";

interface PostCardProps {
  post: PostDay;
  workspaceId: string;
  isSelected: boolean;
  onSelect: (docId: string, selected: boolean) => void;
  onClick: () => void;
  variant?: "calendar" | "list";
  showDate?: boolean;
  // Drag-and-drop props
  draggable?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

// Map post status to StatusDot status
function getStatusDotStatus(status: PostDay["status"]): "draft" | "generated" | "edited" | "sent" | "error" {
  switch (status) {
    case "input":
      return "draft";
    case "generated":
      return "generated";
    case "edited":
      return "edited";
    case "sent":
      return "sent";
    case "error":
      return "error";
    default:
      return "draft";
  }
}

export default function PostCard({
  post,
  workspaceId,
  isSelected,
  onSelect,
  onClick,
  variant = "calendar",
  showDate = false,
  draggable = false,
  onDragStart,
  onDragEnd,
}: PostCardProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const docId = getPostDocId(post);

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", docId);
    onDragStart?.();
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  // Fetch image URL
  useEffect(() => {
    if (!post.imageAssetId || !workspaceId) {
      setImageUrl(null);
      return;
    }

    const fetchImage = async () => {
      try {
        // First check if post has direct imageUrl
        if (post.imageUrl) {
          setImageUrl(post.imageUrl);
          return;
        }

        // Otherwise fetch from assets
        if (!post.imageAssetId) return;
        const assetRef = doc(db, "workspaces", workspaceId, "assets", post.imageAssetId);
        const assetSnap = await getDoc(assetRef);
        if (assetSnap.exists()) {
          const asset = assetSnap.data();
          if (asset.downloadUrl) {
            setImageUrl(asset.downloadUrl);
          } else if (asset.storagePath) {
            const url = await getDownloadURL(ref(storage, asset.storagePath));
            setImageUrl(url);
          }
        }
      } catch (err) {
        console.error("Error fetching image:", err);
      }
    };

    fetchImage();
  }, [post.imageAssetId, post.imageUrl, workspaceId]);

  // Get preview text (first line of IG caption or starter text)
  const previewText = post.ai?.ig?.caption?.split("\n")[0] || post.starterText || "";

  if (variant === "list") {
    return (
      <div
        className={`
          group flex items-center gap-4 px-4 py-3 border-b border-[var(--border-secondary)]
          hover:bg-[var(--table-row-hover)] cursor-pointer transition-colors
          ${isSelected ? "bg-[var(--table-row-selected)]" : ""}
          ${draggable ? "cursor-grab active:cursor-grabbing" : ""}
          ${isDragging ? "opacity-50" : ""}
        `}
        onClick={onClick}
        draggable={draggable}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        {/* Checkbox */}
        <div className={`opacity-0 group-hover:opacity-100 ${isSelected ? "opacity-100" : ""} transition-opacity`}>
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(docId, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-[var(--border-primary)] text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer bg-[var(--input-bg)]"
          />
        </div>

        {/* Thumbnail */}
        <div className="relative w-12 h-12 rounded-md overflow-hidden bg-[var(--bg-tertiary)] flex-shrink-0">
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt=""
              fill
              className="object-cover"
              sizes="48px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[var(--text-muted)]">
              <span className="text-xs">No img</span>
            </div>
          )}
        </div>

        {/* Date & Time */}
        <div className="w-28 flex-shrink-0">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            {new Date(post.date + "T12:00:00").toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </div>
          <div className="text-xs text-[var(--text-tertiary)]">
            {formatTimeForDisplay(post.postingTimeIg || post.postingTime || "12:00")}
          </div>
        </div>

        {/* Preview text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[var(--text-secondary)] truncate">
            {previewText || <span className="text-[var(--text-muted)] italic">No content yet</span>}
          </p>
        </div>

        {/* AI Mode */}
        {post.generationMode && (
          <Tooltip
            content={
              post.generationMode === "image" ? "AI analyzes image" :
              post.generationMode === "hybrid" ? "AI uses image + text" :
              "AI uses guidance text"
            }
          >
            <span className="flex items-center gap-1 cursor-help flex-shrink-0">
              {post.generationMode === "image" && <ImageIcon className="w-4 h-4 text-blue-500" />}
              {post.generationMode === "hybrid" && <Layers className="w-4 h-4 text-purple-500" />}
              {post.generationMode === "text" && <FileText className="w-4 h-4 text-emerald-500" />}
            </span>
          </Tooltip>
        )}

        {/* Platforms */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {(!post.platform || post.platform === "instagram") && (
            <Instagram className="w-4 h-4 text-[var(--text-muted)]" />
          )}
          {(!post.platform || post.platform === "facebook") && (
            <Facebook className="w-4 h-4 text-[var(--text-muted)]" />
          )}
        </div>

        {/* Status */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDot status={getStatusDotStatus(post.status)} size="md" />
          <span className="text-xs text-[var(--text-tertiary)] capitalize">{post.status}</span>
        </div>

        {/* Edit button */}
        <button
          className="p-2 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)] opacity-0 group-hover:opacity-100 transition-all"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // Calendar variant - image-dominant card
  return (
    <div
      className={`
        group relative rounded-lg overflow-hidden cursor-pointer transition-all
        border border-[var(--border-primary)] hover:border-[var(--border-primary-hover)]
        ${isSelected ? "ring-2 ring-[var(--accent-primary)]" : ""}
        ${draggable ? "cursor-grab active:cursor-grabbing" : ""}
        ${isDragging ? "opacity-50 scale-95" : ""}
      `}
      onClick={onClick}
      draggable={draggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Image container - 70% of card */}
      <div className="relative aspect-[4/3] bg-[var(--bg-tertiary)]">
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt=""
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 200px"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <span className="text-xs text-[var(--text-muted)]">No image</span>
          </div>
        )}

        {/* Status dot in corner */}
        <div className="absolute top-2 right-2">
          <StatusDot status={getStatusDotStatus(post.status)} size="lg" />
        </div>

        {/* Checkbox - appears on hover or when selected */}
        <div
          className={`
            absolute top-2 left-2 opacity-0 group-hover:opacity-100
            ${isSelected ? "opacity-100" : ""}
            transition-opacity
          `}
        >
          <input
            type="checkbox"
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(docId, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-5 w-5 rounded border-2 border-white/80 bg-black/20 text-[var(--accent-primary)] focus:ring-[var(--accent-primary)] cursor-pointer backdrop-blur-sm"
          />
        </div>

        {/* Edit button - appears on hover */}
        <button
          className="absolute bottom-2 right-2 p-1.5 rounded-md bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/70"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
        >
          <Edit2 className="w-4 h-4" />
        </button>
      </div>

      {/* Info bar */}
      <div className="px-2 py-1.5 bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between gap-2">
          {/* Time with tooltip */}
          <Tooltip content="Posting time optimized for your industry">
            <span className="text-xs text-[var(--text-secondary)] cursor-help">
              {formatTimeForDisplay(post.postingTimeIg || post.postingTime || "12:00")}
            </span>
          </Tooltip>

          {/* Mode + Platform icons */}
          <div className="flex items-center gap-1.5">
            {/* AI Mode indicator */}
            {post.generationMode && (
              <Tooltip
                content={
                  post.generationMode === "image" ? "AI analyzes image" :
                  post.generationMode === "hybrid" ? "AI uses image + text" :
                  "AI uses guidance text"
                }
              >
                <span className="cursor-help">
                  {post.generationMode === "image" && <ImageIcon className="w-3 h-3 text-blue-500" />}
                  {post.generationMode === "hybrid" && <Layers className="w-3 h-3 text-purple-500" />}
                  {post.generationMode === "text" && <FileText className="w-3 h-3 text-emerald-500" />}
                </span>
              </Tooltip>
            )}
            {(!post.platform || post.platform === "instagram") && (
              <Instagram className="w-3 h-3 text-[var(--text-muted)]" />
            )}
            {(!post.platform || post.platform === "facebook") && (
              <Facebook className="w-3 h-3 text-[var(--text-muted)]" />
            )}
          </div>
        </div>

        {/* Date if showing */}
        {showDate && (
          <div className="text-[10px] text-[var(--text-tertiary)] mt-0.5">
            {new Date(post.date + "T12:00:00").toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </div>
    </div>
  );
}
