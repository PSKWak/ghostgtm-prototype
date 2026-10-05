"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// "Real only" toggle and the active prompt version (used by the next generated draft).
export function ConsoleControls({ realOnly, active, versions }: { realOnly: boolean; active: string; versions: string[] }) {
  const router = useRouter();
  async function switchTo(version: string) {
    const res = await fetch("/api/settings/prompt-version", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ version }) });
    if (!res.ok) return toast.error("Could not switch prompt version");
    toast.success(`New drafts now use ${version}`);
    router.refresh();
  }
  const tab = (on: boolean, label: string, href: string) => (
    <Link href={href} aria-pressed={on} className={cn("rounded-md px-2.5 py-1 text-sm", on ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>{label}</Link>
  );
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1 rounded-lg border p-0.5" role="group" aria-label="Data shown">
        {tab(realOnly, "Real only", "/evals?real=1")}{tab(!realOnly, "Real + synthetic", "/evals?real=0")}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Prompt for new drafts</span>
        <select aria-label="Active prompt version" value={active} onChange={(e) => switchTo(e.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm">
          {versions.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </label>
    </div>
  );
}
