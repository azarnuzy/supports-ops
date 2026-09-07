import { randomBytes } from "node:crypto";

export const defaultBotName = "Support Bot";
export const defaultWelcomeMessage = "Hi! How can we help you today?";
export const defaultPrimaryColor = "#2563eb";

export function generateWidgetKey() {
  return `widget_${randomBytes(16).toString("hex")}`;
}
