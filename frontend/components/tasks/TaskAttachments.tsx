"use client";

import { useRef, useState } from "react";
import { Paperclip, Trash2, FileText, Image, FileSpreadsheet, Archive } from "lucide-react";
import { clsx } from "clsx";
import { useTaskAttachments, useUploadAttachment, useDeleteAttachment } from "@/hooks/useTasks";

const MAX_FILES = 10;
const ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp,.zip";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function fileIcon(mime: string) {
  if (mime.startsWith("image/")) return <Image size={14} className="text-emerald-400/70" />;
  if (mime.includes("spreadsheet") || mime.includes("excel") || mime === "text/csv") return <FileSpreadsheet size={14} className="text-green-400/70" />;
  if (mime === "application/zip" || mime === "application/x-zip-compressed") return <Archive size={14} className="text-amber-400/70" />;
  return <FileText size={14} className="text-indigo-400/70" />;
}

export function TaskAttachments({ taskId, disabled }: { taskId: number; disabled?: boolean }) {
  const { data: attachments, isLoading } = useTaskAttachments(taskId);
  const { mutate: upload, isPending: uploading, error: uploadError } = useUploadAttachment();
  const { mutate: remove } = useDeleteAttachment();
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const count = attachments?.length ?? 0;
  const canUpload = !disabled && count < MAX_FILES;

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) upload({ taskId, file });
    e.target.value = "";
  }

  function handleDelete(attId: number) {
    if (confirmId !== attId) {
      setConfirmId(attId);
      return;
    }
    remove({ taskId, attachmentId: attId });
    setConfirmId(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--t-faint)" }}>
          Файлы {count > 0 && <span className="normal-case tracking-normal font-normal">({count}/{MAX_FILES})</span>}
        </p>
        {canUpload && (
          <button
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1 text-[12px] font-medium text-indigo-400/70 hover:text-indigo-400 transition-colors disabled:opacity-50"
          >
            <Paperclip size={12} />
            {uploading ? "Загрузка..." : "Прикрепить"}
          </button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={handleFileChange}
      />

      {uploadError && (
        <p className="text-red-400 text-[11px] mb-2">
          {(uploadError as Error).message}
        </p>
      )}

      {isLoading && (
        <div className="text-[12px] py-2" style={{ color: "var(--t-faint)" }}>Загрузка...</div>
      )}

      {attachments && attachments.length > 0 && (
        <div className="space-y-1">
          {attachments.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-lg hover:bg-white/[0.03] group transition-colors"
            >
              {fileIcon(att.mime_type)}
              <a
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 min-w-0 text-[12px] font-medium truncate hover:underline underline-offset-2"
                style={{ color: "var(--t-secondary)" }}
                title={att.original_filename}
              >
                {att.original_filename}
              </a>
              <span className="text-[10px] tabular-nums shrink-0" style={{ color: "var(--t-faint)" }}>
                {formatSize(att.file_size)}
              </span>
              {!disabled && (
                <button
                  onClick={() => handleDelete(att.id)}
                  onBlur={() => setTimeout(() => setConfirmId(null), 200)}
                  className={clsx(
                    "w-6 h-6 rounded flex items-center justify-center transition-colors shrink-0",
                    confirmId === att.id
                      ? "bg-red-500/20 text-red-400"
                      : "opacity-0 group-hover:opacity-100 hover:bg-white/[0.06] text-white/30 hover:text-red-400"
                  )}
                  title={confirmId === att.id ? "Нажмите для подтверждения" : "Удалить"}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && count === 0 && !disabled && (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full py-3 rounded-xl border border-dashed border-white/[0.08] text-[12px] font-medium hover:bg-white/[0.03] hover:border-white/[0.12] transition-colors disabled:opacity-50"
          style={{ color: "var(--t-faint)" }}
        >
          <Paperclip size={13} className="inline mr-1.5 -mt-0.5" />
          Прикрепить файл
        </button>
      )}
    </div>
  );
}
