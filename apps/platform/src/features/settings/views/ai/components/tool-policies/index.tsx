import { Button } from "@repo/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import type { CatalogTool, TicketCategory } from "@repo/api-client";
import { Link } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { useTicketCategoriesQuery } from "../../../../../ticket-categories";
import type { ToolPoliciesProps } from "./index.types";

type Rule = { category: TicketCategory; tool: CatalogTool };

function existingRules(tools: CatalogTool[]): Rule[] {
  return tools
    .flatMap((tool) => tool.requiredForCategories.map((category) => ({ category, tool })))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** Rules are opt-in: a category with no rule simply has no row, because most categories never
 * need one and a screen of empty selects reads like unfinished configuration. */
export default function ToolPolicies({ tools, onChange, isPending }: ToolPoliciesProps) {
  const [draftCategory, setDraftCategory] = useState<TicketCategory | null>(null);
  const categories = useTicketCategoriesQuery();
  const attachedTools = tools.filter((tool) => tool.assigned);
  const rules = existingRules(tools);
  const usedCategories = new Set(rules.map((rule) => rule.category));
  const allCategories = categories.data?.categories ?? [];
  const availableCategories = allCategories.filter(
    (category) => !usedCategories.has(category.key),
  );
  /** A rule can outlive the category label it was created from, so fall back to the stored key. */
  const labelFor = (key: string) =>
    allCategories.find((category) => category.key === key)?.label ?? key;

  if (attachedTools.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted-foreground">
        Switch on a tool for this agent on the{" "}
        <Link className="underline underline-offset-2" to="/agent/tools">
          Tools
        </Link>{" "}
        page first — a rule can only point at a tool the agent is allowed to call.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {rules.length === 0 && draftCategory === null ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          No rules yet. Without one, the agent decides for itself whether a tool is worth calling.
        </p>
      ) : null}

      {rules.map((rule) => (
        <div
          key={rule.category}
          className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm"
        >
          <span className="text-muted-foreground">On a</span>
          <span className="font-medium">{labelFor(rule.category)}</span>
          <span className="text-muted-foreground">ticket, always run</span>
          <Select
            value={rule.tool.id}
            disabled={isPending}
            onValueChange={(value) => onChange(rule.category, value)}
          >
            <SelectTrigger aria-label={`Tool for ${labelFor(rule.category)}`} className="w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {attachedTools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">before answering.</span>
          <Button
            aria-label={`Remove the ${labelFor(rule.category)} rule`}
            className="ml-auto"
            disabled={isPending}
            size="icon-sm"
            variant="ghost"
            onClick={() => onChange(rule.category, null)}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ))}

      {draftCategory !== null ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-sm">
          <span className="text-muted-foreground">On a</span>
          <Select
            value={draftCategory}
            onValueChange={(value) => setDraftCategory(value as TicketCategory)}
          >
            <SelectTrigger aria-label="Ticket category" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableCategories.map((category) => (
                <SelectItem key={category.key} value={category.key}>
                  {category.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground">ticket, always run</span>
          <Select
            disabled={isPending}
            onValueChange={(value) => {
              onChange(draftCategory, value);
              setDraftCategory(null);
            }}
          >
            <SelectTrigger aria-label="Tool to run" className="w-52">
              <SelectValue placeholder="Pick a tool" />
            </SelectTrigger>
            <SelectContent>
              {attachedTools.map((tool) => (
                <SelectItem key={tool.id} value={tool.id}>
                  {tool.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            aria-label="Cancel the new rule"
            className="ml-auto"
            size="icon-sm"
            variant="ghost"
            onClick={() => setDraftCategory(null)}
          >
            <XIcon className="size-4" />
          </Button>
        </div>
      ) : null}

      {draftCategory === null && availableCategories.length > 0 ? (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setDraftCategory(availableCategories[0]?.key ?? null)}
          >
            <PlusIcon className="size-4" />
            Add rule
          </Button>
        </div>
      ) : null}
    </div>
  );
}
