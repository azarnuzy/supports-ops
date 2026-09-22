import { stdout as output } from "node:process";
import {
  InvalidTopUpAmountError,
  WorkspaceNotFoundError,
  topUpBySlug,
} from "../apps/api/src/modules/credits/services";
import { unscopedPrisma as prisma } from "../apps/api/src/utils/prisma";

const [slug, creditsArg, note] = process.argv.slice(2);

try {
  if (!slug || !creditsArg || !note) {
    throw new Error('Usage: pnpm credits:top-up <workspace-slug> <credits> "<note>"');
  }

  const balance = await topUpBySlug(slug, Number(creditsArg), note);

  output.write(`Top-Up recorded. New balance for "${slug}": ${balance} Credits\n`);
} catch (error) {
  if (error instanceof WorkspaceNotFoundError) {
    output.write(`Error: no Workspace with slug "${slug}".\n`);
  } else if (error instanceof InvalidTopUpAmountError) {
    output.write("Error: credits must be a positive whole number.\n");
  } else {
    output.write(`Error: ${error instanceof Error ? error.message : "Top-Up failed."}\n`);
  }

  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
