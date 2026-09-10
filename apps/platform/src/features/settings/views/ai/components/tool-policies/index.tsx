import { FieldLabel } from "@repo/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import type { TicketCategory } from "@repo/api-client";
import { ticketCategories } from "../../ai.hooks";
import type { ToolPoliciesProps } from "./index.types";

const categoryLabel: Record<TicketCategory, string> = {
  ACCOUNT: "Account",
  BILLING: "Billing",
  GENERAL: "General",
  SUBSCRIPTION: "Subscription",
  TECHNICAL: "Technical",
};

const none = "__none__";

export default function ToolPolicies({ tools, onChange, isPending }: ToolPoliciesProps) {
  const assignedTools = tools.filter((tool) => tool.assigned);

  return (
    <div className="grid gap-4">
      {ticketCategories.map((category) => {
        const current = tools.find((tool) => tool.requiredForCategories.includes(category));

        return (
          <div key={category} className="grid grid-cols-[1fr_1fr] items-center gap-3">
            <FieldLabel htmlFor={`policy-${category}`}>{categoryLabel[category]}</FieldLabel>
            <Select
              value={current?.id ?? none}
              disabled={isPending}
              onValueChange={(value) => onChange(category, value === none ? null : value)}
            >
              <SelectTrigger id={`policy-${category}`}>
                <SelectValue placeholder="No required Tool" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={none}>No required Tool</SelectItem>
                {assignedTools.map((tool) => (
                  <SelectItem key={tool.id} value={tool.id}>
                    {tool.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      })}
    </div>
  );
}
