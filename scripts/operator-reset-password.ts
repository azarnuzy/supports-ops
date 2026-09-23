import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { questionHidden, assertPassword } from "./operator-prompts";
import { disconnectOperatorDb, normalizeEmail, resetOperatorPassword } from "./operator-utils";

const rl = createInterface({ input, output });
try {
  const email = normalizeEmail(await rl.question("Email: "));
  const password = await questionHidden(rl, "New password: ");
  const confirmation = await questionHidden(rl, "Confirm new password: ");
  if (!email) throw new Error("Email is required.");
  assertPassword(password, confirmation);
  await resetOperatorPassword(email, password);
  output.write(`Operator password reset: ${email}\n`);
} catch (error) {
  output.write(`Error: ${error instanceof Error ? error.message : "Failed to reset Operator password."}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
  await disconnectOperatorDb();
}
