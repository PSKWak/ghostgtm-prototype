// Rule 10: synthetic work is never mixed silently with real work.
export function SyntheticBadge() {
  return (
    <span title="Synthetic walkthrough: produced by the real flows on a copy of the account, never counted as real"
      className="inline-flex rounded border border-dashed border-violet-400 bg-violet-50 px-1.5 text-[11px] font-semibold tracking-wide text-violet-800 dark:bg-violet-950 dark:text-violet-300">
      SYNTHETIC
    </span>
  );
}
