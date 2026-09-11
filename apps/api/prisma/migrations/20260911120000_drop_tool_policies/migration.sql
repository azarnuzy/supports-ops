-- Tool Policies are removed: an AI Agent's Tools are now selected by the model,
-- steered by each Tool Assignment's usage instruction, never by a category rule.
DROP TABLE "ToolPolicy";
