"use client";

import { Clock, Download, Link2, Plane } from "lucide-react";
import { ChainsPanel, type ChainsPanelProps } from "@/components/chains/chains-panel";
import { downloadBlob, downloadZip } from "@/lib/download";
import { formatBytes } from "@/lib/file-type";
import { useSession } from "@/lib/session";
import { onTabListKeyDown } from "@/lib/use-focus-trap";

export type RailTab = "chains" | "recent";

/**
 * Side panel content: Render Chains, and Recent Moves for this session.
 * Results stay in memory so they can be downloaded again until the session is
 * wiped or the tab closes.
 */
export function Rail({ tab, onTab, chains }: { tab: RailTab; onTab: (tab: RailTab) => void; chains: ChainsPanelProps }) {
  const { recent } = useSession();
  const tabs: { id: RailTab; label: string; icon: typeof Clock }[] = [
    { id: "chains", label: "Chains", icon: Link2 },
    { id: "recent", label: "Recent", icon: Clock },
  ];

  return (
    <div className="flex h-full flex-col">
      <div role="tablist" onKeyDown={onTabListKeyDown} aria-label="Side panel" className="grid grid-cols-2 gap-1 border-b border-line p-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => onTab(id)}
            className={`flex min-h-10 items-center justify-center gap-2 rounded-md text-sm transition-colors ${
              tab === id ? "bg-raised font-semibold text-accent" : "text-muted hover:text-fg"
            }`}
          >
            <Icon aria-hidden className="size-4" strokeWidth={1.75} />
            {label}
            {id === "recent" && recent.length > 0 && <span className="font-mono text-[11px] text-muted">{recent.length}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" className="flex-1 overflow-y-auto p-4">
        {tab === "chains" ? (
          <ChainsPanel {...chains} />
        ) : recent.length === 0 ? (
          <p className="text-sm leading-relaxed text-muted">Wala pa. Finished Moves show up here so you can download them again.</p>
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
                      move.files.length === 1 ? downloadBlob(move.files[0].blob, move.files[0].name) : downloadZip(move.files, "krea-files.zip")
                    }
                    className="flex size-9 shrink-0 items-center justify-center rounded text-muted hover:text-accent"
                  >
                    <Download aria-hidden className="size-4" strokeWidth={1.75} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="flex gap-2 border-t border-line p-4 text-xs leading-relaxed text-muted">
        <Plane aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        Tip: i-on ang airplane mode. Krea still works because nothing is sent anywhere.
      </p>
    </div>
  );
}
