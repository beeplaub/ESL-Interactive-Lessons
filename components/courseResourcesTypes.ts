export type CourseResourceView = {
  id: string;
  title: string;
  description: string | null;
  file_name: string;
  mime_type: string;
  file_size: number;
  resource_type: "UPLOAD" | "FILE_LINK" | "WEB_LINK";
  external_url: string | null;
  preview_url?: string | null;
};

export function resourceKindLabel(resource: CourseResourceView) {
  if (resource.resource_type === "WEB_LINK") return "Website link";
  if (resource.resource_type === "FILE_LINK") {
    const ext = resource.file_name.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
    const labels: Record<string, string> = { pdf: "PDF link", jpg: "Image link", jpeg: "Image link", png: "Image link", webp: "Image link", mp3: "Audio link", m4a: "Audio link", wav: "Audio link", docx: "Word file link", xlsx: "Spreadsheet link" };
    return labels[ext ?? ""] ?? "Linked file";
  }
  if (resource.mime_type === "application/pdf") return "PDF";
  if (resource.mime_type.startsWith("image/")) return resource.file_name.split(".").pop()?.toUpperCase() ?? "IMAGE";
  if (resource.mime_type.startsWith("audio/")) return "AUDIO";
  if (/spreadsheet|excel/.test(resource.mime_type)) return "SHEET";
  if (/wordprocessing|msword/.test(resource.mime_type)) return "DOC";
  return "FILE";
}

export function formatResourceSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
