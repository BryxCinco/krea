import { OG_SIZE, ogImage } from "@/lib/og";
import { categories, getTool, tools } from "@/tools/registry";

export const alt = "Krea tool";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const tool = getTool((await params).slug);
  const category = categories.find((entry) => entry.id === tool?.category)?.label ?? "Tool";
  return ogImage({ eyebrow: category, title: tool?.name ?? "Krea", subtitle: tool?.description ?? "Private file tools that run on your device." });
}
