import { expect, test } from "@playwright/test";

test("Brightline: context → draft → edit → confirm → sent → logged → learned → next draft is right", async ({ page, request }) => {
  expect((await request.post("/api/demo/reset")).ok()).toBe(true);

  // Context: the CRM date wins by standing but is flagged as challenged by the call.
  await page.goto("/workspace?account=acct_brightline");
  await expect(page.getByTestId("fact-renewal_date")).toHaveText("March 31, 2027");
  await expect(page.locator('[data-fact-key="renewal_date"]')).toContainText("Newer evidence says December 31, 2026");

  // Draft: lands in Slack, held for a human with a plain-language reason.
  await page.getByRole("button", { name: "Draft follow-up" }).click();
  await expect(page).toHaveURL(/\/slack\?wf=/);
  const card = page.getByTestId("approval-card").first();
  await expect(card).toHaveAttribute("data-state", "awaiting_approval");
  await expect(card.getByTestId("risk-banner")).toContainText("a call on 2026-10-01 said December 31, 2026");

  // Decide: fix the date inline, confirm the correction, send.
  await card.getByRole("button", { name: "Edit", exact: true }).click();
  await card.getByLabel("Edit sentence renewal").fill("I have your renewal down for December 31, 2026.");
  await card.getByRole("button", { name: "Approve edited & send" }).click();
  await expect(page.getByTestId("proposals")).toContainText("March 31, 2027");
  await expect(page.getByTestId("proposals")).toContainText("December 31, 2026");
  await page.getByRole("button", { name: "Confirm & send" }).click();

  // Executed and learned.
  await expect(card).toHaveAttribute("data-state", "completed");
  await expect(card.getByTestId("regression-test")).toContainText("passing");
  await expect(card.locator('[data-step="learned"]')).toHaveAttribute("data-status", "done");

  // CRM: email, note and task, all simulated and hash-checked.
  await page.goto("/crm");
  const timeline = page.getByTestId("crm-timeline");
  for (const action of ["send_email", "log_crm_activity", "create_crm_task"]) {
    await expect(timeline.locator(`[data-action="${action}"]`)).toContainText("SIMULATED");
    await expect(timeline.locator(`[data-action="${action}"]`)).toContainText("matches approved version");
  }
  await expect(timeline.locator('[data-action="send_email"]')).toContainText("December 31, 2026");

  // Evals: the decision and the regression test are rows.
  await page.goto("/evals");
  await expect(page.getByTestId("decision-log")).toContainText("approved edited");
  await expect(page.getByTestId("regression-tests")).toContainText("pass");

  // Validated learning: the graph changed, so the next draft is right with no edit.
  await page.goto("/workspace?account=acct_brightline");
  await expect(page.getByTestId("fact-renewal_date")).toHaveText("December 31, 2026");
  await page.getByRole("button", { name: "Draft follow-up" }).click();
  const next = page.getByTestId("approval-card").first();
  await expect(next).toContainText("I have your renewal down for December 31, 2026.");
  await expect(next.getByTestId("risk-banner")).not.toContainText("conflicts");
});
