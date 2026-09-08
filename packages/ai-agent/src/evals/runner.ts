import { evalExitCode, printEvalResult, runEvalSuite, type RunEvalSuiteOptions } from "@anvia/core/evals";
import { evalObservabilityReporter } from "./reporter";
import { evalCategories, evalCategoryNames, type EvalCategoryName } from "./suites";
import type { AiAgentEvalModels } from "./models";

export type RunEvalsOptions = {
  category?: EvalCategoryName;
  caseId?: string;
  models: AiAgentEvalModels;
};

/**
 * Runs the eval suite — every category by default, or filtered to one
 * category and, within it, one case. Prints each suite's result and returns
 * the worst exit code across all of them, so `evalExitCode`'s convention
 * (0 = every case passed, 1 = a case failed, 2 = a case was invalid) still
 * holds for the run as a whole.
 */
export async function runEvals(options: RunEvalsOptions): Promise<number> {
  const categoryNames = options.category ? [options.category] : evalCategoryNames;
  const reporter = evalObservabilityReporter();
  let worstExitCode = 0;

  for (const categoryName of categoryNames) {
    const suites = evalCategories[categoryName](options.models)
      .filter((suite) => !options.caseId || suite.cases.some((c) => c.id === options.caseId))
      .map((suite) => applyCaseFilter(suite, options.caseId));

    for (const suite of suites) {
      const result = await runEvalSuite({ ...suite, reporters: [reporter] });
      printEvalResult(result);
      worstExitCode = Math.max(worstExitCode, evalExitCode(result));
    }
  }

  return worstExitCode;
}

function applyCaseFilter<Input, Output, Expected>(
  suite: RunEvalSuiteOptions<Input, Output, Expected>,
  caseId: string | undefined,
): RunEvalSuiteOptions<Input, Output, Expected> {
  if (!caseId) return suite;
  return { ...suite, caseIds: [caseId] };
}
