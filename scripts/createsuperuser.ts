import { stdin as input, stdout as output } from "node:process";
import { createInterface } from "node:readline/promises";
import { registerAdminWorkspace } from "../apps/api/src/modules/registration/services";
import { unscopedPrisma as prisma } from "../apps/api/src/utils/prisma";
import { questionHidden } from "./operator-prompts";

const rl = createInterface({ input, output });

try {
  const email = normalizeEmail(await rl.question("Email: "));
  const name = normalizeOptional(await rl.question("Name (optional): "));
  const password = await questionHidden(rl, "Password: ");
  const passwordConfirmation = await questionHidden(rl, "Confirm password: ");

  if (!email) {
    throw new Error("Email is required.");
  }

  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }

  if (password !== passwordConfirmation) {
    throw new Error("Passwords do not match.");
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });

  if (existingUser) {
    const user = await prisma.user.update({
      where: { id: existingUser.id },
      data: {
        ...(name ? { name } : {}),
        role: "ADMIN",
      },
    });

    output.write(`Admin user ready: ${user.email}. Existing password was not changed.\n`);
  } else {
    const { user } = await registerAdminWorkspace({
      email,
      name: name ?? email,
      password,
    });

    output.write(`Admin user ready: ${user.email}\n`);
  }
} catch (error) {
  const message = error instanceof Error ? error.message : "Failed to create admin user.";
  output.write(`Error: ${message}\n`);
  process.exitCode = 1;
} finally {
  rl.close();
  await prisma.$disconnect();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function normalizeOptional(value: string) {
  return value.trim() || null;
}
