"use client";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import { useAuth } from "@/context/AuthContext";
import { PostDay, getPostDocId } from "@/lib/types";
import { storage, db } from "@/lib/firebase";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { doc, setDoc, updateDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { Image as ImageIcon, X, Upload, Maximize2 } from "lucide-react";
import Image from "next/image";
import ImagePreviewModal from "./ui/ImagePreviewModal";

interface ImageUploadProps {
    post: PostDay;
    onUploadStart: () => void;
    onUploadEnd: () => void;
}

export default function ImageUpload({ post, onUploadStart, onUploadEnd }: ImageUploadProps) {
    const { user, workspaceId } = useAuth();
    const [asset, setAsset] = useState<any>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [showPreviewModal, setShowPreviewModal] = useState(false);

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

        try {
            // Storage path: assets/{workspaceId}/{YYYY-MM-DD}/{originalFilename}
            const storagePath = `assets/${workspaceId}/${post.date}/${file.name}`;
            const storageRef = ref(storage, storagePath);

            await uploadBytes(storageRef, file);

            // Create asset doc under workspace
            const assetId = crypto.randomUUID();
            const assetData = {
                id: assetId,
                storagePath,
                fileName: file.name,
                contentType: file.type,
                size: file.size,
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
            onUploadEnd();
        }
    }, [user, workspaceId, post, onUploadStart, onUploadEnd]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'image/*': [] },
        multiple: false,
        useFsAccessApi: false,
    });

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

    // Upload dropzone
    return (
        <div
            {...getRootProps()}
            className={`
                relative h-16 w-28 rounded-lg border-2 border-dashed transition-all cursor-pointer
                flex flex-col items-center justify-center text-center
                ${isDragActive
                    ? 'border-[var(--accent-primary)] bg-[var(--accent-bg)] text-[var(--accent-primary)]'
                    : 'border-[var(--border-primary)] text-[var(--text-tertiary)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-tertiary)]'
                }
            `}
        >
            <input {...getInputProps()} />
            <Upload size={16} className="mb-1" />
            <p className="text-[9px] font-medium leading-tight">
                {isDragActive ? "Drop it!" : "Drop or click"}
            </p>
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
