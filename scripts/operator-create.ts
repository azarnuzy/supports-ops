import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { questionHidden, assertPassword } from "./operator-prompts";
import { createOperator, disconnectOperatorDb, normalizeEmail } from "../apps/api/src/modules/operator/provisioning";

const rl = createInterface({ input, output });
try {
  const email = normalizeEmail(await rl.question("Email: "));
  const password = await questionHidden(rl, "Password: ");
  const confirmation = await questionHidden(rl, "Confirm password: ");
  if (!email) throw new Error("Email is required.");
  assertPassword(password, confirmation);
  await createOperator(email, password);
  output.write(`Operator created: ${email}\n`);
} catch (error) {
  output.write(`Error: ${error instanceof Error ? error.message : "Failed to create Operator."}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
  await disconnectOperatorDb();
}
