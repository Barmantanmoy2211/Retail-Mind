import React, { useRef, useState } from "react";
import api from "@/lib/api";
import { Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";

/**
 * ImageUpload - uploads file to backend /api/uploads/image (S3).
 * Falls back gracefully with a clear toast when S3 isn't configured.
 */
export default function ImageUpload({ value, onChange, folder = "products", testId = "img-upload" }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Max 5MB");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post(`/uploads/image?folder=${folder}`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange(data.url);
      toast.success("Image uploaded");
    } catch (e) {
      const d = e.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Upload failed - S3 may not be configured");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      {value ? (
        <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-border">
          <img src={value} alt="" className="w-full h-full object-cover" />
          <button
            type="button"
            onClick={() => onChange("")}
            className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full flex items-center justify-center"
            data-testid={`${testId}-remove`}
          >
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="w-20 h-20 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground">
          <Upload size={20} />
        </div>
      )}
      <div className="flex-1">
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          onChange={onPick}
          className="hidden"
          data-testid={`${testId}-input`}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="px-3 py-1.5 border border-border rounded-lg text-sm hover:bg-secondary disabled:opacity-50"
          data-testid={`${testId}-btn`}
        >
          {busy ? <Loader2 size={14} className="animate-spin inline mr-1" /> : <Upload size={14} className="inline mr-1" />}
          {value ? "Replace image" : "Upload image"}
        </button>
        <p className="text-xs text-muted-foreground mt-1">Max 5MB · PNG, JPG, WEBP</p>
      </div>
    </div>
  );
}
