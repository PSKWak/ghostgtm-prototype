import { z } from "zod";
import grounding from "@/experiments/grounding.labels.json";
import feedback from "@/experiments/feedback.labels.json";
import autonomy from "@/experiments/autonomy.labels.json";
import { ACTIONS, EDIT_CATEGORIES, FIX_ROUTES, REJECT_REASONS, SUPPORT_LABELS } from "@/lib/engine/types";

// Pre-registered ground truth, parsed once so runners never read untyped JSON.

const groundingClaim = z.union([
  z.object({ sentence: z.string(), factIds: z.array(z.string()), label: z.enum(SUPPORT_LABELS), factual: z.literal(true).optional(), why: z.string().optional() }),
  z.object({ sentence: z.string(), factIds: z.array(z.string()).length(0), label: z.null(), factual: z.literal(false) }),
]);

export const GroundingLabels = z.object({
  version: z.number(),
  drafts: z.array(z.object({ id: z.string(), accountId: z.string(), claims: z.array(groundingClaim) })),
});

const feedbackBase = { id: z.string(), accountId: z.string(), expectedRoute: z.enum(FIX_ROUTES), expectsProposal: z.boolean() };
export const FeedbackLabels = z.object({
  version: z.number(),
  cases: z.array(z.discriminatedUnion("kind", [
    z.object({ ...feedbackBase, kind: z.literal("edit"), claimFactIds: z.array(z.string()), before: z.string(), after: z.string(), expectedCategory: z.enum(EDIT_CATEGORIES) }),
    z.object({ ...feedbackBase, kind: z.literal("reject"), rejectReason: z.enum(REJECT_REASONS), note: z.string() }),
  ])),
});

export const AutonomyLabels = z.object({
  version: z.number(),
  isSynthetic: z.literal(true),
  policyTrustLevel: z.number(),
  actions: z.array(z.object({
    id: z.string(), action: z.enum(ACTIONS), accountId: z.string(), to: z.string().nullable(), exec: z.boolean(),
    claims: z.array(z.enum(SUPPORT_LABELS)), contested: z.boolean(), challenged: z.boolean(), escalation: z.boolean(),
    text: z.string(), confidence: z.number().min(0).max(1), critical: z.boolean(), needsHuman: z.boolean(), why: z.string().optional(),
  })),
});

export const loadGroundingLabels = () => GroundingLabels.parse(grounding);
export const loadFeedbackLabels = () => FeedbackLabels.parse(feedback);
export const loadAutonomyLabels = () => AutonomyLabels.parse(autonomy);
