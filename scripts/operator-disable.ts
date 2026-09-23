import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import {
  disableOperator,
  disconnectOperatorDb,
  normalizeEmail,
} from "../apps/api/src/modules/operator/provisioning";

const rl = createInterface({ input, output });
try {
  const email = normalizeEmail(await rl.question("Email: "));
  if (!email) throw new Error("Email is required.");
  await disableOperator(email);
  output.write(`Operator disabled: ${email}\n`);
} catch (error) {
  output.write(
    `Error: ${error instanceof Error ? error.message : "Failed to disable Operator."}\n`,
  );
  process.exitCode = 1;
} finally {
  rl.close();
  await disconnectOperatorDb();
}
