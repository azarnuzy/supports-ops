import { Prisma } from "@prisma/client";
import { requireWorkspaceId } from "./workspace-context";

// Prisma's query extension passes the schema's PascalCase model name here
// (e.g. "WebWidgetConfig"), not the camelCase client delegate ("webWidgetConfig").
const workspaceScopedModels = new Set([
  "User",
  "AiAgent",
  "AiSettings",
  "Channel",
  "WebWidgetConfig",
  "CustomerIdentity",
  "WebSession",
  "Ticket",
  "AiActivity",
  "Conversation",
  "Message",
  "ConversationError",
  "Attachment",
  "KnowledgeSource",
  "Chunk",
]);

type QueryArguments = {
  create?: Record<string, unknown>;
  data?: Record<string, unknown> | Record<string, unknown>[];
  update?: Record<string, unknown>;
  where?: Record<string, unknown>;
};

type WorkspaceQuery<Return> = {
  args: QueryArguments;
  model: string;
  operation: string;
  query: (args: QueryArguments) => Return;
};

export const workspaceIsolation = Prisma.defineExtension({
  name: "workspace-isolation",
  query: {
    $allModels: {
      $allOperations({ args, model, operation, query }) {
        return executeWorkspaceQuery({
          args: args as QueryArguments,
          model,
          operation,
          query: query as (queryArgs: QueryArguments) => ReturnType<typeof query>,
        });
      },
    },
  },
});

export function scopeWorkspaceQuery(
  args: QueryArguments,
  operation: string,
  workspaceId: string,
): QueryArguments {
  const where = { ...args.where, workspaceId };

  if (operation === "create" || operation === "createMany") {
    return { ...args, data: scopeData(args.data, workspaceId) };
  }

  if (operation === "upsert") {
    return {
      ...args,
      create: { ...args.create, workspaceId },
      update: { ...args.update, workspaceId },
      where,
    };
  }

  if (operation === "update" || operation === "updateMany") {
    return { ...args, data: scopeData(args.data, workspaceId), where };
  }

  return { ...args, where };
}

export function isWorkspaceScopedModel(model: string) {
  return workspaceScopedModels.has(model);
}

export function executeWorkspaceQuery<Return>({
  args,
  model,
  operation,
  query,
}: WorkspaceQuery<Return>): Return {
  if (!isWorkspaceScopedModel(model)) {
    return query(args);
  }

  return query(applyWorkspaceScope(args, operation));
}

export function applyWorkspaceScope(args: QueryArguments, operation: string) {
  return scopeWorkspaceQuery(args, operation, requireWorkspaceId());
}

function scopeData(
  data: Record<string, unknown> | Record<string, unknown>[] | undefined,
  workspaceId: string,
) {
  if (Array.isArray(data)) {
    return data.map((record) => ({ ...record, workspaceId }));
  }

  return { ...data, workspaceId };
}
