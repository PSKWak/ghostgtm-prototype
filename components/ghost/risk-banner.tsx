import { CircleAlert, ShieldCheck, ShieldX } from "lucide-react";
import type { RiskExplanation } from "@/lib/flow/explain";
import { cn } from "@/lib/utils";

const STYLE = {
  ok: { icon: ShieldCheck, cls: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" },
  review: { icon: CircleAlert, cls: "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  held: { icon: ShieldX, cls: "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950 dark:text-red-200" },
};

export function RiskBanner({ risk }: { risk: RiskExplanation }) {
  const { icon: Icon, cls } = STYLE[risk.tone];
  return (
    <div className={cn("flex gap-2 rounded-lg border px-3 py-2 text-sm", cls)} role="status" data-testid="risk-banner">
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p><span className="font-semibold">{risk.headline}.</span> {risk.detail}</p>
    </div>
  );
}
