import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { unscopedPrisma as prisma } from "../../utils/prisma";

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export async function createOperator(email: string, password: string) {
  const existing = await prisma.operator.findUnique({ where: { email } });
  if (existing) throw new Error("An Operator with this email already exists.");

  const id = randomUUID();
  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.operator.create({ data: { id, email, name: email } }),
    prisma.operatorAccount.create({
      data: { id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash },
    }),
  ]);
}

export async function disableOperator(email: string) {
  const operator = await prisma.operator.findUnique({ where: { email }, select: { id: true } });
  if (!operator) throw new Error("Operator not found.");

  await prisma.$transaction([
    prisma.operator.update({ where: { id: operator.id }, data: { disabledAt: new Date() } }),
    prisma.operatorSession.deleteMany({ where: { userId: operator.id } }),
  ]);
}

export async function resetOperatorPassword(email: string, password: string) {
  const operator = await prisma.operator.findUnique({ where: { email }, select: { id: true } });
  if (!operator) throw new Error("Operator not found.");

  const passwordHash = await hashPassword(password);
  await prisma.$transaction([
    prisma.operatorAccount.updateMany({
      where: { providerId: "credential", userId: operator.id },
      data: { password: passwordHash },
    }),
    prisma.operatorSession.deleteMany({ where: { userId: operator.id } }),
  ]);
}

export async function disconnectOperatorDb() {
  await prisma.$disconnect();
}
