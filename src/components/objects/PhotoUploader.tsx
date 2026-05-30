import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { storageConfig } from "@/lib/config";
import type { PhotoRecord } from "@/types/objects";

interface PhotoUploaderProps {
  objectId: string;
  currentCount: number;
  onUploadComplete: (photo: PhotoRecord) => void;
  onError: (message: string) => void;
}

interface FileUploadState {
  id: string;
  name: string;
  progress: number;
}

export default function PhotoUploader({ objectId, currentCount, onUploadComplete, onError }: PhotoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<FileUploadState[]>([]);

  if (currentCount >= storageConfig.maxPhotosPerObject) {
    return null;
  }

  function validateFile(file: File): string | null {
    if (!(storageConfig.allowedPhotoMimeTypes as readonly string[]).includes(file.type)) {
      return `${file.name}: only JPEG, PNG, and WebP files are allowed`;
    }
    if (file.size > storageConfig.maxSinglePhotoBytes) {
      return `${file.name}: file exceeds 10 MB limit`;
    }
    return null;
  }

  async function uploadFile(file: File) {
    const uploadId = crypto.randomUUID();

    setUploads((prev) => [...prev, { id: uploadId, name: file.name, progress: 0 }]);

    const updateProgress = (progress: number) => {
      setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress } : u)));
    };

    const removeFromState = () => {
      setUploads((prev) => prev.filter((u) => u.id !== uploadId));
    };

    try {
      const urlRes = await fetch(`/api/objects/${objectId}/photos/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });

      if (urlRes.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      const urlData = (await urlRes.json()) as { signedUrl?: string; path?: string; error?: string };

      if (!urlRes.ok || !urlData.signedUrl || !urlData.path) {
        onError(urlData.error ?? `Failed to get upload URL for ${file.name}`);
        removeFromState();
        return;
      }

      const signedUrl = urlData.signedUrl;
      const storagePath = urlData.path;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            updateProgress(Math.round((e.loaded / e.total) * 90));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Storage upload failed: ${xhr.status}`));
          }
        };
        xhr.onerror = () => {
          reject(new Error("Network error during upload"));
        };
        xhr.open("PUT", signedUrl);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      updateProgress(95);

      const confirmRes = await fetch(`/api/objects/${objectId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: storagePath, fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });

      const confirmData = (await confirmRes.json()) as { photo?: PhotoRecord; error?: string };

      if (!confirmRes.ok || !confirmData.photo) {
        onError(confirmData.error ?? `Failed to confirm upload for ${file.name}`);
        removeFromState();
        return;
      }

      updateProgress(100);
      setTimeout(() => {
        removeFromState();
      }, 1000);
      onUploadComplete(confirmData.photo);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      onError(`${file.name}: ${message}`);
      removeFromState();
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const file of Array.from(files)) {
      const validationError = validateFile(file);
      if (validationError) {
        onError(validationError);
        continue;
      }
      void uploadFile(file);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors ${
          dragging ? "border-purple-400 bg-purple-500/10" : "border-white/20 hover:border-white/40"
        }`}
        onClick={() => {
          inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => {
          setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          handleFiles(e.dataTransfer.files);
        }}
      >
        <Upload className="size-8 text-white/40" />
        <p className="text-sm text-white/60">Drag &amp; drop or click to upload</p>
        <p className="text-xs text-white/40">JPEG, PNG, WebP · max 10 MB per file</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files);
          }}
        />
      </div>

      {uploads.length > 0 && (
        <div className="flex flex-col gap-2">
          {uploads.map((u) => (
            <div key={u.id} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2">
              <div className="mb-1 flex items-center justify-between text-xs text-white/60">
                <span className="truncate">{u.name}</span>
                <span>{u.progress}%</span>
              </div>
              <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-purple-500 transition-all" style={{ width: `${u.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
