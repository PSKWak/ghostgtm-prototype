// Display helpers shared by server and client so both render the same text (no hydration drift).

const ACRONYMS: Record<string, string> = { arr: "ARR", icp: "ICP", crm: "CRM" };

export function factLabel(key: string): string {
  const words = key.split("_").map((w) => ACRONYMS[w] ?? w);
  const [first = "", ...rest] = words;
  return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(" ");
}

const WHEN = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const formatWhen = (iso: string) => `${WHEN.format(new Date(iso))} UTC`;
