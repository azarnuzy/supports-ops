import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { betterAuthConfig, toolEncryptionConfig } from "../../config";
import { isUniqueConstraintError, prisma } from "../../utils/prisma";
import { requireWorkspaceId } from "../../utils/workspace-context";
import { decryptToolSecret, encryptToolSecret } from "../tools/secrets";
import type { ReplaceWhatsAppCredentialsInput, VerifyWhatsAppConfigInput } from "./schema";

export class InvalidWhatsAppCredentialsError extends Error {}
export class WhatsAppAlreadyConnectedError extends Error {}
export class PhoneNumberAlreadyConnectedError extends Error {}
export class WhatsAppConfigNotFoundError extends Error {}

type MetaPhoneNumber = { id: string; display_phone_number?: string; verified_name?: string };

export async function verifyMetaCredentials(
  input: VerifyWhatsAppConfigInput,
  request: typeof fetch = fetch,
): Promise<MetaPhoneNumber> {
  const url = new URL(
    `https://graph.facebook.com/v23.0/${encodeURIComponent(input.businessAccountId)}/phone_numbers`,
  );
  url.searchParams.set("fields", "id,display_phone_number,verified_name");
  url.searchParams.set("limit", "100");
  url.searchParams.set(
    "appsecret_proof",
    createHmac("sha256", input.appSecret).update(input.accessToken).digest("hex"),
  );

  let response: Response;
  try {
    response = await request(url, {
      headers: { authorization: `Bearer ${input.accessToken}` },
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new InvalidWhatsAppCredentialsError(
      "Meta could not be reached. Check your connection and try again.",
    );
  }

  if (!response.ok) {
    throw new InvalidWhatsAppCredentialsError(
      "Meta rejected these credentials. Check the access token, App Secret, and WhatsApp Business Account ID.",
    );
  }

  const body = (await response.json()) as { data?: MetaPhoneNumber[] };
  const phone = body.data?.find(({ id }) => id === input.phoneNumberId);
  if (!phone) {
    throw new InvalidWhatsAppCredentialsError(
      "That Phone Number ID does not belong to this WhatsApp Business Account.",
    );
  }
  return phone;
}

export async function getWhatsAppConfig() {
  const config = await prisma.whatsAppConfig.findFirst({
    include: { channel: { select: { status: true } } },
  });
  return { whatsAppConfig: config ? toDto(config) : null };
}

export async function connectWhatsApp(input: VerifyWhatsAppConfigInput) {
  if (await prisma.whatsAppConfig.findFirst({ select: { id: true } })) {
    throw new WhatsAppAlreadyConnectedError("This Workspace already has a WhatsApp Channel.");
  }

  const phone = await verifyMetaCredentials(input);
  const aiAgent = await prisma.aiAgent.findFirst({ select: { id: true } });
  if (!aiAgent) throw new Error("This Workspace has no AI Agent.");

  const workspaceId = requireWorkspaceId();
  const channelId = randomUUID();
  try {
    const [, config] = await prisma.$transaction([
      prisma.channel.create({
        data: {
          aiAgentId: aiAgent.id,
          id: channelId,
          name: "WhatsApp",
          type: "WHATSAPP",
          workspaceId,
        },
      }),
      prisma.whatsAppConfig.create({
        data: {
          accessTokenEncrypted: encryptToolSecret(
            input.accessToken,
            toolEncryptionConfig.masterKey,
          ),
          accessTokenLastFour: input.accessToken.slice(-4),
          appSecretEncrypted: encryptToolSecret(input.appSecret, toolEncryptionConfig.masterKey),
          businessAccountId: input.businessAccountId,
          channelId,
          displayPhoneNumber: phone.display_phone_number ?? input.phoneNumberId,
          id: randomUUID(),
          phoneNumberId: input.phoneNumberId,
          verifiedAt: new Date(),
          verifiedName: phone.verified_name,
          verifyToken: randomBytes(32).toString("base64url"),
          workspaceId,
        },
        include: { channel: { select: { status: true } } },
      }),
    ]);
    return { whatsAppConfig: toDto(config) };
  } catch (error) {
    if (isUniqueConstraintError(error, "phoneNumberId")) {
      throw new PhoneNumberAlreadyConnectedError(
        "That phone number is already connected to another Workspace.",
      );
    }
    if (isUniqueConstraintError(error, "workspaceId") || isUniqueConstraintError(error, "type")) {
      throw new WhatsAppAlreadyConnectedError("This Workspace already has a WhatsApp Channel.");
    }
    throw error;
  }
}

export async function setWhatsAppEnabled(enabled: boolean) {
  const config = await prisma.whatsAppConfig.findFirst({ select: { channelId: true } });
  if (!config) throw new WhatsAppConfigNotFoundError();
  await prisma.channel.update({
    data: { status: enabled ? "ACTIVE" : "INACTIVE" },
    where: { id: config.channelId },
  });
  return getWhatsAppConfig();
}

export async function replaceWhatsAppCredentials(input: ReplaceWhatsAppCredentialsInput) {
  const current = await prisma.whatsAppConfig.findFirst({
    select: {
      appSecretEncrypted: true,
      businessAccountId: true,
      id: true,
      phoneNumberId: true,
    },
  });
  if (!current) throw new WhatsAppConfigNotFoundError();

  const appSecret =
    input.appSecret ??
    decryptToolSecret(current.appSecretEncrypted, toolEncryptionConfig.masterKey);
  const phone = await verifyMetaCredentials({
    accessToken: input.accessToken,
    appSecret,
    businessAccountId: current.businessAccountId,
    phoneNumberId: current.phoneNumberId,
  });

  const config = await prisma.whatsAppConfig.update({
    data: {
      accessTokenEncrypted: encryptToolSecret(input.accessToken, toolEncryptionConfig.masterKey),
      accessTokenFailedAt: null,
      accessTokenLastFour: input.accessToken.slice(-4),
      ...(input.appSecret
        ? { appSecretEncrypted: encryptToolSecret(input.appSecret, toolEncryptionConfig.masterKey) }
        : {}),
      displayPhoneNumber: phone.display_phone_number ?? current.phoneNumberId,
      verifiedAt: new Date(),
      verifiedName: phone.verified_name,
    },
    include: { channel: { select: { status: true } } },
    where: { id: current.id },
  });
  return { whatsAppConfig: toDto(config) };
}

function toDto(config: {
  accessTokenFailedAt: Date | null;
  accessTokenLastFour: string;
  businessAccountId: string;
  channel: { status: "ACTIVE" | "INACTIVE" };
  displayPhoneNumber: string;
  phoneNumberId: string;
  verifiedAt: Date;
  verifiedName: string | null;
  verifyToken: string;
  webhookVerifiedAt: Date | null;
}) {
  const enabled = config.channel.status === "ACTIVE";
  return {
    accessTokenLastFour: config.accessTokenLastFour,
    businessAccountId: config.businessAccountId,
    callbackUrl: `${betterAuthConfig.url.replace(/\/$/, "")}/webhooks/whatsapp`,
    displayPhoneNumber: config.displayPhoneNumber,
    enabled,
    health: !enabled
      ? ("DISABLED" as const)
      : config.accessTokenFailedAt
        ? ("TOKEN_INVALID" as const)
        : config.webhookVerifiedAt
          ? ("HEALTHY" as const)
          : ("AWAITING_WEBHOOK" as const),
    phoneNumberId: config.phoneNumberId,
    verifiedAt: config.verifiedAt,
    verifiedName: config.verifiedName,
    verifyToken: config.verifyToken,
  };
}
