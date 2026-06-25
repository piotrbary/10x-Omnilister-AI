import { useRef, useState, useEffect, useMemo } from "react";
import { MOCK_SCORE_BEFORE } from "@/data/mockEditorData";
import type { ObjectRecord, PhotoRecord } from "@/types/objects";
import type { ObjectCategory } from "@/lib/config";
import { storageConfig, aiConfig, TRANSFORMATION_MODELS } from "@/lib/config";
import type { QualityScoreSnapshot, TransformationJob } from "@/types/transformations";
import AppNavBar from "./AppNavBar";
import OriginalImagePanel from "./OriginalImagePanel";
import type { UploadItem } from "./OriginalImagePanel";
import TransformedImagePanel from "./TransformedImagePanel";
import TransformToolbar from "./TransformToolbar";
import type { ToolbarHandle } from "./TransformToolbar";
import ScoreSidebar from "./ScoreSidebar";
import StatusBar from "./StatusBar";
import type { StatusEntry } from "./StatusBar";
import PromptDrawer from "./PromptDrawer";

interface EditorShellProps {
  objectId: string | null;
  user: { email: string } | null;
}

const VALID_CATEGORIES: ObjectCategory[] = ["car", "real-estate", "item"];

function toCategory(raw: string | null): ObjectCategory {
  return VALID_CATEGORIES.includes(raw as ObjectCategory) ? (raw as ObjectCategory) : "car";
}

