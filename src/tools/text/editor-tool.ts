/**
 * Helper for "editor" tools (Text & Docs). They do not transform files on the
 * Stage: their UI is a self-contained editor (src/components/stage/editors)
 * that keeps its data in localStorage. This fills in the file-tool fields so
 * they never show up as Moves or chain steps.
 */
import { KreaError, type Tool } from "../types";

type EditorMeta = Pick<Tool, "id" | "slug" | "name" | "verb" | "description" | "seoTitle" | "seoDescription" | "howTo" | "faqs" | "icon">;

export function editorTool(meta: EditorMeta): Tool {
  return {
    ...meta,
    kind: "editor",
    category: "text",
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
