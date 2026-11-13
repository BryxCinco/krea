"use client";

import { Clock, Download, Plane } from "lucide-react";
import { downloadBlob, downloadZip } from "@/lib/download";
import { formatBytes } from "@/lib/file-type";
import { useSession } from "@/lib/session";

/**
 * Left rail: Recent Moves for this session. Results stay in memory so they can
 * be downloaded again until the session is wiped or the tab closes.
 */
export function Rail() {
  const { recent } = useSession();

  return (
    <div className="flex h-full flex-col gap-6 p-4">
      <section aria-labelledby="recent-heading">
        <h2 id="recent-heading" className="mb-3 flex items-center gap-2 text-xs uppercase tracking-widest text-muted">
          <Clock aria-hidden className="size-3.5" strokeWidth={1.75} />
          Recent Moves
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">
            Wala pa. Finished Moves show up here so you can download them again.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {recent.map((move) => {
              const bytes = move.files.reduce((sum, file) => sum + file.blob.size, 0);
              const time = new Date(move.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
              return (
                <li key={move.id} className="flex items-center gap-2 rounded-md border border-line p-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-fg">{move.toolName}</p>
                    <p className="truncate font-mono text-xs text-muted">
                      {time} · {move.files.length} {move.files.length === 1 ? "file" : "files"} · {formatBytes(bytes)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={`Download ${move.toolName} result again`}
                    onClick={() =>
                      move.files.length === 1
                        ? downloadBlob(move.files[0].blob, move.files[0].name)
                        : downloadZip(move.files, "krea-files.zip")
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded text-muted hover:text-lime"
                  >
                    <Download aria-hidden className="size-4" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="mt-auto flex gap-2 text-xs leading-relaxed text-muted">
        <Plane aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        Tip: i-on ang airplane mode. Krea still works because nothing is sent anywhere.
      </p>
    </div>
  );
}
