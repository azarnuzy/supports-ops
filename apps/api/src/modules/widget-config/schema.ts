import { z } from "zod";

const domainPattern =
  /^(?:localhost|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63})(?::\d{1,5})?$/;

const domainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(253)
  .refine((value) => domainPattern.test(value), {
    message: "Enter a valid domain, e.g. example.com.",
  });

const closingMessageSchema = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }

  return value;
}, z.string().trim().max(1000).nullable());

export const updateWebWidgetConfigSchema = z.object({
  botName: z.string().trim().min(1).max(60),
  welcomeMessage: z.string().trim().min(1).max(500),
  primaryColor: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Enter a hex color, e.g. #2563eb."),
  closingMessage: closingMessageSchema,
  allowedDomains: z
    .array(domainSchema)
    .max(20)
    .transform((domains) => Array.from(new Set(domains))),
  logoKey: z.string().nullable().optional(),
});

export type UpdateWebWidgetConfigInput = z.infer<typeof updateWebWidgetConfigSchema>;

export const uploadWebWidgetLogoSchema = z.object({
  file: z.instanceof(File),
});

export type UploadWebWidgetLogoInput = z.infer<typeof uploadWebWidgetLogoSchema>;
