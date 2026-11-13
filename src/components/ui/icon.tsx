/** Maps the registry's string icon keys to lucide line icons, so workers never import React. */
import {
  Combine,
  Crop,
  Eraser,
  FileImage,
  FileOutput,
  IdCard,
  Repeat2,
  Scaling,
  Shrink,
  Split,
  type LucideIcon,
} from "lucide-react";
import type { IconKey } from "@/tools/types";

const icons: Record<IconKey, LucideIcon> = {
  compress: Shrink,
  resize: Scaling,
  crop: Crop,
  convert: Repeat2,
  cutout: Eraser,
  id: IdCard,
  merge: Combine,
  split: Split,
  "pdf-to-image": FileImage,
  "image-to-pdf": FileOutput,
};

export function ToolIcon({ name, className }: { name: IconKey; className?: string }) {
  const Icon = icons[name];
  return <Icon aria-hidden className={className ?? "size-4"} strokeWidth={1.75} />;
}
