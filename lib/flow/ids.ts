import { randomUUID } from "node:crypto";

// Short prefixed ids ("wf_3f9a2c1b") are readable in the UI and in logs.
export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 8)}`;
