"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/context/AuthContext";
import { PostDay, getPostDocId } from "@/lib/types";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Image as ImageIcon, X, Upload, Maximize2, Link, Loader2 } from "lucide-react";
import Image from "next/image";
import ImagePreviewModal from "./ui/ImagePreviewModal";
import { optimizeImage, optimizeImageFromBase64 } from "@/lib/imageOptimizer";

interface ImageUploadProps {
    post: PostDay;
    onUploadStart: () => void;
    onUploadEnd: () => void;
}

type UploadPhase = "compressing" | "uploading" | null;

interface FileSizes {
    original: number;
    compressed: number;
}

function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ImageUpload({ post, onUploadStart, onUploadEnd }: ImageUploadProps) {
    const { user, workspaceId } = useAuth();
    const [asset, setAsset] = useState<any>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [showUrlInput, setShowUrlInput] = useState(false);
    const [urlValue, setUrlValue] = useState("");
    const [isLoadingUrl, setIsLoadingUrl] = useState(false);
    const [urlError, setUrlError] = useState<string | null>(null);
    const [uploadPhase, setUploadPhase] = useState<UploadPhase>(null);
    const [fileSizes, setFileSizes] = useState<FileSizes | null>(null);

    useEffect(() => {
        const fetchAsset = async () => {
            if (post.imageAssetId && user && workspaceId) {
                const assetRef = doc(db, "workspaces", workspaceId, "assets", post.imageAssetId);
                const assetSnap = await getDoc(assetRef);
                if (assetSnap.exists()) {
                    setAsset(assetSnap.data());
                }
            } else {
                setAsset(null);
            }
        };
        fetchAsset();
    }, [post.imageAssetId, user, workspaceId]);

    const onDrop = useCallback(async (acceptedFiles: File[]) => {
        if (!user || !workspaceId || acceptedFiles.length === 0) return;

        const file = acceptedFiles[0];
        onUploadStart();
        setFileSizes(null);
        setUploadPhase("compressing");

        try {
            // Optimize image: resize and convert to WebP
            const optimized = await optimizeImage(file, file.name);
            setFileSizes({ original: file.size, compressed: optimized.blob.size });
            setUploadPhase("uploading");

            // Storage path: assets/{workspaceId}/{YYYY-MM-DD}/{optimizedFilename}
            const storagePath = `assets/${workspaceId}/${post.date}/${optimized.fileName}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, optimized.blob);

            // Create asset doc under workspace
            const assetId = crypto.randomUUID();
            const assetData = {
                id: assetId,
                storagePath,
                fileName: optimized.fileName,
                contentType: "image/webp",
                size: optimized.blob.size,
                createdAt: serverTimestamp(),
                workspaceId: workspaceId,
            };

            await setDoc(doc(db, "workspaces", workspaceId, "assets", assetId), assetData);

            // Get the doc ID for this post
            const docId = getPostDocId(post);

            // Link asset to post_day
            await updateDoc(doc(db, "workspaces", workspaceId, "post_days", docId), {
                imageAssetId: assetId,
                updatedAt: serverTimestamp(),
            });

            setAsset(assetData);
        } catch (error) {
            console.error("Upload error:", error);
            alert("Failed to upload image.");
        } finally {
            setUploadPhase(null);
            setFileSizes(null);
            onUploadEnd();
        }
    }, [user, workspaceId, post, onUploadStart, onUploadEnd]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false,
        useFsAccessApi: false,
    });

    const handleUrlSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !workspaceId || !urlValue.trim()) return;

        setIsLoadingUrl(true);
        setUrlError(null);
        onUploadStart();
        setFileSizes(null);
        setUploadPhase("compressing");

        try {
            // Use our API route to proxy the image fetch (avoids CORS)
            const proxyResponse = await fetch("/api/proxy-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: urlValue.trim() }),
            });

            const proxyData = await proxyResponse.json();

            if (!proxyResponse.ok) {
                throw new Error(proxyData.error || "Failed to fetch image");
            }

            // Optimize image: resize and convert to WebP
            const optimized = await optimizeImageFromBase64(
                proxyData.base64,
                proxyData.contentType,
                proxyData.fileName
            );
            setFileSizes({ original: proxyData.size, compressed: optimized.blob.size });
            setUploadPhase("uploading");

            // Storage path: assets/{workspaceId}/{YYYY-MM-DD}/{optimizedFilename}
            const storagePath = `assets/${workspaceId}/${post.date}/${optimized.fileName}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, optimized.blob);

            // Create asset doc under workspace
            const assetId = crypto.randomUUID();
            const assetData = {
                id: assetId,
                storagePath,
                fileName: optimized.fileName,
                contentType: "image/webp",
                size: optimized.blob.size,
                sourceUrl: urlValue.trim(),
                createdAt: serverTimestamp(),
                workspaceId: workspaceId,
            };

            await setDoc(doc(db, "workspaces", workspaceId, "assets", assetId), assetData);

            // Get the doc ID for this post
            const docId = getPostDocId(post);

            // Link asset to post_day
            await updateDoc(doc(db, "workspaces", workspaceId, "post_days", docId), {
                imageAssetId: assetId,
                updatedAt: serverTimestamp(),
            });

            setAsset(assetData);
            setShowUrlInput(false);
            setUrlValue("");
        } catch (error) {
            console.error("URL fetch error:", error);
            setUrlError(error instanceof Error ? error.message : "Failed to load image from URL");
        } finally {
            setUploadPhase(null);
            setFileSizes(null);
            setIsLoadingUrl(false);
            onUploadEnd();
        }
    };

    const removeImage = async (e: React.MouseEvent) => {
        if (!user || !workspaceId) return;
        e.stopPropagation();
        onUploadStart();
        try {
            // Get the doc ID for this post
            const docId = getPostDocId(post);

            await updateDoc(doc(db, "workspaces", workspaceId, "post_days", docId), {
                imageAssetId: null,
                updatedAt: serverTimestamp(),
            });

            setAsset(null);
        } catch (error) {
            console.error("Remove error:", error);
        } finally {
            onUploadEnd();
        }
    };

    // Show upload progress state (takes priority over everything)
    if (uploadPhase) {
        const savings = fileSizes
            ? Math.round((1 - fileSizes.compressed / fileSizes.original) * 100)
            : 0;

        return (
            <div className="flex flex-col gap-1.5 h-16 w-44 rounded-lg border border-[var(--accent-primary)] bg-[var(--accent-bg)] px-3 py-2 justify-center">
                <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-[var(--accent-primary)] shrink-0" />
                    <span className="text-[10px] font-medium text-[var(--accent-primary)]">
                        {uploadPhase === "compressing" ? "Compressing..." : "Uploading..."}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-1.5 bg-[var(--border-primary)] rounded-full overflow-hidden">
                    <div
                        className={`h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300 ${
                            uploadPhase === "compressing" ? "w-1/2" : "w-full"
                        }`}
                    />
                </div>

                {/* File size info */}
                {fileSizes && uploadPhase === "uploading" && (
                    <div className="flex items-center justify-between text-[8px]">
                        <span className="text-[var(--text-muted)] line-through">
                            {formatFileSize(fileSizes.original)}
                        </span>
                        <span className="text-[var(--accent-primary)] font-medium">
                            {formatFileSize(fileSizes.compressed)} (-{savings}%)
                        </span>
                    </div>
                )}

                {uploadPhase === "compressing" && (
                    <span className="text-[8px] text-[var(--text-muted)]">
                        Converting to WebP...
                    </span>
                )}
            </div>
        );
    }

    // Image preview with asset
    if (asset) {
        return (
            <>
                <div className="relative h-16 w-28 bg-[var(--bg-tertiary)] rounded-lg overflow-hidden group/img border border-[var(--border-primary)]">
                    {/* Fallback icon while loading */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <ImageIcon className="text-[var(--text-muted)]" size={20} />
                    </div>

                    {/* Actual image with object-contain to preserve aspect ratio */}
                    <AssetPreview storagePath={asset.storagePath} onUrlLoaded={setPreviewUrl} />

                    {/* Hover overlay with buttons */}
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                        {previewUrl && (
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setShowPreviewModal(true);
                                }}
                                className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
                                title="View full image"
                            >
                                <Maximize2 size={14} />
                            </button>
                        )}
                        <button
                            onClick={removeImage}
                            className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
                            title="Remove image"
                        >
                            <X size={14} />
                        </button>
                    </div>

                    {/* Filename badge */}
                    <div className="absolute bottom-0.5 right-0.5 bg-[var(--bg-card)]/90 px-1 py-0.5 rounded text-[8px] font-medium text-[var(--text-secondary)] max-w-[100px] truncate">
                        {asset.fileName}
                    </div>
                </div>

                {/* Preview modal */}
                {previewUrl && (
                    <ImagePreviewModal
                        isOpen={showPreviewModal}
                        onClose={() => setShowPreviewModal(false)}
                        imageUrl={previewUrl}
                        title={`${post.date} - ${asset.fileName}`}
                    />
                )}
            </>
        );
    }

    // URL input form
    if (showUrlInput) {
        return (
            <div className="flex flex-col gap-1.5 w-48">
                <form onSubmit={handleUrlSubmit} className="flex gap-1">
                    <input
                        type="url"
                        value={urlValue}
                        onChange={(e) => setUrlValue(e.target.value)}
                        placeholder="Paste image URL..."
                        className="flex-1 px-2 py-1.5 text-xs border border-[var(--border-primary)] rounded-lg bg-[var(--input-bg)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-primary)]"
                        autoFocus
                        disabled={isLoadingUrl}
                    />
                    <button
                        type="submit"
                        disabled={!urlValue.trim() || isLoadingUrl}
                        className="px-2 py-1.5 text-xs font-medium bg-[var(--accent-primary)] text-white rounded-lg hover:bg-[var(--accent-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoadingUrl ? <Loader2 size={12} className="animate-spin" /> : "Add"}
                    </button>
                </form>
                <div className="flex items-center justify-between">
                    {urlError && (
                        <span className="text-[9px] text-[var(--status-error)]">{urlError}</span>
                    )}
                    <button
                        type="button"
                        onClick={() => {
                            setShowUrlInput(false);
                            setUrlValue("");
                            setUrlError(null);
                        }}
                        className="text-[9px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] ml-auto"
                    >
                        Cancel
                    </button>
                </div>
            </div>
        );
    }

    // Upload dropzone with URL option
    return (
        <div className="flex items-center gap-1.5">
            <div
                {...getRootProps()}
                className={`
                    relative h-16 w-24 rounded-lg border-2 border-dashed transition-all cursor-pointer
                    flex flex-col items-center justify-center text-center
                    ${isDragActive
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-bg)] text-[var(--accent-primary)]'
                        : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)]'
                    }
                `}
            >
                <input {...getInputProps()} />
                <Upload size={14} className="mb-0.5" />
                <p className="text-[8px] font-medium leading-tight">
                    {isDragActive ? "Drop!" : "Upload"}
                </p>
            </div>
            <button
                type="button"
                onClick={() => setShowUrlInput(true)}
                className="h-16 w-10 rounded-lg border-2 border-dashed border-[var(--border-primary)] text-[var(--text-tertiary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)] hover:text-[var(--accent-primary)] transition-all flex flex-col items-center justify-center"
                title="Add image from URL"
            >
                <Link size={14} className="mb-0.5" />
                <p className="text-[8px] font-medium">URL</p>
            </button>
        </div>
    );
}

interface AssetPreviewProps {
    storagePath: string;
    onUrlLoaded?: (url: string) => void;
}

function AssetPreview({ storagePath, onUrlLoaded }: AssetPreviewProps) {
    const [url, setUrl] = useState<string | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        const getUrl = async () => {
            try {
                const downloadUrl = await getDownloadURL(ref(storage, storagePath));
                setUrl(downloadUrl);
                onUrlLoaded?.(downloadUrl);
            } catch (err) {
                console.error("Preview error:", err);
                setError(true);
            }
        };
        getUrl();
    }, [storagePath, onUrlLoaded]);

    if (error || !url) return null;

    return (
        <Image
            src={url}
            alt="Preview"
            fill
            className="object-contain"
            sizes="112px"
        />
    );
}
