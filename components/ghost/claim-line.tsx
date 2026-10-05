import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ClaimView } from "@/lib/db/views/workflows";
import { cn } from "@/lib/utils";
import { SourceBadge } from "./source-badge";

const DOT = { supported: "bg-emerald-500", partial: "bg-amber-500", none: "bg-red-500", stale: "bg-red-500" };

// One sentence of a draft with its evidence: hover a number to see the fact behind it.
export function ClaimLine({ claim }: { claim: ClaimView }) {
  if (!claim.factual) return <span>{claim.sentence} </span>;
  return (
    <span className="group" data-claim={claim.id}>
      {claim.label && <span title={`${claim.label}: ${claim.reason ?? ""}`} className={cn("mr-1 inline-block size-1.5 -translate-y-0.5 rounded-full", DOT[claim.label])} />}
      {claim.sentence}
      {claim.citations.map((c, i) => (
        <Tooltip key={c.factId}>
          <TooltipTrigger render={<sup className="ml-0.5 cursor-help rounded bg-muted px-1 text-[10px] font-semibold text-muted-foreground hover:bg-primary hover:text-primary-foreground" />}>
            {i + 1}
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <div className="space-y-1 text-left">
              <div className="flex items-center gap-1.5"><SourceBadge source={c.source} /><span className="font-medium">{c.label}</span></div>
              <div>{c.value}</div>
              <div className="opacity-70">{c.sourceRef} · {c.observedAt}</div>
            </div>
          </TooltipContent>
        </Tooltip>
      ))}{" "}
    </span>
  );
}
