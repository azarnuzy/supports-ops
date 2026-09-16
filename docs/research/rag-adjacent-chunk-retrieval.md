# Retrieving answers split across adjacent chunks

## Problem

SupportOps currently packs paragraphs into chunks of at most 800 characters. Only an oversized paragraph receives overlap. Retrieval then returns the five nearest chunks from pgvector. In `common-processing-time`, vector search found the order-lifecycle paragraph, while the adjacent processing-time paragraph containing `1-2 business days` was absent. The answer model therefore never received the required fact.

Relevant implementation: [`chunking.ts`](../../packages/knowledge/src/chunking.ts) and [`vector-store.ts`](../../packages/knowledge/src/vector-store.ts).

## Patterns used elsewhere

### Sentence window / neighbor expansion

LlamaIndex's `SentenceWindowNodeParser` embeds a sentence-sized node while storing nearby sentences as a window; after retrieval, a postprocessor replaces the matched sentence with that wider window. This separates a precise search unit from the larger context sent to generation. Its implementation also records previous/next relationships and makes window size configurable. Sources: [official example](https://docs.llamaindex.ai/en/v0.10.34/examples/node_postprocessor/MetadataReplacementDemo/), [source code](https://github.com/run-llama/llama_index/blob/main/llama-index-core/llama_index/core/node_parser/text/sentence_window.py).

This maps directly to SupportOps: keep each semantic match as an anchor, then fetch nearby positions from the same Knowledge Source. The Northstar PDF extraction separates a section heading from its body by one additional chunk, so SupportOps uses `anchor - 2` through `anchor + 2`.

### Parent/child (small-to-big) retrieval

Parent-document retrieval searches small child chunks but returns their larger parent documents, preserving precise matching without starving generation of context. LlamaIndex's hierarchical parser and auto-merging retriever similarly retrieve leaves and replace or merge them into parent nodes when appropriate. Sources: [LangChain `MultiVectorRetriever`](https://reference.langchain.com/python/langchain-classic/retrievers/multi_vector/MultiVectorRetriever), [LlamaIndex auto-merging example](https://docs.llamaindex.ai/en/v0.10.17/examples/retrievers/auto_merging_retriever.html).

This needs parent identifiers/content and a re-index, so it is more machinery than this failure requires.

### Structure-aware chunking

Unstructured's `by_title` strategy closes the current chunk when a new title begins, preserving section boundaries; its docs also warn that overlap across normal semantic boundaries can pollute chunks. Microsoft recommends variable chunks based on Markdown/HTML headings because fixed-size splitting can sever paragraphs and context. Sources: [Unstructured chunking](https://docs.unstructured.io/open-source/core-functionality/chunking), [Microsoft Document Intelligence RAG guidance](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/retrieval-augmented-generation?view=doc-intel-4.0.0), [Microsoft chunking guidance](https://learn.microsoft.com/en-us/azure/search/vector-search-how-to-chunk-documents).

SupportOps is already paragraph-aware, but not heading-aware. Keeping a heading with its section body is a useful second step if evals continue to expose section-boundary misses.

### Hybrid retrieval and reranking

Hybrid search runs full-text and vector search in parallel, then fuses ranked lists with Reciprocal Rank Fusion (RRF). A semantic reranker can reorder the resulting candidate set but cannot recover content that was never recalled. Sources: [Azure hybrid search](https://learn.microsoft.com/en-us/azure/search/hybrid-search-ranking), [Azure semantic ranker](https://learn.microsoft.com/en-us/AZURE/search/semantic-search-overview). OpenAI File Search also exposes separate embedding/text weights for hybrid RRF and ranking options; its default chunking uses 800-token chunks with 400-token overlap. Sources: [OpenAI file-search options](https://platform.openai.com/docs/api-reference/responses-streaming/response/refusal?lang=python), [OpenAI vector-store chunking](https://platform.openai.com/docs/api-reference/vector-stores-file-batches).

Hybrid retrieval is valuable when exact policy terms, codes, or numbers rank poorly under embeddings. It does not by itself solve this case: the processing-time text must still enter the candidate or expanded context.

## Recommendation for SupportOps

Implement query-time neighbor expansion first:

1. Retrieve three semantic anchors rather than five final chunks.
2. For each accepted anchor, fetch positions `-2` through `+2` from the same `knowledgeSourceId`.
3. Apply the same Workspace, publication, deletion, and Visibility predicates to neighbors. A matching position alone is never an authorization boundary.
4. Deduplicate by chunk ID, retain anchor similarity for traceability, and cap the final context at eight chunks.
5. Preserve anchor relevance order; place each neighbor beside its anchor rather than pretending the neighbor has a vector score.

This is the smallest fit because existing deterministic positions already provide the relationship, no schema or re-index is required, and every `searchChunks` caller benefits from one shared change.

Do not start by increasing top-k: it spends context on more unrelated semantic matches without guaranteeing adjacency. Do not start with global overlap: it requires re-indexing and duplicates text in every result. Add heading-aware ingestion next only if measured failures remain; add hybrid BM25/RRF or parent/child retrieval only when evaluation shows broader lexical-recall or long-section problems.

## Acceptance check

Use two separate assertions:

- Retrieval: the expanded result contains the source passage with `1-2 business days`.
- Answer: `common-processing-time` contains `1-2 business days` and remains grounded in the returned passages.

This distinguishes retrieval regressions from answer-generation regressions.
