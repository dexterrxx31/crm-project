import { expect, test } from "@playwright/test";

/**
 * The one end-to-end path that has to work: sign up, build out a minimal
 * account → contact → deal chain, move the deal on the board, and confirm
 * the agent chat responds to something.
 *
 * The agent step doesn't assert on model output — CI runs without
 * `ANTHROPIC_API_KEY` — it asserts the chat pipeline degrades the way
 * `lib/ai/client.ts` promises: a clear "not configured" message, not a
 * silent failure. If a real key is present, an actual answer satisfies the
 * same assertion.
 */
test("signup → account → contact → deal → move stage → ask the agent", async ({ page }) => {
  const runId = Date.now();
  const email = `e2e-${runId}@example.com`;

  await page.goto("/signup");
  await page.getByLabel("Your name").fill("E2E Test User");
  await page.getByLabel("Organization").fill(`E2E Org ${runId}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("e2e-test-password");
  await page.getByRole("button", { name: "Create account" }).click();

  await expect(page).toHaveURL("/dashboard");
  await expect(page.getByText("Good to see you", { exact: false })).toBeVisible();

  // --- Account ---------------------------------------------------------
  await page.goto("/accounts");
  await page.getByRole("button", { name: "New account", exact: true }).click();
  await page.getByLabel("Account name").fill("Acme Rockets");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Account created")).toBeVisible();
  await expect(page.getByText("Acme Rockets", { exact: true })).toBeVisible();

  // --- Contact -----------------------------------------------------------
  await page.goto("/contacts");
  await page.getByRole("button", { name: "New contact", exact: true }).click();
  await page.getByLabel("First name").fill("Wile");
  await page.getByLabel("Last name").fill("Coyote");
  await page.getByLabel("Account").click();
  await page.getByRole("option", { name: "Acme Rockets" }).click();
  await page.getByRole("button", { name: "Create contact" }).click();
  await expect(page.getByText("Contact created")).toBeVisible();
  await expect(page.getByText("Wile Coyote", { exact: true })).toBeVisible();

  // --- Deal ----------------------------------------------------------------
  await page.goto("/deals?view=board");
  await page.getByRole("button", { name: "New deal", exact: true }).click();
  await page.getByLabel("Deal name").fill("Rocket Skates Renewal");
  await page.getByLabel("Account").click();
  await page.getByRole("option", { name: "Acme Rockets" }).click();
  await page.getByRole("button", { name: "Create deal" }).click();
  await expect(page.getByText("Deal created")).toBeVisible();

  const card = page.getByText("Rocket Skates Renewal", { exact: true });
  await expect(card).toBeVisible();

  // --- Move stage: drag the card from Qualification into Discovery -------
  const qualification = page.locator('section[aria-label="Qualification"]');
  const discovery = page.locator('section[aria-label="Discovery"]');
  await expect(card).toBeVisible();
  await expect(qualification.getByText("Rocket Skates Renewal")).toBeVisible();

  const cardBox = await card.boundingBox();
  const targetBox = await discovery.boundingBox();
  if (!cardBox || !targetBox) throw new Error("Could not measure drag source/target");

  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  // dnd-kit's PointerSensor needs to see movement past its activation
  // distance before it starts tracking the drag — a few small steps first,
  // then the real move to the target column.
  await page.mouse.move(cardBox.x + cardBox.width / 2 + 15, cardBox.y + cardBox.height / 2, {
    steps: 5,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 15,
  });
  await page.mouse.up();

  await expect(discovery.getByText("Rocket Skates Renewal")).toBeVisible();
  await expect(qualification.getByText("Rocket Skates Renewal")).toHaveCount(0);

  // --- Ask the agent -------------------------------------------------------
  // The trigger is a Radix Sheet — retried because clicking it in the
  // instant right after a client-side transition can land before its event
  // listener has attached, silently no-opping the first click.
  const chatInput = page.getByPlaceholder("Ask about your pipeline…");
  await expect(async () => {
    await page.getByRole("button", { name: "Ask Synapse" }).click();
    await expect(chatInput).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 15_000 });

  await chatInput.fill("What deals are closing this month?");
  await page.getByRole("button", { name: "Send", exact: true }).click();

  const notConfigured = page.getByText(/AI features are not configured/i);
  const assistantReply = page.locator(".mr-8.whitespace-pre-wrap");
  await expect(notConfigured.or(assistantReply).first()).toBeVisible({ timeout: 30_000 });
});
