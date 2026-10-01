# Eval Run smoke recipe: Lens and Langfuse

Manual check that a selected Eval Run reaches an Admin's own Lens or Langfuse as a usable report.
It spends real Credits and calls paid models, so run it only when explicitly authorised, against a
Workspace you may charge, with the destination credentials for that deployment.

A successful OTLP response is not enough. Confirm each item below in the backend's own UI.

## Setup

1. In **Testing**, configure the Workspace destination (Lens project ingestion credentials, or
   Langfuse public/secret keys) and confirm the readiness check reports `reports: compatible`.
   Lens receives reports through OTLP logs; Langfuse receives scores through `POST /api/public/scores`.
   For Langfuse, readiness reads score configs without creating a score; it does not verify a score
   write. A `reports: unsupported` result means the report API probe failed: stop and record it.
2. Create a small dataset with a rubric, and one Case of each kind:
   - `contains` (deterministic, no Judge)
   - `gEval` with an expected answer (2 Judge calls)
   - `relevancy` (2-3 Judge calls)
   - `faithfulness` (1-2 Judge calls; needs published Knowledge)
   - `retrieval`, retrieval path **Retriever only** (no AI Agent call), with a real label
   - `retrieval`, retrieval path **Full AI Agent turn**
   - `negativeControl` (evaluator health)
3. Note the Organization's Credit balance.

## Run

1. Select the Cases and open the Run confirmation. Check:
   - AI Agent shows one AI Turn per Case that calls the AI Agent, **not** for the retriever-only or
     negative-control Cases.
   - Judge shows a call range and the note that the range is an estimate.
   - Estimated Credits is a range that includes the Judge rate.
2. Start the Run and let it finish.

## Verify in the app

- Every Case shows Evaluated. The negative control is listed as an evaluator check and counted
  apart from AI Agent results; it is not a regression.
- "Credits charged" splits into AI Agent and Judge. The balance moved by that total.
- Delivery shows Delivered for both your destination and SupportOps tracing.

## Verify in the backend (both Lens and Langfuse)

- **Run grouping:** all Cases appear under one Run/Session named `eval-run-<runId>`, with the
  dataset name, and each trace names its Case (`eval-case-<caseKey>`).
- **Scores:** each Case has a score per metric (`answer-quality`, `answer_relevancy`,
  `faithfulness`, `recall@k`, ...), with pass/fail and the comment. The negative control shows a
  failing `negative-control` score and its `evaluatorHealth` metadata.
- **Trace links:** opening a score reaches the AI Agent trace for that Case. The retriever-only
  Case has no AI Agent trace (it made no AI Agent call).
- **Correlation:** run metadata carries `runId`, `datasetId`, `workspaceId`, `agentModel`,
  `embeddingModel` and, for Judge Cases, `judgeModel`; Judge usage appears in the score's
  evaluation metadata.
- **Central tracing:** the same Run is visible in SupportOps' own backend, and nothing from the
  Run is visible in another Workspace's destination.

## Failure and exhaustion

- Set the balance to about one AI Turn plus one Judge call and run a `gEval` Case followed by a
  `contains` Case. Expect the first to be **Not graded** (answer kept, one Judge Credit spent) and
  the second **Not executed**; neither is shown as a failure.
- Add a `retrieval` Case whose expected passage no longer exists in Knowledge. Expect **Invalid
  case**, never a score of zero.

Record the backend, version, and any item that did not group or link as expected.
