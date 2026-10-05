# Grounding: claim-level evidence vs document-level citations (v1)

**Status:** measured · **Pre-registered:** 2026-10-04, before any `generate` run.

## Hypothesis
Generating with claim-level evidence (each sentence cites fact IDs, then per-claim `verify.ts`
with one retry) produces fewer unsupported factual claims than `generate@baseline`, which
receives the same facts but cites them once per draft (document-level).

## Arms
| Arm | Prompt | Verify |
| --- | --- | --- |
| baseline | `generate@baseline`: same facts, one "Sources:" list | none (claims labeled after the fact) |
| method | `generate@v1`: one citation list per sentence | `verifyDraft`, one retry on failure |

Same inputs (the 3 seed accounts and their fact history at seed time), same model,
temperature `EXPERIMENT_TEMPERATURE` (0), 10 runs per account per arm = **60 drafts**.

## Metric
`unsupported_claim_rate` = factual claims labeled `none` / factual claims, per arm.
The baseline has no per-sentence citations, so its claims are labeled by giving `verifyDraft`
every input fact ID for each sentence (the most generous reading of a document-level citation).

## Pass bar
The method's Wilson 95% upper bound is below the baseline's lower bound. Otherwise the card reads
"no measurable difference at n=…". If the method is worse, the card says so.

## Judge audit
`verify.ts` is the judge, so it is audited against `grounding.labels.json`: 12 hand-labeled
drafts (4 per account), each claim labeled supported / partial / none / stale by a human.
Report agreement as matching labels / labeled factual claims, with a confusion matrix.
Known blind spot, recorded here before measuring: a deterministic check cannot see an
unsupported **non-numeric** detail, such as "and our pen test results", when the citation is valid.
Several labeled claims test this on purpose.

## Grounding is not truth
Brightline's "renewal in March 2027" is *supported* (it matches the current CRM fact) and still
wrong in the world. Grounding measures fidelity to the graph; the feedback loop fixes the graph.
