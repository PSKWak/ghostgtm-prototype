# Experiments

Each experiment is pre-registered here **before its first run**: hypothesis, metric,
pass bar, and ground-truth labels (`<name>.labels.json`). Do not edit a pre-registration
or its labels after seeing results; create `<name>.v2.md` instead.

| File | Status | Labels |
| --- | --- | --- |
| [grounding.md](grounding.md) | measured | `grounding.labels.json` (12 hand-labeled drafts for the judge audit) |
| [feedback.md](feedback.md) | measured | `feedback.labels.json` (17 cases) |
| [autonomy.md](autonomy.md) | simulated | `autonomy.labels.json` (60 synthetic actions) |
| [references.md](references.md) | designed | none: needs live reps |
| [attribution.md](attribution.md) | designed | none: needs real outcomes |

**Label provenance.** The v1 labels were drafted by the coding agent from the seed scenarios.
A human must review them before they are committed. Set `reviewedBy` in each file when that is done.