const EMPTY_OBJECT: ObjectRecord = {
  id: "",
  name: "Nowy projekt",
  version: 1,
  category: null,
  createdAt: "",
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function EditorShell({ objectId: initialObjectId, user }: EditorShellProps) {
  const toolbarRef = useRef<ToolbarHandle>(null);
  const isGuest = user === null;

  // Core editor state
  const [objectId, setObjectId] = useState<string | null>(initialObjectId);
  const [object, setObject] = useState<ObjectRecord>(EMPTY_OBJECT);
  const [photos, setPhotos] = useState<PhotoRecord[]>([]);
  const [category, setCategory] = useState<ObjectCategory>("car");
  const [selectedStyleKey, setSelectedStyleKey] = useState<string | null>(null);
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(!!initialObjectId);
  const [creatingObject, setCreatingObject] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [resultSaved, setResultSaved] = useState(false);
  const [scoreAfter, setScoreAfter] = useState<QualityScoreSnapshot | null>(null);
  const [previewMode, setPreviewMode] = useState<"after" | "before-after">("after");
  const [isSaveable, setIsSaveable] = useState(!!initialObjectId);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [status, setStatus] = useState<StatusEntry>({ type: "idle" });
  const [showPromptDrawer, setShowPromptDrawer] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>(
    TRANSFORMATION_MODELS[0]?.id ?? aiConfig.transformationModel,
  );

  // Guest mode: map photoId → File for transform
  const [guestFiles, setGuestFiles] = useState<Map<string, File>>(new Map());

  // Auth modal
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authSuccess, setAuthSuccess] = useState(false);

  // Object browser (logged-in users)
  const [showObjectBrowser, setShowObjectBrowser] = useState(false);
  const [objectList, setObjectList] = useState<ObjectRecord[]>([]);
  const [objectBrowserLoading, setObjectBrowserLoading] = useState(false);

  const displayStatus = useMemo<StatusEntry>(() => {
    if (creatingObject) return { type: "progress", message: "Tworzenie obiektu w bazie danych…" };
    if (uploads.length > 0) {
      const avg = Math.round(uploads.reduce((s, u) => s + u.progress, 0) / uploads.length);
      const label =
        uploads.length === 1
          ? `Wgrywanie: ${uploads[0]!.name}`
          : `Wgrywanie ${uploads.length} pliki`;
      return { type: "progress", message: label, percent: avg };
    }
    if (status.type !== "idle") return status;
    if (photos.length === 0) {
      return {
        type: "info",
        message: isGuest
          ? "Tryb gość — przeciągnij zdjęcie, aby rozpocząć. Zaloguj się, by zapisywać do chmury."
          : "Przeciągnij zdjęcie do lewego panelu lub kliknij, aby wybrać plik z dysku",
      };
    }
    if (!selectedStyleKey) {
      return {
        type: "info",
        message: "Zdjęcie wgrane — wybierz styl transformacji i kliknij ▶ Zastosuj",
      };
    }
    return { type: "idle", message: "Gotowy — kliknij ▶ Zastosuj, aby przetransformować zdjęcie" };
  }, [creatingObject, uploads, status, photos.length, selectedStyleKey, isGuest]);

  /* Load existing object + photos on mount (cloud mode only) */
  useEffect(() => {
    if (!initialObjectId || isGuest) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/objects/${initialObjectId}`);
        if (!cancelled && res.ok) {
          const data = (await res.json()) as { object: ObjectRecord; photos: PhotoRecord[] };
          setObject(data.object);
          setPhotos(data.photos);
          setCategory(toCategory(data.object.category));
          setIsSaveable(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Object browser ──────────────────────────────────────────────────── */

  async function openObjectBrowser() {
    setShowObjectBrowser(true);
    setObjectBrowserLoading(true);
    try {
      const res = await fetch("/api/objects");
      if (res.ok) {
        const data = (await res.json()) as { objects: ObjectRecord[] };
        setObjectList(data.objects ?? []);
      }
    } finally {
      setObjectBrowserLoading(false);
    }
  }

  async function handleLoadObject(id: string) {
    setShowObjectBrowser(false);
    setLoading(true);
    setResultUrl(null);
    setCurrentJobId(null);
    setResultSaved(false);
    setScoreAfter(null);
    setSelectedStyleKey(null);
    try {
      const res = await fetch(`/api/objects/${id}`);
      if (res.ok) {
        const data = (await res.json()) as { object: ObjectRecord; photos: PhotoRecord[] };
        setObjectId(id);
        setObject(data.object);
        setPhotos(data.photos);
        setCategory(toCategory(data.object.category));
        setIsSaveable(true);
        window.history.replaceState({}, "", `/?objectId=${id}`);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleNewProject() {
    setObjectId(null);
    setObject(EMPTY_OBJECT);
    setPhotos([]);
    setCategory("car");
    setSelectedStyleKey(null);
    setResultUrl(null);
    setCurrentJobId(null);
    setResultSaved(false);
    setScoreAfter(null);
    setIsSaveable(false);
    setGuestFiles(new Map());
    setStatus({ type: "idle" });
    window.history.replaceState({}, "", "/");
  }

  /* ── Auth modal ──────────────────────────────────────────────────────── */

  function openAuthModal(mode: "signin" | "signup" = "signin") {
    setAuthMode(mode);
    setAuthEmail("");
    setAuthPassword("");
    setAuthError(null);
    setAuthSuccess(false);
    setShowAuthModal(true);
  }

  async function handleAuth() {
    if (!authEmail.trim() || !authPassword.trim()) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const endpoint = authMode === "signin" ? "/api/auth/signin" : "/api/auth/signup";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail, password: authPassword }),
      });
      const data = (await res.json()) as { error?: string; confirmEmail?: boolean };
      if (!res.ok) {
        setAuthError(data.error ?? "Błąd uwierzytelnienia");
        return;
      }
      if (authMode === "signup") {
        setAuthSuccess(true);
      } else {
        window.location.reload();
      }
    } catch {
      setAuthError("Błąd sieci — spróbuj ponownie");
    } finally {
      setAuthLoading(false);
    }
  }

  /* ── Upload helpers ──────────────────────────────────────────────────── */

  async function uploadSingleFile(file: File, objId: string, nextIndex: number) {
    const uploadId = crypto.randomUUID();
    setUploads((prev) => [...prev, { id: uploadId, name: file.name, progress: 0 }]);

    const updateProgress = (p: number) =>
      setUploads((prev) => prev.map((u) => (u.id === uploadId ? { ...u, progress: p } : u)));
    const removeUpload = () => setUploads((prev) => prev.filter((u) => u.id !== uploadId));

    try {
      const urlRes = await fetch(`/api/objects/${objId}/photos/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName: file.name, mimeType: file.type, fileSize: file.size }),
      });

      if (urlRes.status === 401) {
        openAuthModal("signin");
        removeUpload();
        return;
      }

      const urlData = (await urlRes.json()) as {
        signedUrl?: string;
        path?: string;
        error?: string;
      };

      if (!urlRes.ok || !urlData.signedUrl || !urlData.path) {
        throw new Error(urlData.error ?? `Nie można uzyskać URL dla ${file.name}`);
      }

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) updateProgress(Math.round((e.loaded / e.total) * 90));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            let msg = `Błąd przesyłania: ${xhr.status}`;
            try {
              const b = JSON.parse(xhr.responseText) as { message?: string; error?: string };
              if (b.message) msg = b.message;
              else if (b.error) msg = b.error;
            } catch {
              /* ignore */
            }
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error("Błąd sieci podczas przesyłania"));
        xhr.open("PUT", urlData.signedUrl!);
        xhr.setRequestHeader("Content-Type", file.type);
        xhr.send(file);
      });

      updateProgress(95);

      const confirmRes = await fetch(`/api/objects/${objId}/photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: urlData.path,
          fileName: file.name,
          mimeType: file.type,
          fileSize: file.size,
        }),
      });

      const confirmData = (await confirmRes.json()) as { photo?: PhotoRecord; error?: string };
      if (!confirmRes.ok || !confirmData.photo) {
        throw new Error(confirmData.error ?? `Nie można potwierdzić przesłania ${file.name}`);
      }

      updateProgress(100);
      setTimeout(removeUpload, 800);

      setPhotos((prev) => [...prev, confirmData.photo!]);
      setSelectedPhotoIndex(nextIndex);
      setIsSaveable(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Błąd przesyłania";
      setStatus({ type: "error", message: `${file.name}: ${message}` });
      removeUpload();
    }
  }

  async function handleFilesReady(files: FileList) {
    if (photos.length >= storageConfig.maxPhotosPerObject) {
      setStatus({
        type: "error",
        message: `Osiągnięto limit ${storageConfig.maxPhotosPerObject} zdjęć`,
      });
      return;
    }

    const validFiles: File[] = [];
    for (const file of Array.from(files)) {
      if (!(storageConfig.allowedPhotoMimeTypes as readonly string[]).includes(file.type)) {
        setStatus({ type: "error", message: `${file.name}: dozwolone tylko JPEG, PNG i WebP` });
        continue;
      }
      if (file.size > storageConfig.maxSinglePhotoBytes) {
        setStatus({ type: "error", message: `${file.name}: plik przekracza limit 10 MB` });
        continue;
      }
      validFiles.push(file);
    }
    if (validFiles.length === 0) return;

    // Guest mode: store as blob URLs, no API calls
    if (isGuest) {
      const startIndex = photos.length;
      const newPhotos: PhotoRecord[] = validFiles.map((file) => ({
        id: crypto.randomUUID(),
        objectId: "guest",
        originalUrl: URL.createObjectURL(file),
        fileSizeBytes: file.size,
        mimeType: file.type,
        createdAt: new Date().toISOString(),
      }));
      setPhotos((prev) => [...prev, ...newPhotos]);
      setGuestFiles((prev) => {
        const m = new Map(prev);
        newPhotos.forEach((p, i) => m.set(p.id, validFiles[i]!));
        return m;
      });
      setSelectedPhotoIndex(startIndex + newPhotos.length - 1);
      return;
    }

    // Cloud mode: create object if needed, then upload
    let currentObjectId = objectId;
    if (!currentObjectId) {
      setCreatingObject(true);
      try {
        const res = await fetch("/api/objects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Nowy projekt" }),
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? "Nie można utworzyć obiektu");
        }
        const data = (await res.json()) as { object: ObjectRecord };
        currentObjectId = data.object.id;
        setObjectId(currentObjectId);
        setObject(data.object);
        window.history.replaceState({}, "", `/?objectId=${currentObjectId}`);
      } catch (err) {
        setStatus({
          type: "error",
          message: err instanceof Error ? err.message : "Nie można utworzyć obiektu",
        });
        setCreatingObject(false);
        return;
      }
      setCreatingObject(false);
    }

    const startIndex = photos.length;
    validFiles.forEach((file, i) => {
      void uploadSingleFile(file, currentObjectId!, startIndex + i);
    });
  }

  /* ── Delete photo ────────────────────────────────────────────────────── */

  async function handleDeletePhoto(photoId: string) {
    if (isGuest) {
      setPhotos((prev) => {
        const photo = prev.find((p) => p.id === photoId);
        if (photo) URL.revokeObjectURL(photo.originalUrl);
        const next = prev.filter((p) => p.id !== photoId);
        setSelectedPhotoIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
        return next;
      });
      setGuestFiles((prev) => {
        const m = new Map(prev);
        m.delete(photoId);
        return m;
      });
      return;
    }

    if (!objectId) return;
    try {
      const res = await fetch(`/api/objects/${objectId}/photos/${photoId}`, { method: "DELETE" });
      if (res.ok) {
        setPhotos((prev) => {
          const next = prev.filter((p) => p.id !== photoId);
          setSelectedPhotoIndex((i) => Math.min(i, Math.max(0, next.length - 1)));
          return next;
        });
      } else {
        const data = (await res.json()) as { error?: string };
        setStatus({ type: "error", message: data.error ?? "Nie można usunąć zdjęcia" });
      }
    } catch {
      setStatus({ type: "error", message: "Błąd sieci podczas usuwania zdjęcia" });
    }
  }

  /* ── Transform ───────────────────────────────────────────────────────── */

  async function handleGuestTransform(
    styleKey: string,
    selectedPhoto: PhotoRecord,
    customPrompt?: string,
  ) {
    const file = guestFiles.get(selectedPhoto.id);
    if (!file) {
      setStatus({ type: "info", message: "Brak pliku do transformacji" });
      return;
    }

    setIsTransforming(true);
    setResultUrl(null);
    setCurrentJobId(null);
    setResultSaved(false);
    setScoreAfter(null);
    setStatus({ type: "progress", message: "Transformacja AI w toku… może potrwać 15–30 sekund" });

    try {
      const imageBase64 = await fileToBase64(file);
      const res = await fetch("/api/transformations/guest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageBase64,
          mimeType: file.type,
          style_name: styleKey,
          custom_prompt: customPrompt,
          model: selectedModel,
        }),
      });

      const data = (await res.json()) as { result_base64?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transformacja nie powiodła się");

      setResultUrl(`data:image/jpeg;base64,${data.result_base64}`);
      setStatus({
        type: "success",
        message: "Transformacja zakończona — zaloguj się, aby zapisać do chmury ✓",
      });
      setTimeout(() => setStatus({ type: "idle" }), 7000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transformacja nie powiodła się";
      setStatus({ type: "error", message: msg });
    } finally {
      setIsTransforming(false);
    }
  }

  async function handleTransform(styleKey: string, customPrompt?: string, model?: string) {
    const selectedPhoto = photos[selectedPhotoIndex] ?? photos[0];

    if (!selectedPhoto) {
      setStatus({ type: "info", message: "Najpierw wgraj zdjęcie — przeciągnij do lewego panelu" });
      return;
    }

    if (isGuest) {
      await handleGuestTransform(styleKey, selectedPhoto, customPrompt);
      return;
    }

    if (!objectId) {
      setStatus({ type: "info", message: "Najpierw wgraj zdjęcie — przeciągnij do lewego panelu" });
      return;
    }

    setIsTransforming(true);
    setResultUrl(null);
    setCurrentJobId(null);
    setResultSaved(false);
    setScoreAfter(null);
    setStatus({ type: "progress", message: "Transformacja AI w toku… może potrwać 15–30 sekund" });

    try {
      const res = await fetch("/api/transformations/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          object_id: objectId,
          photo_ids: [selectedPhoto.id],
          style_name: styleKey,
          custom_prompt: customPrompt,
          model: model ?? selectedModel,
        }),
      });

      const data = (await res.json()) as { jobs?: TransformationJob[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Transformacja nie powiodła się");

      const job = data.jobs?.[0];
      if (!job) throw new Error("Serwer nie zwrócił danych transformacji");

      if (job.status === "full_ready" && job.result_url) {
        setResultUrl(job.result_url);
        setCurrentJobId(job.id);
        if (job.score_after) setScoreAfter(job.score_after);
        setStatus({ type: "success", message: "Transformacja zakończona pomyślnie ✓" });
        setTimeout(() => setStatus({ type: "idle" }), 5000);
      } else if (job.status === "failed") {
        throw new Error(job.error_message ?? "Transformacja zakończyła się błędem");
      } else {
        setStatus({ type: "info", message: `Transformacja w toku (status: ${job.status})` });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Transformacja nie powiodła się";
      setStatus({ type: "error", message: msg });
    } finally {
      setIsTransforming(false);
    }
  }

  /* ── Save result ─────────────────────────────────────────────────────── */

  async function handleSaveResult() {
    if (isGuest) {
      openAuthModal("signin");
      return;
    }
    if (!currentJobId || savingResult || resultSaved) return;
    setSavingResult(true);
    try {
      const res = await fetch(`/api/transformations/${currentJobId}/save`, { method: "POST" });
      if (res.ok) {
        setResultSaved(true);
        setStatus({ type: "success", message: "Wynik transformacji zapisany w bibliotece ✓" });
        setTimeout(() => setStatus({ type: "idle" }), 4000);
      } else {
        const data = (await res.json()) as { error?: string };
        setStatus({ type: "error", message: data.error ?? "Nie można zapisać wyniku" });
      }
    } catch {
      setStatus({ type: "error", message: "Błąd sieci podczas zapisywania wyniku" });
    } finally {
      setSavingResult(false);
    }
  }

  function handleClearResult() {
    setResultUrl(null);
    setCurrentJobId(null);
    setResultSaved(false);
    setScoreAfter(null);
  }

  /* ── Category change ─────────────────────────────────────────────────── */

  function handleCategoryChange(c: ObjectCategory) {
    setCategory(c);
    setSelectedStyleKey(null);
  }

  /* ── Prompt drawer ───────────────────────────────────────────────────── */

  function handleApplyPrompt(prompt: string) {
    toolbarRef.current?.applyPrompt(prompt);
    setShowPromptDrawer(false);
  }

  /* ── Object save (name) ──────────────────────────────────────────────── */

  function handleOpenSave() {
    if (isGuest) {
      openAuthModal("signin");
      return;
    }
    setSaveName(object.name === "Nowy projekt" ? "" : object.name);
    setShowSaveModal(true);
  }

  async function handleConfirmSave() {
    if (!objectId || !saveName.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/objects/${objectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: saveName.trim() }),
      });
      if (res.ok) {
        const data = (await res.json()) as { object: ObjectRecord };
        setObject(data.object);
        setShowSaveModal(false);
        setStatus({ type: "success", message: `Zapisano jako „${data.object.name}" ✓` });
        setTimeout(() => setStatus({ type: "idle" }), 4000);
      } else {
        const data = (await res.json()) as { error?: string };
        setStatus({ type: "error", message: data.error ?? "Nie można zapisać obiektu" });
        setShowSaveModal(false);
      }
    } catch {
      setStatus({ type: "error", message: "Nie można zapisać obiektu" });
      setShowSaveModal(false);
    } finally {
      setSaving(false);
    }
  }

  /* ── Render ──────────────────────────────────────────────────────────── */

  const selectedPhoto = photos[selectedPhotoIndex] ?? photos[0];
  const currentPromptText = toolbarRef.current?.getCurrentPrompt() ?? "";

  return (
    <div className="editor-shell">
      <AppNavBar
        user={user}
        onSignIn={() => openAuthModal("signin")}
        onBrowseObjects={() => void openObjectBrowser()}
        onNewProject={handleNewProject}
      />

      <div>
        <TransformToolbar
          ref={toolbarRef}
          category={category}
          objectName={isGuest ? "Tryb gość" : object.name}
          selectedStyleKey={selectedStyleKey}
          onStyleSelect={setSelectedStyleKey}
          onCategoryChange={handleCategoryChange}
          onTransform={(styleKey, customPrompt) => void handleTransform(styleKey, customPrompt)}
          selectedModel={selectedModel}
          onModelChange={setSelectedModel}
          isTransforming={isTransforming}
          isSaveable={isSaveable && !isGuest}
          onSave={handleOpenSave}
          onOpenPrompts={() => setShowPromptDrawer(true)}
        />
      </div>

      <StatusBar entry={displayStatus} />

      <div className="editor-main">
        <ScoreSidebar scoreBefore={MOCK_SCORE_BEFORE} scoreAfter={scoreAfter} />

        {loading ? (
          <div
            className="editor-panel"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--dt-color-steel)",
              fontSize: "14px",
            }}
          >
            Ładowanie…
          </div>
        ) : (
          <OriginalImagePanel
            photos={photos}
            selectedIndex={selectedPhotoIndex}
            onSelectIndex={setSelectedPhotoIndex}
            uploads={uploads}
            onFilesReady={(files) => void handleFilesReady(files)}
            onDeletePhoto={(id) => void handleDeletePhoto(id)}
            disabled={creatingObject}
          />
        )}

        <TransformedImagePanel
          resultUrl={resultUrl}
          originalUrl={selectedPhoto?.originalUrl ?? null}
          isTransforming={isTransforming}
          error={null}
          previewMode={previewMode}
          onTogglePreview={() =>
            setPreviewMode((prev) => (prev === "after" ? "before-after" : "after"))
          }
          currentJobId={currentJobId}
          resultSaved={resultSaved}
          onSaveResult={() => void handleSaveResult()}
          onClearResult={handleClearResult}
        />
      </div>

      {/* Prompt drawer */}
      <PromptDrawer
        open={showPromptDrawer}
        category={category}
        currentPrompt={currentPromptText}
        onClose={() => setShowPromptDrawer(false)}
        onApply={handleApplyPrompt}
      />

      {/* Object browser drawer (logged-in users) */}
      {showObjectBrowser && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "flex",
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.5)" }}
            onClick={() => setShowObjectBrowser(false)}
          />
          <div
            style={{
              position: "relative",
              width: "300px",
              backgroundColor: "#0d0d1f",
              borderRight: "1px solid rgba(255,255,255,0.08)",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <span style={{ fontSize: "13px", fontWeight: 600, color: "#fff" }}>Obiekty</span>
              <button
                onClick={handleNewProject}
                style={{
                  fontSize: "12px",
                  color: "rgba(255,255,255,0.7)",
                  background: "rgba(99,102,241,0.2)",
                  border: "1px solid rgba(99,102,241,0.4)",
                  borderRadius: "6px",
                  padding: "4px 10px",
                  cursor: "pointer",
                }}
              >
                + Nowy
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "8px" }}>
              {objectBrowserLoading ? (
                <div
                  style={{ padding: "20px", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}
                >
                  Ładowanie…
                </div>
              ) : objectList.length === 0 ? (
                <div
                  style={{ padding: "20px", color: "rgba(255,255,255,0.4)", fontSize: "13px" }}
                >
                  Brak obiektów — utwórz pierwszy projekt
                </div>
              ) : (
                objectList.map((obj) => (
                  <div
                    key={obj.id}
                    onClick={() => void handleLoadObject(obj.id)}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      cursor: "pointer",
                      marginBottom: "2px",
                      border: "1px solid transparent",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor =
                        "rgba(255,255,255,0.06)";
                      (e.currentTarget as HTMLDivElement).style.borderColor =
                        "rgba(255,255,255,0.08)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = "transparent";
                      (e.currentTarget as HTMLDivElement).style.borderColor = "transparent";
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "#fff" }}>
                      {obj.name}
                    </div>
                    {obj.category && (
                      <div
                        style={{
                          fontSize: "11px",
                          color: "rgba(255,255,255,0.35)",
                          marginTop: "2px",
                          textTransform: "capitalize",
                        }}
                      >
                        {obj.category}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Auth modal */}
      {showAuthModal && (
        <Modal onDismiss={() => setShowAuthModal(false)}>
          <div style={{ width: "340px" }}>
            {/* Brand */}
            <div style={{ textAlign: "center", marginBottom: "24px" }}>
              <div
                style={{ fontSize: "18px", fontWeight: 700, color: "var(--dt-color-ink)", marginBottom: "4px" }}
              >
                Omnilister AI
              </div>
              <div style={{ fontSize: "13px", color: "var(--dt-color-steel)" }}>
                {authMode === "signin"
                  ? "Zaloguj się, aby zapisywać i pobierać obiekty"
                  : "Utwórz konto, aby zapisywać swoją pracę"}
              </div>
            </div>

            {/* Mode tabs */}
            {!authSuccess && (
              <div
                style={{
                  display: "flex",
                  gap: "2px",
                  marginBottom: "20px",
                  background: "var(--dt-color-surface)",
                  borderRadius: "8px",
                  padding: "3px",
                }}
              >
                {(["signin", "signup"] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setAuthMode(mode);
                      setAuthError(null);
                    }}
                    style={{
                      flex: 1,
                      padding: "6px 0",
                      borderRadius: "6px",
                      border: "none",
                      fontSize: "13px",
                      fontWeight: 500,
                      cursor: "pointer",
                      backgroundColor:
                        authMode === mode ? "var(--dt-color-canvas)" : "transparent",
                      color:
                        authMode === mode ? "var(--dt-color-ink)" : "var(--dt-color-steel)",
                      boxShadow:
                        authMode === mode ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
                    }}
                  >
                    {mode === "signin" ? "Logowanie" : "Rejestracja"}
                  </button>
                ))}
              </div>
            )}

            {authSuccess ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "20px 0",
                  color: "var(--dt-color-success)",
                  fontSize: "14px",
                }}
              >
                Sprawdź skrzynkę e-mail i potwierdź konto, aby się zalogować.
              </div>
            ) : (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: "16px" }}>
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAuth(); }}
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--dt-color-hairline)",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                      color: "var(--dt-color-ink)",
                    }}
                  />
                  <input
                    type="password"
                    placeholder="Hasło"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") void handleAuth(); }}
                    style={{
                      width: "100%",
                      padding: "9px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--dt-color-hairline)",
                      fontSize: "14px",
                      outline: "none",
                      boxSizing: "border-box",
                      color: "var(--dt-color-ink)",
                    }}
                  />
                </div>

                {authError && (
                  <div
                    style={{
                      fontSize: "13px",
                      color: "var(--dt-color-error)",
                      marginBottom: "12px",
                      padding: "8px 10px",
                      borderRadius: "6px",
                      backgroundColor: "oklch(0.97 0.01 25)",
                    }}
                  >
                    {authError}
                  </div>
                )}

                <button
                  onClick={() => void handleAuth()}
                  disabled={authLoading || !authEmail.trim() || !authPassword.trim()}
                  style={{
                    width: "100%",
                    padding: "10px 0",
                    borderRadius: "8px",
                    border: "none",
                    backgroundColor:
                      authLoading || !authEmail.trim() || !authPassword.trim()
                        ? "#9ca3af"
                        : "#6366f1",
                    color: "#fff",
                    fontSize: "14px",
                    fontWeight: 600,
                    cursor:
                      authLoading || !authEmail.trim() || !authPassword.trim()
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {authLoading
                    ? "Przetwarzanie…"
                    : authMode === "signin"
                      ? "Zaloguj się"
                      : "Utwórz konto"}
                </button>
              </>
            )}
          </div>
        </Modal>
      )}

      {/* Object save modal (cloud mode) */}
      {showSaveModal && (
        <Modal onDismiss={() => setShowSaveModal(false)}>
          <h2
            style={{
              fontSize: "18px",
              fontWeight: 700,
              color: "var(--dt-color-ink)",
              margin: "0 0 6px 0",
            }}
          >
            Zapisz obiekt
          </h2>
          <p style={{ fontSize: "13px", color: "var(--dt-color-steel)", margin: "0 0 20px 0" }}>
            Po zapisaniu pozostaniesz w edytorze.
          </p>
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                fontSize: "11px",
                fontWeight: 700,
                color: "var(--dt-color-steel)",
                display: "block",
                marginBottom: "6px",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
              }}
            >
              Nazwa obiektu
            </label>
            <input
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleConfirmSave();
                if (e.key === "Escape") setShowSaveModal(false);
              }}
              placeholder="np. BMW 3 Series 2021, Skórzana kurtka…"
              autoFocus
              style={{
                width: "100%",
                padding: "9px 12px",
                borderRadius: "8px",
                border: "1px solid var(--dt-color-hairline)",
                fontSize: "14px",
                outline: "none",
                boxSizing: "border-box",
                color: "var(--dt-color-ink)",
              }}
            />
          </div>
          <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
            <button
              onClick={() => setShowSaveModal(false)}
              style={{
                padding: "8px 16px",
                borderRadius: "8px",
                border: "1px solid var(--dt-color-hairline)",
                background: "none",
                cursor: "pointer",
                fontSize: "13px",
                color: "var(--dt-color-slate)",
              }}
            >
              Anuluj
            </button>
            <button
              onClick={() => void handleConfirmSave()}
              disabled={!saveName.trim() || saving}
              style={{
                padding: "8px 20px",
                borderRadius: "8px",
                backgroundColor: saveName.trim() && !saving ? "#10b981" : "#9ca3af",
                color: "#fff",
                border: "none",
                cursor: saveName.trim() && !saving ? "pointer" : "not-allowed",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {saving ? "Zapisuję…" : "Zapisz"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Shared modal shell ──────────────────────────────────────────────────── */

function Modal({ children, onDismiss }: { children: React.ReactNode; onDismiss: () => void }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onDismiss();
      }}
    >
      <div
        style={{
          backgroundColor: "var(--dt-color-canvas)",
          borderRadius: "12px",
          padding: "28px 32px",
          maxWidth: "90vw",
          boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        }}
      >
        {children}
      </div>
    </div>
  );
}
