// Reranker interfaces
//
// A reranker takes a query and a list of candidate documents (already retrieved
// from the vector database) and returns them reordered by semantic relevance,
// using a dedicated cross-encoder / rerank model. This is the second stage of a
// typical RAG pipeline: cheap vector recall first, precise rerank second.

export interface RerankResult {
    /** Index of the document in the input `documents` array. */
    index: number;
    /** Relevance score from the model (higher = more relevant). */
    relevanceScore: number;
}

export interface Reranker {
    /**
     * Reorder `documents` by relevance to `query`.
     * @param query     The search query.
     * @param documents Candidate document texts.
     * @param topN      Optional cap on how many results to return.
     * @returns Results sorted by descending relevance, referencing the original index.
     */
    rerank(query: string, documents: string[], topN?: number): Promise<RerankResult[]>;
    /** Human-readable provider name (e.g. "OpenRouter"). */
    getProvider(): string;
    /** Model identifier in use. */
    getModel(): string;
}

// Implementation exports
export * from './openrouter-reranker';
