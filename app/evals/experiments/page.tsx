import Link from "next/link";
import { ExperimentCard } from "@/components/evals/experiment-card";
import { getDb } from "@/lib/db/client";
import { loadExperimentCards } from "@/lib/db/views/experiments";

export const dynamic = "force-dynamic";

export default async function Experiments() {
  const { cards, llmMode } = await loadExperimentCards(await getDb());
  return (
    <div className="space-y-6">
      <div>
        <Link className="text-sm text-primary hover:underline" href="/evals">← Evals Console</Link>
        <h1 className="text-xl font-semibold">Experiments</h1>
        <p className="text-sm text-muted-foreground">
          Each compares a baseline with our method on the same cases. Improvements are claimed only when 95% intervals don&apos;t overlap; a loss is reported as a loss.
        </p>
      </div>
      <div className="space-y-4">{cards.map((c) => <ExperimentCard key={c.id} card={c} llmMode={llmMode} />)}</div>
    </div>
  );
}
