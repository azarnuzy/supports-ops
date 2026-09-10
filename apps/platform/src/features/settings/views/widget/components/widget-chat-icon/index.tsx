import type { WidgetChatIconProps } from "./index.types";

// Mirrors apps/widget's genericIcon() so the header avatar and launcher fallback
// match the real widget pixel-for-pixel.
export default function WidgetChatIcon({ className }: WidgetChatIconProps) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2h11A2.5 2.5 0 0 1 20 4.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4.4A2.5 2.5 0 0 1 4 12.5z" />
    </svg>
  );
}
