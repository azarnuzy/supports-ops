import type { RunEvalSuiteOptions } from "@anvia/core/evals";
import {
  buildClassificationNegativeControlSuite,
  buildClassificationSuite,
} from "./categories/classification";
import {
  buildEscalationForbiddenNegativeControlSuite,
  buildEscalationForbiddenSuite,
} from "./categories/escalation-forbidden";
import {
  buildEscalationRequiredNegativeControlSuite,
  buildEscalationRequiredSuite,
} from "./categories/escalation-required";
import { buildGroundingNegativeControlSuite, buildGroundingSuite } from "./categories/grounding";
import {
  buildLanguageIndonesianSuite,
  buildLanguageNegativeControlSuite,
  buildLanguageResolveHasNoContentSuite,
  buildLanguageSuite,
} from "./categories/language";
import {
  buildResolutionDetectionBareThanksSuite,
  buildResolutionDetectionNegativeControlSuite,
  buildResolutionDetectionSuite,
} from "./categories/resolution-detection";
import { buildToolCallingNegativeControlSuite, buildToolCallingSuite } from "./categories/tool-calling";
import {
  buildVisibilitySafetyNegativeControlSuite,
  buildVisibilitySafetySuite,
} from "./categories/visibility-safety";
import type { AiAgentEvalModels } from "./models";

// biome-ignore lint/suspicious/noExplicitAny: each category's suites have their own Input/Output/Expected
type AnyEvalSuite = RunEvalSuiteOptions<any, any, any, any>;
type EvalSuiteBuilder = (models: AiAgentEvalModels) => AnyEvalSuite[];

/**
 * Every named category defends one requirement from the eval suite's spec
 * (issue #33): visibility safety, grounding, escalation that must happen,
 * escalation that must not happen, tool calling, classification, resolution
 * detection, and language. Each category resolves to one or more suites so a
 * negative control can be isolated from the cases it would otherwise drag
 * down — see `negativeControlSuite` in metrics.ts.
 */
export const evalCategories = {
  "visibility-safety": ((models) => [
    buildVisibilitySafetySuite(models),
    buildVisibilitySafetyNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  grounding: ((models) => [
    buildGroundingSuite(models),
    buildGroundingNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  "escalation-required": ((models) => [
    buildEscalationRequiredSuite(models),
    buildEscalationRequiredNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  "escalation-forbidden": ((models) => [
    buildEscalationForbiddenSuite(models),
    buildEscalationForbiddenNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  "tool-calling": ((models) => [
    buildToolCallingSuite(models),
    buildToolCallingNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  classification: ((models) => [
    buildClassificationSuite(models),
    buildClassificationNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  "resolution-detection": ((models) => [
    buildResolutionDetectionSuite(models),
    buildResolutionDetectionBareThanksSuite(models),
    buildResolutionDetectionNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
  language: ((models) => [
    buildLanguageSuite(models),
    buildLanguageIndonesianSuite(models),
    buildLanguageResolveHasNoContentSuite(models),
    buildLanguageNegativeControlSuite(models),
  ]) satisfies EvalSuiteBuilder as EvalSuiteBuilder,
} satisfies Record<string, EvalSuiteBuilder>;

export type EvalCategoryName = keyof typeof evalCategories;

export const evalCategoryNames = Object.keys(evalCategories) as EvalCategoryName[];
