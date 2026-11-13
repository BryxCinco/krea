import { ToolCardSkeleton } from "@/components/ui/tool-card";

/** Skeleton shown while the All Tools page streams in. */
export default function ToolsLoading() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 lg:px-8 lg:py-14" aria-busy="true" aria-label="Loading tools">
      <div className="skeleton h-12 w-56 rounded-md" />
      <div className="skeleton mt-4 h-5 w-80 max-w-full rounded" />
      <div className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 8 }, (_, index) => (
          <ToolCardSkeleton key={index} />
        ))}
      </div>
    </div>
  );
}
