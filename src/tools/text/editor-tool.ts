/**
 * Helper for "editor" tools (Text & Docs). They do not transform files on the
 * Stage: their UI is a self-contained editor (src/components/stage/editors)
 * that keeps its data in localStorage. This fills in the file-tool fields so
 * they never show up as Moves or chain steps.
 */
import { KreaError, type Tool, type ToolCategory } from "../types";

type EditorMeta = Pick<Tool, "id" | "slug" | "name" | "verb" | "description" | "seoTitle" | "seoDescription" | "howTo" | "faqs" | "icon">;

/** Editors live under "Text & Docs" unless they belong with another family (the Signature Maker is an image tool). */
export function editorTool(meta: EditorMeta, category: ToolCategory = "text"): Tool {
  return {
    ...meta,
    kind: "editor",
    category,
    accepts: [],
    output: "data",
    worker: "image",
    input: "each",
    notChainable: "This is an editor, not a file Move.",
    fields: [],
    async run() {
      throw new KreaError("failed", `${meta.name} works in its own editor on its tool page.`);
    },
  };
}
