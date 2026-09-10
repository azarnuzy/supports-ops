import { Field, FieldLabel } from "@repo/ui/components/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import type { KnowledgeVisibility } from "../../knowledge.types";
import type { VisibilitySelectProps } from "./index.types";

export default function VisibilitySelect({
  id = "knowledge-visibility",
  value,
  onChange,
}: VisibilitySelectProps) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>Visibility</FieldLabel>
      <Select value={value} onValueChange={(next) => onChange(next as KnowledgeVisibility)}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="CUSTOMER_SAFE">Customer-Safe</SelectItem>
          <SelectItem value="INTERNAL_ONLY">Internal-Only</SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
