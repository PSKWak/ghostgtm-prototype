import type { Fact } from "@/lib/engine/types";
import type * as t from "./schema";

export const toFact = (r: typeof t.facts.$inferSelect): Fact => ({
  id: r.id,
  accountId: r.accountId,
  key: r.key,
  value: r.value,
  source: r.source,
  sourceRef: r.sourceRef,
  observedAt: r.observedAt.toISOString(),
  supersededBy: r.supersededBy,
  supersededReason: r.supersededReason,
});
