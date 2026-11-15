/**
 * Worker for the Text Toolkit. Long texts and user-written regular expressions can
 * take a while (or, with a badly written pattern, forever), so they never run on the page.
 */
import { runTextOp, type TextOp, type TextOpResult } from "@/tools/text/text-toolkit";

export type TextWorkerRequest = { id: number } & TextOp;
export type TextWorkerResponse = { id: number; ok: true; result: TextOpResult } | { id: number; ok: false; message: string };

self.onmessage = (event: MessageEvent<TextWorkerRequest>) => {
  const { id, ...request } = event.data;
  try {
    const response: TextWorkerResponse = { id, ok: true, result: runTextOp(request as TextOp) };
    self.postMessage(response);
  } catch (error) {
    const response: TextWorkerResponse = { id, ok: false, message: error instanceof Error ? error.message : "Failed" };
    self.postMessage(response);
  }
};
