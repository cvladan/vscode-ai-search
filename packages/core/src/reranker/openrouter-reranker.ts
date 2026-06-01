import { Reranker, RerankResult } from './index';

export interface OpenRouterRerankerConfig {
    /** API key (OpenRouter `sk-or-...`, or a Cohere-compatible key for a custom baseURL). */
    apiKey: string;
    /** Rerank model id. Defaults to `cohere/rerank-4-fast`. */
    model?: string;
    /** API base URL. Defaults to `https://openrouter.ai/api/v1`. */
    baseURL?: string;
    /** Request timeout in milliseconds. Defaults to 30000. */
    timeoutMs?: number;
}

/** Default OpenRouter rerank models (all Cohere-backed, currently free on OpenRouter). */
export const OPENROUTER_RERANK_MODELS = [
    'cohere/rerank-4-fast',
    'cohere/rerank-4-pro',
    'cohere/rerank-v3.5',
] as const;

/**
 * Reranker backed by the OpenRouter rerank endpoint
 * (`POST https://openrouter.ai/api/v1/rerank`).
 *
 * The request/response shape is the Cohere-compatible rerank format, so this
 * class also works against Cohere / Jina / Voyage rerank endpoints by overriding
 * `baseURL` and `model`.
 */
export class OpenRouterReranker implements Reranker {
    private apiKey: string;
    private model: string;
    private baseURL: string;
    private timeoutMs: number;

    constructor(config: OpenRouterRerankerConfig) {
        if (!config || !config.apiKey) {
            throw new Error('OpenRouterReranker requires an apiKey');
        }
        this.apiKey = config.apiKey;
        this.model = config.model || 'cohere/rerank-4-fast';
        this.baseURL = (config.baseURL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
        this.timeoutMs = config.timeoutMs ?? 30000;
    }

    getProvider(): string {
        return 'OpenRouter';
    }

    getModel(): string {
        return this.model;
    }

    async rerank(query: string, documents: string[], topN?: number): Promise<RerankResult[]> {
        if (!documents || documents.length === 0) {
            return [];
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
            const response = await fetch(`${this.baseURL}/rerank`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`,
                },
                body: JSON.stringify({
                    model: this.model,
                    query,
                    documents,
                    top_n: topN ?? documents.length,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const body = await response.text().catch(() => '');
                throw new Error(
                    `Rerank HTTP ${response.status}: ${response.statusText}${body ? ` - ${body.slice(0, 300)}` : ''}`
                );
            }

            const json: any = await response.json();
            const results: any[] = Array.isArray(json?.results) ? json.results : [];

            return results
                .filter((r) => typeof r?.index === 'number')
                .map((r) => ({
                    index: r.index,
                    relevanceScore: typeof r.relevance_score === 'number' ? r.relevance_score : 0,
                }));
        } finally {
            clearTimeout(timer);
        }
    }
}
