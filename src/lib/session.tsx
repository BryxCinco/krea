"use client";

/**
 * Session state: the files on the Stage and the Recent Moves list.
 * Everything lives in React memory only. Nothing is written to disk, storage
 * or the network, and "Wipe session" drops it all.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { detectFileType, MAX_FILE_BYTES, type FileKind } from "@/lib/file-type";
import { convertToJpeg } from "@/lib/heic";
import { probeFile, stopAllWorkers } from "@/lib/worker-client";
import type { WorkFile } from "@/tools/types";
import type { FileInfo } from "@/workers/runtime";

export interface StageFile {
  id: string;
  file: Blob;
  name: string;
  kind: FileKind;
  mime: string;
  /** Object URL for image previews. */
  previewUrl?: string;
  /** Dimensions or page count, filled in asynchronously. */
  info?: FileInfo | null;
}

export interface RecentMove {
  id: string;
  toolName: string;
  at: number;
  files: WorkFile[];
}

interface Session {
  files: StageFile[];
  recent: RecentMove[];
  /** Short status message, announced to screen readers. */
  notice: string | null;
  addFiles: (incoming: Iterable<File | WorkFile>) => Promise<void>;
  removeFile: (id: string) => void;
  reorderFiles: (files: StageFile[]) => void;
  clearFiles: () => void;
  addRecent: (toolName: string, files: WorkFile[]) => void;
  setNotice: (message: string | null) => void;
  wipe: () => void;
}

const SessionContext = createContext<Session | null>(null);

const MAX_RECENT = 6;
let counter = 0;
const newId = () => `f${Date.now().toString(36)}${counter++}`;

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [files, setFiles] = useState<StageFile[]>([]);
  const [recent, setRecent] = useState<RecentMove[]>([]);
  const [notice, setNoticeState] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setNotice = useCallback((message: string | null) => {
    clearTimeout(noticeTimer.current);
    setNoticeState(message);
    if (message) noticeTimer.current = setTimeout(() => setNoticeState(null), 6000);
  }, []);

  const addFiles = useCallback(
    async (incoming: Iterable<File | WorkFile>) => {
      // Copy first: FileList and DataTransfer are live objects that empty out once the event ends.
      const items = [...incoming];
      const accepted: StageFile[] = [];
      const problems: string[] = [];
      let converted = 0;

      for (const item of items) {
        let blob = "blob" in item ? item.blob : item;
        let name = item.name || "pasted-file";
        if (blob.size > MAX_FILE_BYTES) {
          problems.push(`"${name}" is over 200 MB, masyadong malaki.`);
          continue;
        }
        let detected = await detectFileType(blob, name);
        if (detected.kind === "convertible") {
          // iPhone HEIC (and AVIF): convert to JPEG first, so every image tool can use it.
          setNotice(`Converting "${name}" to JPG…`);
          try {
            ({ blob, name } = await convertToJpeg(blob, name, detected.mime));
            detected = { kind: "image", mime: "image/jpeg" };
            converted++;
          } catch (error) {
            problems.push((error as Error).message);
            continue;
          }
        }
        if (detected.kind !== "image" && detected.kind !== "pdf" && detected.kind !== "text" && detected.kind !== "archive") {
          problems.push(`"${name}": ${detected.unsupported ?? "This file type has no tools yet."}`);
          continue;
        }
        accepted.push({
          id: newId(),
          file: blob,
          name,
          kind: detected.kind,
          mime: detected.mime,
          previewUrl: detected.kind === "image" ? URL.createObjectURL(blob) : undefined,
        });
      }

      if (problems.length) setNotice(problems.join(" "));
      else if (converted) setNotice(`${converted} HEIC/AVIF ${converted === 1 ? "photo" : "photos"} converted to JPG on your device.`);
      if (!accepted.length) return;
      setFiles((current) => [...current, ...accepted]);

      // Fill in dimensions and page counts in the background.
      // Text and ZIP files have no size or page count to show.
      for (const entry of accepted.filter((item) => item.kind === "image" || item.kind === "pdf")) {
        probeFile(entry.kind === "pdf" ? "pdf" : "image", { name: entry.name, type: entry.mime, blob: entry.file }).then((info) => {
          setFiles((current) => current.map((f) => (f.id === entry.id ? { ...f, info } : f)));
        });
      }
    },
    [setNotice],
  );

  const removeFile = useCallback((id: string) => {
    setFiles((current) => {
      const target = current.find((f) => f.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return current.filter((f) => f.id !== id);
    });
  }, []);

  const clearFiles = useCallback(() => {
    setFiles((current) => {
      current.forEach((f) => f.previewUrl && URL.revokeObjectURL(f.previewUrl));
      return [];
    });
  }, []);

  const addRecent = useCallback((toolName: string, outputs: WorkFile[]) => {
    setRecent((current) => [{ id: newId(), toolName, at: Date.now(), files: outputs }, ...current].slice(0, MAX_RECENT));
  }, []);

  const wipe = useCallback(() => {
    stopAllWorkers();
    clearFiles();
    setRecent([]);
    setNotice("Session wiped. Wala nang natira sa memory.");
  }, [clearFiles, setNotice]);

  const value = useMemo<Session>(
    () => ({ files, recent, notice, addFiles, removeFile, reorderFiles: setFiles, clearFiles, addRecent, setNotice, wipe }),
    [files, recent, notice, addFiles, removeFile, clearFiles, addRecent, setNotice, wipe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession must be used inside <SessionProvider>");
  return session;
}
