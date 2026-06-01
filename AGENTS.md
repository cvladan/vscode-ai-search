# AGENTS.md

Guidance for humans and AI agents working in this repository.

## What this is

A semantic code search extension for VS Code / VSCodium. It **started from**
[zilliztech/claude-context](https://github.com/zilliztech/claude-context) — specifically
its VS Code extension package and core engine — and then diverged. It is **not a fork**;
treat it as its own project. Notable changes from upstream:

- Added **OpenRouter** embedding provider (based on upstream PR #381).
- Added optional **reranking** (second-stage retrieval) via the OpenRouter rerank endpoint.
- Added **PHP** and **Ruby** to the AST splitter (based on upstream PR #196, plus Ruby).
- Added a real **Markdown (mdast) splitter** that splits by headings and `---`.
- Added **LanceDB** and **Local (FAISS + SQLite)** vector backends (based on upstream PR #384).
- **Removed LangChain**; the fallback splitter is now a small dependency-free recursive splitter.
- Switched the monorepo from **pnpm** to **npm workspaces**, dropped the `mcp` and
  `chrome-extension` packages.

## Layout

```
packages/core               @ai-search/core — indexing engine (compiles to CommonJS)
  src/embedding/            OpenAI(+OpenRouter), VoyageAI, Ollama, Gemini providers
  src/vectordb/             Milvus (gRPC + REST), Zilliz, LanceDB, Local (FAISS+SQLite)
  src/splitter/             ast-splitter, recursive-splitter (fallback), markdown-splitter
  src/reranker/             Reranker interface + OpenRouterReranker (Cohere-compatible /rerank)
  src/context.ts            Context — orchestrates indexing & search
  src/sync/                 Merkle-tree based incremental sync
packages/vscode-extension   ai-search — the extension (bundled with webpack)
  src/extension.ts          activate(); builds Context from settings
  src/config/configManager  reads/writes settings; provider & splitter registries
  src/webview/              sidebar UI (html/css/js + provider)
  src/stubs/                webpack swaps these in for native-only core modules
  wasm/                     committed tree-sitter grammar WASMs (build input)
```

## Commands

All from the repo root (npm workspaces):

```bash
npm install                 # install everything (see "Dependency notes" below)
npm run build               # build core, then bundle the extension
npm run build:core          # tsc build of @ai-search/core
npm run build:vscode        # webpack production bundle of the extension
npm run typecheck           # tsc --noEmit on both packages
npm run test:core           # jest tests in core
npm run package:vscode      # build + produce the .vsix
npm run watch:vscode        # tsc watch for the extension
```

Run/debug the extension: press **F5** in VSCodium (uses `.vscode/launch.json`, which
runs the `build extension (dev)` task first and opens an Extension Development Host).

## Architecture notes (read before editing)

### Two execution environments
`core` is plain CommonJS used directly by Node (and by tests). The **extension** is a
single webpack bundle (`target: node`) that runs in the VS Code extension host. Several
core modules rely on native binaries that don't belong in a webpack bundle, so webpack
rewrites them — see `packages/vscode-extension/webpack.config.js`:

- `@zilliz/milvus2-sdk-node` (gRPC) → **ignored** (`IgnorePlugin`). The extension uses
  `MilvusRestfulVectorDatabase` (pure HTTP) instead.
- native `tree-sitter` → **ignored**; `ast-splitter.ts` is **replaced** by
  `src/stubs/ast-splitter-stub.js`, which uses **web-tree-sitter** (WASM) at runtime.
- `@lancedb/lancedb`, `faiss-node`, `sqlite3`, `sqlite` → kept **external** (require'd at
  runtime, not bundled) and **lazy-loaded** so they only touch native code when the
  LanceDB/Local backend is actually selected. The default Milvus (REST) path needs none.

### Splitters
- `AstCodeSplitter` (`ast`): tree-sitter syntax-aware chunking. In core it uses native
  grammars; in the extension the stub uses WASM grammars from `dist/wasm`.
- `RecursiveCharacterSplitter` (`recursive`): dependency-free fallback (coarse→fine
  separators + overlap). Used directly, and internally by the AST splitter for
  unsupported languages, parse failures, and over-large nodes.
- `MarkdownSplitter`: parses Markdown into an mdast tree via `remark-parse`/`unified`,
  splits on headings and thematic breaks, stores the heading path in chunk metadata.
  `remark` is ESM-only and is loaded through a **native dynamic import hidden from
  webpack** (`new Function('m','return import(m)')`) so it resolves from `node_modules`
  at runtime instead of being bundled; it falls back to the recursive splitter if absent.

### WASM grammars
`packages/vscode-extension/wasm/` holds the committed grammars. `php` and `ruby` are not
committed — `copy-assets.js` copies them from the `tree-sitter-wasms` package into
`dist/wasm` at build time. The stub maps language → wasm filename in `LANGUAGE_PARSERS`.

## Dependency notes

- The repo uses `legacy-peer-deps=true` (`.npmrc`) because of overlapping peer ranges in
  some transitive deps, and an `overrides` pin of `ajv@^8` in the root `package.json`
  (older tooling pulls `ajv@6`, which breaks `ajv-keywords`/`schema-utils` under hoisting).
- Native modules (`@lancedb/lancedb`, `faiss-node`, `sqlite3`, the native `tree-sitter*`
  grammars) compile on `npm install`. They are **runtime** deps for `core`/MCP-style use;
  the extension only needs them for the LanceDB/Local backends.
- `.vsix` is packaged with `--no-dependencies`, so it ships only the webpack bundle +
  `dist/wasm`. The LanceDB/Local backends therefore work reliably in **dev (F5)** mode;
  for a self-contained installed extension, prefer the Milvus (REST) backend.

## How-to recipes

**Add an AST language:** add a `tree-sitter-<lang>` dep + node types in
`packages/core/src/splitter/ast-splitter.ts` (`SPLITTABLE_NODE_TYPES`, `getLanguageConfig`,
`isLanguageSupported`); mirror it in `src/stubs/ast-splitter-stub.js` (`LANGUAGE_PARSERS`,
`SPLITTABLE_NODE_TYPES`, `normalizeLanguage`) and make sure a matching `tree-sitter-<lang>.wasm`
is shipped (commit it under `wasm/` or add it to the `tree-sitter-wasms` copy list in
`copy-assets.js`); map the file extension in `Context.getLanguageFromExtension`.

**Add an embedding provider:** add a class under `packages/core/src/embedding/`, export it,
then register it in `EMBEDDING_PROVIDERS` in `configManager.ts`, add it to the enum in the
extension `package.json` and to the dropdown in `webview/scripts/semanticSearch.js`.
(OpenRouter is just `OpenAIEmbedding` with `baseURL = https://openrouter.ai/api/v1`.)

**Reranking (on demand):** reranking is opt-in per request — `Context.semanticSearch(..., { rerank: true })`
over-fetches a candidate pool (`candidateK`) and `maybeRerank()` re-scores via the model and
trims to `topK`; any failure falls back to vector order. Normal searches pass `rerank: false`.
The UI triggers it from the **↑ Re-rank results** button (webview posts a `rerank` message →
`executeForWebview(..., true)`); the button is shown only when `ConfigManager.isRerankerConfigured()`
is true. To add a rerank provider, implement the `Reranker` interface in
`packages/core/src/reranker/`, export it, and construct it in `ConfigManager.getReranker()`
behind the `aiSearch.reranker.*` settings.

**Add a vector backend:** implement `VectorDatabase` under `packages/core/src/vectordb/`,
lazy-load any native deps (see `local-vectordb.ts`), export it, externalize the native
modules in `webpack.config.js`, and wire it into `createVectorDatabase()` in `extension.ts`
plus the `vectorDatabase.provider` enum in `package.json`.
