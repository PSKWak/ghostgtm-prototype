import type { FactSource } from "@/lib/engine/types";
import { cn } from "@/lib/utils";

const LABEL: Record<FactSource, string> = { human_approved: "Rep confirmed", crm_explicit: "CRM", ai_inferred: "Call", web: "Web" };
const TONE: Record<FactSource, string> = {
  human_approved: "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
  crm_explicit: "bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-900",
  ai_inferred: "bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-300 dark:border-violet-900",
  web: "bg-muted text-muted-foreground border-border",
};

export function SourceBadge({ source }: { source: FactSource }) {
  return <span className={cn("inline-flex rounded border px-1.5 text-[11px] font-medium", TONE[source])}>{LABEL[source]}</span>;
}
