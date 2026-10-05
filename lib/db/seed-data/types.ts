import type { FactSource } from "@/lib/engine/types";
import type { TranscriptLine } from "../schema";

export type SeedFact = {
  id: string;
  key: string;
  value: string | null;
  source: FactSource;
  sourceRef: string;
  observedAt: string;
};

export type SeedAccount = {
  account: { id: string; name: string; domain: string; scenario: string };
  contacts: { id: string; name: string; email: string; title: string; isExecutive: boolean }[];
  call: { id: string; occurredAt: string; transcript: TranscriptLine[] };
  facts: SeedFact[];
};
