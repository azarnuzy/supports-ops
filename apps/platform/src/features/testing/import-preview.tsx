import type { EvalImportPreview } from "@repo/api-client";
import { caseIssues } from "@repo/shared/eval-schema";
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { AlertTriangleIcon } from "lucide-react";
import { metricLabels } from "./case-editor";

export function ImportPreviewPanel({ preview }: { preview: EvalImportPreview }) {
  const valid = preview.rows.filter((row) => row.case).length;
  const invalid = preview.rows.length - valid;
  return (
    <div aria-live="polite" className="grid min-w-0 gap-3">
      {preview.error && (
        <Alert variant="destructive">
          <AlertTriangleIcon />
          <AlertTitle>Unable to import</AlertTitle>
          <AlertDescription>{preview.error}</AlertDescription>
        </Alert>
      )}
      {preview.truncated && (
        <Alert>
          <AlertTriangleIcon />
          <AlertTitle>100-row import limit</AlertTitle>
          <AlertDescription>
            This source has {preview.truncated.total} rows. Only the first {preview.truncated.limit}{" "}
            are included in this preview; {preview.truncated.total - preview.truncated.limit} rows
            will be skipped.
          </AlertDescription>
        </Alert>
      )}
      {preview.rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary">{valid} valid</Badge>
            <Badge variant={invalid ? "destructive" : "outline"}>{invalid} need attention</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Valid rows can be imported. Cases missing a metric or its expectations need criteria
            before they can run.
          </p>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <Table aria-label="Import preview">
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Customer Message</TableHead>
                  <TableHead>Evaluation</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => {
                  const issues = row.case ? caseIssues(row.case) : [];
                  return (
                    <TableRow key={row.row}>
                      <TableCell className="align-top text-xs tabular-nums text-muted-foreground">
                        {row.row}
                      </TableCell>
                      <TableCell className="min-w-48 max-w-80 whitespace-normal align-top">
                        <p className="line-clamp-2 whitespace-pre-wrap text-sm">
                          {row.case?.message ?? "Invalid row"}
                        </p>
                        {row.errors.map((error) => (
                          <p className="mt-1 text-xs text-destructive" key={error}>
                            {error}
                          </p>
                        ))}
                      </TableCell>
                      <TableCell className="align-top text-xs text-muted-foreground">
                        {row.case?.metric ? metricLabels[row.case.metric] : "Not selected"}
                      </TableCell>
                      <TableCell className="align-top">
                        <Badge variant={!row.case ? "destructive" : "outline"}>
                          {!row.case
                            ? "Needs attention"
                            : issues.length
                              ? "Needs criteria"
                              : "Ready"}
                        </Badge>
                        {issues.length > 0 && (
                          <p className="mt-1 max-w-48 whitespace-normal text-xs text-muted-foreground">
                            {issues.join(" ")}
                          </p>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
