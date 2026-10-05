// Display helpers shared by server and client so both render the same text (no hydration drift).

const ACRONYMS: Record<string, string> = { arr: "ARR", icp: "ICP", crm: "CRM" };

export function factLabel(key: string): string {
  const words = key.split("_").map((w) => ACRONYMS[w] ?? w);
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

const WHEN = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const formatWhen = (iso: string) => `${WHEN.format(new Date(iso))} UTC`;

export const pct = (v: number) => `${Math.round(v * 100)}%`;

// "78% (14/18)" — a rate is never shown without its numerator and denominator.
export const rateText = (value: number | null, k: number, n: number) => (value === null ? null : `${pct(value)} (${k}/${n})`);

// Intervals matter most for small samples; above 100 they add noise, not information.
export const ciText = (ci: [number, number] | undefined, n: number) => (ci && n > 0 && n < 100 ? `95% CI ${pct(ci[0])}–${pct(ci[1])}` : null);
