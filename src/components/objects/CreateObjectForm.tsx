import { useState } from "react";
import { Tag, Plus } from "lucide-react";
import { FormField } from "@/components/auth/FormField";
import { ServerError } from "@/components/auth/ServerError";
import { Button } from "@/components/ui/button";
import type { ObjectRecord } from "@/types/objects";

export default function CreateObjectForm() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  function handleCancel() {
    setOpen(false);
    setName("");
    setError(null);
    setFieldError(undefined);
  }

  async function submitCreate() {
    setError(null);
    setFieldError(undefined);
    setLoading(true);

    try {
      const res = await fetch("/api/objects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });

      if (res.status === 401) {
        window.location.assign("/auth/signin");
        return;
      }

      const data = (await res.json()) as { object?: ObjectRecord; error?: string };

      if (res.status === 422) {
        setFieldError(data.error ?? "Invalid name");
        return;
      }

      if (!res.ok || !data.object) {
        setError(data.error ?? "Failed to create object");
        return;
      }

      window.location.assign(`/objects/${data.object.id}`);
    } catch {
      setError("Network error — please try again");
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => {
          setOpen(true);
        }}
        className="bg-purple-600 font-medium text-white hover:bg-purple-500"
      >
        <Plus className="size-4" />
        Create object
      </Button>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-6 backdrop-blur-xl">
      <h2 className="mb-4 text-lg font-semibold text-white">New object</h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitCreate();
        }}
        className="flex flex-col gap-4"
      >
        <FormField
          id="object-name"
          label="Object name"
          value={name}
          onChange={setName}
          placeholder="e.g. Leather jacket"
          error={fieldError}
          icon={<Tag className="size-4" />}
        />
        <ServerError message={error} />
        <div className="flex gap-3">
          <Button
            type="button"
            variant="outline"
            className="flex-1 border-white/20 bg-white/10 text-white hover:bg-white/20"
            onClick={handleCancel}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || name.trim().length === 0}
            className="flex-1 bg-purple-600 font-medium text-white hover:bg-purple-500"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Creating…
              </span>
            ) : (
              "Create object"
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
