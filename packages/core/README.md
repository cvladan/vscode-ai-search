# @ai-search/core

The indexing engine behind the **AI Search** VS Code / VSCodium extension. It has no
dependency on VS Code, so it can also be used directly from Node, a CLI, or an MCP server.

It handles the whole pipeline:

- **Splitting**: AST-aware chunking via tree-sitter, a dependency-free recursive fallback,
  and a Markdown splitter built on a real mdast tree.
- **Embeddings**: OpenAI, OpenRouter, VoyageAI, Ollama, Gemini.
- **Vector storage**: Milvus and Zilliz Cloud over gRPC or REST, embedded LanceDB, and a
  local FAISS + SQLite backend.
- **Re-ranking**: optional second-stage relevance via the OpenRouter rerank endpoint.
- **Incremental sync**: a Merkle tree tracks changed files so re-indexing only touches
  what changed.

This package is part of the [vscode-ai-search](../../README.md) repository and is not
published to npm. See the [root README](../../README.md) and [AGENTS.md](../../AGENTS.md)
for the full overview and build instructions.

## Usage

```ts
import {
  Context,
  OpenAIEmbedding,
  MilvusRestfulVectorDatabase,
  AstCodeSplitter,
  OpenRouterReranker,
} from '@ai-search/core';

const context = new Context({
  embedding: new OpenAIEmbedding({ apiKey: process.env.OPENAI_API_KEY!, model: 'text-embedding-3-small' }),
  vectorDatabase: new MilvusRestfulVectorDatabase({ address: 'http://localhost:19530' }),
  codeSplitter: new AstCodeSplitter(2500, 300),
  // optional second-stage re-ranking
  reranker: new OpenRouterReranker({ apiKey: process.env.OPENROUTER_API_KEY! }),
});

// Index a folder
await context.indexCodebase('./my-project', (progress) => {
  console.log(`${progress.phase}: ${progress.percentage}%`);
});

// Search it. Pass { rerank: true } to re-score the candidate pool with the reranker.
const results = await context.semanticSearch('./my-project', 'where is auth handled?', 10, 0.3, undefined, { rerank: true });
for (const r of results) {
  console.log(`${r.relativePath}:${r.startLine}-${r.endLine}  (score ${r.score})`);
}
```

For a fully local setup, use `OllamaEmbedding` with `LanceDBVectorDatabase` or
`LocalVectorDatabase`, which need no external server.

## Main API

- `new Context(config)`: build the engine from an embedding, a vector database, a splitter,
  and an optional reranker.
- `indexCodebase(path, onProgress?, forceReindex?)`: index a folder.
- `semanticSearch(path, query, topK?, threshold?, filterExpr?, { rerank }?)`: search.
- `hasIndex(path)`: check whether a folder is already indexed.
- `clearIndex(path, onProgress?)`: remove a folder's index.

## Development

```bash
npm run build:core      # tsc build (from the repo root)
npm run test:core       # jest tests
```

## License

MIT. This project started from
[zilliztech/claude-context](https://github.com/zilliztech/claude-context) (also MIT).
