import { expect, test } from "@playwright/test";

const agentEmail = "agent@demo.supportops.dev";
const agentPassword = "DemoAgent123!";
const fixtureCustomerName = "E2E Fixture Customer";
const fixtureCustomerMessage = "I can't log into my account anymore, can someone help?";

test.describe("Mine Ticket workspace", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/login");
    await page.getByLabel("Email address").fill(agentEmail);
    await page.getByLabel("Password").fill(agentPassword);
    await page.getByRole("button", { name: "Login" }).click();
    await page.waitForURL((url) => url.pathname === "/");
  });

  test("selects an owned Ticket, replies, and resolves it", async ({ page }) => {
    await page.goto("/chat");

    // Entering a populated Mine scope selects the first Ticket and reflects
    // it in the URL, so a refresh preserves the selection.
    await expect(page).toHaveURL(/\/chat\/tickets\/.+/);
    await expect(page.getByText(fixtureCustomerName).first()).toBeVisible();
    await expect(page.getByText(fixtureCustomerMessage)).toBeVisible();

    const ticketUrl = page.url();
    await page.reload();
    await expect(page).toHaveURL(ticketUrl);
    await expect(page.getByText(fixtureCustomerMessage)).toBeVisible();

    // Requesting a Suggested Reply stays explicit and editable, never sent
    // automatically — this only asserts the control is present and does
    // not depend on a configured AI Copilot key.
    await expect(page.getByRole("button", { name: /Suggest reply/i })).toBeEnabled();

    // Send a real text reply.
    const replyText = `E2E reply ${Date.now()}`;
    await page.getByLabel("Reply to Customer").fill(replyText);
    await page.getByRole("button", { name: "Send reply" }).click();
    await expect(page.getByText(replyText)).toBeVisible();
    await expect(page.getByLabel("Reply to Customer")).toHaveValue("");

    // Resolution requires confirmation and leaves the transcript read-only.
    await page.getByRole("button", { name: "Resolve Ticket" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Resolve" }).click();
    await expect(
      page.getByText("This Ticket is resolved. The transcript is read-only."),
    ).toBeVisible();
    await expect(page.getByLabel("Reply to Customer")).not.toBeVisible();
  });
});
