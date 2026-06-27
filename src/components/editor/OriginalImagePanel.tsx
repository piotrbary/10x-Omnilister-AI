import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import type { PhotoRecord } from "@/types/objects";

export interface UploadItem {
  id: string;
  name: string;
  progress: number;
}

interface OriginalImagePanelProps {
  photos: PhotoRecord[];
  selectedIndex: number;
  onSelectIndex: (i: number) => void;
  uploads: UploadItem[];
  onFilesReady: (files: FileList) => void;
  onDeletePhoto?: (photoId: string) => void;
  disabled?: boolean;
}

export default function OriginalImagePanel({
  photos,
  selectedIndex,
  onSelectIndex,
  uploads,
  onFilesReady,
  onDeletePhoto,
  disabled = false,
}: OriginalImagePanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const safeIndex = photos.length === 0 ? 0 : Math.min(selectedIndex, photos.length - 1);
  const currentPhoto = photos[safeIndex];
  const hasPhotos = photos.length > 0;

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (!disabled) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!disabled && e.dataTransfer.files.length > 0) {
      onFilesReady(e.dataTransfer.files);
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      onFilesReady(e.target.files);
      e.target.value = "";
    }
  }

  return (
    <div
      className="editor-panel"
      style={{ position: "relative", overflow: "hidden", backgroundColor: "var(--dt-color-canvas)" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />

      {!hasPhotos ? (
        /* Empty state */
        <div
          onClick={() => !disabled && inputRef.current?.click()}
          style={{
            position: "absolute",
            inset: "16px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "12px",
            border: "2px dashed",
            borderColor: isDragging ? "#7c3aed" : "var(--dt-color-hairline-strong, #d1d5db)",
            borderRadius: "12px",
            cursor: disabled ? "wait" : "pointer",
            backgroundColor: isDragging ? "rgba(124,58,237,0.06)" : "transparent",
            transition: "border-color 0.15s, background-color 0.15s",
          }}
        >
          <Upload
            style={{
              width: 36,
              height: 36,
              color: isDragging ? "#7c3aed" : "var(--dt-color-steel, #9ca3af)",
            }}
          />
          {disabled ? (
            <p style={{ fontSize: "13px", color: "var(--dt-color-steel, #9ca3af)", margin: 0 }}>
              Tworzenie obiektu…
            </p>
          ) : (
            <div style={{ textAlign: "center" }}>
              <p
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  color: "var(--dt-color-slate, #4b5563)",
                  margin: 0,
                }}
              >
                Przeciągnij zdjęcia lub kliknij
              </p>
              <p
                style={{
                  fontSize: "12px",
                  color: "var(--dt-color-steel, #9ca3af)",
                  margin: "4px 0 0 0",
                }}
              >
                JPEG, PNG, WebP · max 10 MB
              </p>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Main image */}
          <div
            style={{
              position: "absolute",
              inset: "0 0 52px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "12px",
              cursor: currentPhoto ? "zoom-in" : "default",
            }}
            onClick={() => {
              if (currentPhoto) setLightboxUrl(currentPhoto.originalUrl);
            }}
          >
            {currentPhoto && (
              <img
                src={currentPhoto.originalUrl}
                alt="Oryginał"
                style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
              />
            )}
          </div>

          {/* Thumbnail strip */}
          <div
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: "52px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "0 8px",
              backgroundColor: "rgba(0,0,0,0.03)",
              borderTop: "1px solid var(--dt-color-hairline)",
              overflowX: "auto",
            }}
          >
            {photos.map((p, i) => (
              <div
                key={p.id}
                style={{
                  position: "relative",
                  width: "40px",
                  height: "40px",
                  flexShrink: 0,
                }}
              >
                <div
                  onClick={() => onSelectIndex(i)}
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    cursor: "pointer",
                    border: i === safeIndex ? "2px solid #7c3aed" : "2px solid transparent",
                  }}
                >
                  <img
                    src={p.originalUrl}
                    alt={`Zdjęcie ${i + 1}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
                {onDeletePhoto && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeletePhoto(p.id);
                    }}
                    title="Usuń zdjęcie"
                    style={{
                      position: "absolute",
                      top: "-4px",
                      right: "-4px",
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      backgroundColor: "#ef4444",
                      border: "none",
                      color: "#fff",
                      fontSize: "9px",
                      lineHeight: 1,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: 0,
                      fontWeight: 700,
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => inputRef.current?.click()}
              title="Dodaj kolejne zdjęcie"
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "6px",
                border: "2px dashed var(--dt-color-hairline-strong, #d1d5db)",
                backgroundColor: "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontSize: "18px",
                color: "var(--dt-color-steel, #9ca3af)",
                flexShrink: 0,
              }}
            >
              +
            </button>
          </div>

          {/* Drag overlay */}
          {isDragging && (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: "rgba(124,58,237,0.12)",
                border: "2px dashed #7c3aed",
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              <p style={{ fontSize: "14px", fontWeight: 600, color: "#7c3aed" }}>Upuść zdjęcia</p>
            </div>
          )}
        </>
      )}

      {/* Upload progress overlay */}
      {uploads.length > 0 && (
        <div
          style={{
            position: "absolute",
            bottom: hasPhotos ? "52px" : "0",
            left: 0,
            right: 0,
            padding: "8px 12px",
            backgroundColor: "rgba(15,15,35,0.87)",
            backdropFilter: "blur(4px)",
          }}
        >
          {uploads.map((u) => (
            <div key={u.id} style={{ marginBottom: "4px" }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "11px",
                  color: "#fff",
                  marginBottom: "3px",
                }}
              >
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: "80%",
                  }}
                >
                  {u.name}
                </span>
                <span>{u.progress}%</span>
              </div>
              <div
                style={{
                  height: "2px",
                  backgroundColor: "rgba(255,255,255,0.15)",
                  borderRadius: "1px",
                }}
              >
                <div
                  style={{
                    width: `${u.progress}%`,
                    height: "100%",
                    backgroundColor: "#7c3aed",
                    borderRadius: "1px",
                    transition: "width 0.1s",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxUrl !== null && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            backgroundColor: "rgba(0,0,0,0.9)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "zoom-out",
          }}
        >
          <img
            src={lightboxUrl}
            alt="Podgląd zdjęcia"
            style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain" }}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightboxUrl(null)}
            style={{
              position: "absolute",
              top: "20px",
              right: "24px",
              background: "none",
              border: "none",
              color: "#fff",
              fontSize: "28px",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
