"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/workspace", label: "Workspace", hint: "Context" },
  { href: "/slack", label: "Slack", hint: "Approve" },
  { href: "/crm", label: "CRM", hint: "Executed" },
  { href: "/evals", label: "Evals", hint: "Learned" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="flex items-center gap-1 text-sm">
      {NAV.map((n, i) => {
        const active = path.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}
            className={cn("rounded-md px-2.5 py-1.5 transition-colors", active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground")}>
            <span className="mr-1 text-xs text-muted-foreground">{i + 1}</span>{n.label}
            <span className="ml-1 hidden text-xs text-muted-foreground md:inline">· {n.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
