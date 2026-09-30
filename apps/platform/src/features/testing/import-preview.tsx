import type { EvalImportPreview } from "@repo/api-client";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { AlertTriangleIcon } from "lucide-react";

/** Import preview: source-level error, explicit truncation, then per-row results. */
export function ImportPreviewPanel({ preview }: { preview: EvalImportPreview }) {
  const valid = preview.rows.filter((r) => r.case).length;
  return (
    <div aria-live="polite" className="grid gap-2">
      {preview.error && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Nothing to import</AlertTitle>
          <AlertDescription>{preview.error}</AlertDescription>
        </Alert>
      )}
      {preview.truncated && (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>Import truncated</AlertTitle>
          <AlertDescription>
            The source has {preview.truncated.total} rows. Only the first{" "}
            {preview.truncated.limit} will be saved; the rest are not imported.
          </AlertDescription>
        </Alert>
      )}
      {preview.rows.length > 0 && (
        <>
          <p className="text-sm">
            {valid} of {preview.rows.length} rows will be saved as draft cases. Drafts cannot be run
            until their expectations and metric are complete.
          </p>
          <ul className="grid max-h-60 gap-1 overflow-y-auto text-sm">
            {preview.rows.map((r) => (
              <li className="rounded border p-2" key={r.row}>
                <span className="text-xs text-muted-foreground">Row {r.row}</span>
                <p className="line-clamp-2 whitespace-pre-wrap">
                  {r.case?.message ?? "Invalid row"}
                </p>
                {r.errors.map((e) => (
                  <p className="text-xs text-destructive" key={e}>
                    {e}
                  </p>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
