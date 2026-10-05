import { createHash } from "node:crypto";
import type { Draft } from "./types";

export const renderBody = (draft: Draft) => draft.claims.map((c) => c.sentence).join(" ");

// Whitespace is normalized so re-rendering cannot change the hash; any word change does.
export function hashDraft(draft: Draft): string {
  const canonical = JSON.stringify({
    subject: draft.subject.trim(),
    body: renderBody(draft).replace(/\s+/g, " ").trim(),
  });
  return createHash("sha256").update(canonical).digest("hex");
}
