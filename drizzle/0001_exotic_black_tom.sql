ALTER TABLE "edits" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "edits" ALTER COLUMN "severity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "edits" ALTER COLUMN "method" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "edits" ADD COLUMN "claim_id" text;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "payload" jsonb NOT NULL;