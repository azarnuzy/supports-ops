import type { WidgetBotIconProps } from "./index.types";

// Mirrors the headset glyph apps/widget renders in the panel header and welcome screen.
export default function WidgetBotIcon({ className }: WidgetBotIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M7 9.5A5 5 0 0 1 17 9.5V11h1.5A2.5 2.5 0 0 1 21 13.5v4A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-4A2.5 2.5 0 0 1 5.5 11H7V9.5Zm2 1.5h6V9.5a3 3 0 0 0-6 0V11Zm-.75 4.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Zm7.5 0a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5Z" />
    </svg>
  );
}
