# Feedback learning: taxonomy routing vs approve/reject only (v1)

**Status:** measured · **Pre-registered:** 2026-10-04, before classifier tuning.

## Hypothesis
Classifying each edit or rejection into the taxonomy and routing it with `routeFeedback`
sends more feedback to the correct fix location than the baseline, which sends every
piece of negative feedback to prompt review.

## Cases
`feedback.labels.json`: 17 labeled feedback events on the seed accounts (10 edits, 7 rejects).
Each has the expected category or reject reason, the expected route (graph | prompt | policy | log),
and whether a graph-correction proposal is expected.

## Arms
| Arm | Routing |
| --- | --- |
| baseline | every case → `prompt` |
| method | `classifyEdits` (rule) → LLM classifier for leftover spans → `routeFeedback` |

## Metrics
- `routing_accuracy` = cases routed to the expected route / 17.
- Graph corrections = cases producing a correct fact proposal / cases with `expectsProposal`.
- Also reported: `classifier_accuracy`, with a confusion matrix and every miss listed with its `method`.

## Pass bar
Method `routing_accuracy` Wilson interval does not overlap the baseline's. With n=17 this needs a
large gap. The baseline is right only on the 4 prompt-routed cases (4/17, Wilson [9.6%, 47.3%]),
so the method needs ≥13/17 (Wilson lower bound 52.7%). 12/17 overlaps and counts as no measurable difference.
