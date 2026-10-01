import { useState } from "react";

/** Keep long content readable without stretching a list row or hiding the original. */
export function MessageText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 240;
  return (
    <div className="min-w-0 text-sm">
      <p className="max-h-80 overflow-auto whitespace-pre-wrap [overflow-wrap:anywhere]">
        {long && !expanded ? `${text.slice(0, 240)}…` : text}
      </p>
      {long && (
        <button
          type="button"
          aria-expanded={expanded}
          className="mt-1 rounded text-xs font-medium text-primary underline underline-offset-4 focus-visible:outline-2"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : "Read full text"}
        </button>
      )}
    </div>
  );
}
