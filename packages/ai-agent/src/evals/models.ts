import type { ClassificationModel } from "../classification";
import type { ReplyModel } from "../reply";

/**
 * The two models every category needs, mirroring apps/api's split between
 * `classificationConfig` (fast model) and `aiAgentConfig` (main model) — see
 * apps/api/src/config.ts.
 */
export type AiAgentEvalModels = {
  classificationModel: ClassificationModel;
  replyModel: ReplyModel;
};
