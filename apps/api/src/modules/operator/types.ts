import type { operatorAuth } from "../auth/instance";

export type OperatorSession = typeof operatorAuth.$Infer.Session.session;
export type Operator = typeof operatorAuth.$Infer.Session.user;

export type OperatorVariables = {
  operator: Operator | null;
  operatorSession: OperatorSession | null;
};
