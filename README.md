# AI Search

[![VS Code Marketplace](https://vsmarketplacebadges.dev/version-short/jao.ai-semantic-search.svg)](https://marketplace.visualstudio.com/items?itemName=jao.ai-semantic-search)
[![Open VSX](https://img.shields.io/open-vsx/v/jao/ai-semantic-search?label=Open%20VSX&logo=eclipseide)](https://open-vsx.org/extension/jao/ai-semantic-search)

- **VS Code Marketplace:** https://marketplace.visualstudio.com/items?itemName=jao.ai-semantic-search
- **Open VSX (VSCodium):** https://open-vsx.org/extension/jao/ai-semantic-search

Semantic search for **VS Code / VSCodium**. Index your codebase — or just a folder of
Markdown/text files — into a vector database and search it by meaning instead of by
keyword, right from the editor sidebar. The pipeline is: an **embedding model** turns your
files into vectors → **vector search** finds candidates → and, optionally, a **re-ranking**
model reorders those results for better relevance.

> This project **started from** [zilliztech/claude-context](https://github.com/zilliztech/claude-context)
> (the VS Code extension package). It is an independent project — not a fork — and it
> incorporates several community improvements. See [AGENTS.md](AGENTS.md) for details.

## Features

- 🔍 **Semantic search** over your whole codebase, from the activity-bar sidebar.
- 🌳 **AST-aware chunking** for js/ts, python, java, c/c++, go, rust, c#, scala, **php**, **ruby**.
- 📝 **Markdown-aware chunking** using a real Markdown AST (split by headings and `---`).
- 🔌 **Embedding providers**: OpenAI, **OpenRouter**, VoyageAI, Ollama (local), Gemini.
- 💾 **Vector databases**: Milvus / Zilliz Cloud (default, REST), **LanceDB** (local), **Local FAISS+SQLite** (local).

## Quick start (run it locally in VSCodium)

You need **Node.js ≥ 22** and **npm**.

```bash
# 1. install dependencies (workspace root)
npm install

# 2. build everything (core + extension bundle)
npm run build
```

Then either **debug it** or **install the packaged extension**:

### A) Debug in an Extension Development Host (recommended while developing)

1. Open this folder in VSCodium.
2. Press **F5** (runs the `Run AI Search Extension` launch config).
   It builds the extension and opens a second VSCodium window with it loaded.
3. In that window, open any project, then open the **AI Search** view from the activity bar.

### B) Install the packaged `.vsix`

```bash
npm run package:vscode      # produces packages/vscode-extension/ai-semantic-search-<version>.vsix
codium --install-extension packages/vscode-extension/ai-semantic-search-*.vsix
```

(or in VSCodium: **Extensions → … → Install from VSIX…**)

## Configure it

Open **Settings** and search for `aiSearch`, or use the gear icon in the sidebar view.

1. **Embedding provider** (`aiSearch.embeddingProvider.provider`):
   `OpenAI` · `OpenRouter` · `VoyageAI` · `Ollama` · `Gemini`. Set the model and API key.
   For a fully local setup pick **Ollama** (e.g. model `nomic-embed-text`).
2. **Vector database** (`aiSearch.vectorDatabase.provider`):
   - `Milvus` — default, talks to Milvus / Zilliz Cloud over REST (no native modules).
   - `LanceDB` — embedded local database, stored under `~/.ai-search/lancedb`.
   - `Local` — local FAISS + SQLite, stored under `~/.ai-search/local-db`.

   > LanceDB and Local use native modules. They work out of the box when you run from
   > source (F5). In a `.vsix` installed without dependencies they may be unavailable —
   > use **Milvus** (REST) for the zero-native-dependency path. See [AGENTS.md](AGENTS.md).
3. **Index** your codebase from the sidebar (or the `AI Search: Index Codebase` command), then search.

## Which files get indexed

Indexing uses a strict **allowlist** of file extensions — the extension is checked
*before* a file is ever read, so binary files (video, images, audio, PDFs, archives,
executables, …) are **never opened and never sent to the embedding model**. No wasted
embedding calls on a `.mp4`.

By default these extensions are indexed:

| Group | Extensions |
|---|---|
| Programming | `.ts` `.tsx` `.js` `.jsx` `.py` `.java` `.cpp` `.c` `.h` `.hpp` `.cs` `.go` `.rs` `.php` `.rb` `.swift` `.kt` `.scala` `.m` `.mm` `.dart` `.sol` |
| Text / markup | `.md` `.markdown` `.txt` `.ipynb` |

Everything else is skipped, **including files with no extension** (`Makefile`, `LICENSE`,
dotfiles, …). `.txt` files are indexed and processed **exactly like Markdown** (same
mdast splitter). Note that some other plain-text formats (`.json`, `.yaml`,
`.html`, `.css`, `.sql`, `.sh`, …) are **not** indexed by default. On top of the
allowlist, common noise is ignored regardless of extension: `node_modules/`, `dist/`,
`build/`, `out/`, `.git/`, caches, logs, and minified/bundled files (`*.min.js`, etc.).

The list lives in `DEFAULT_SUPPORTED_EXTENSIONS` in
[`packages/core/src/context.ts`](packages/core/src/context.ts) — add or remove extensions
there if you want a different set.

## Splitter: AST vs. fallback (and where Markdown fits)

How a file is cut into chunks before embedding matters a lot for search quality.
Two strategies are available (`aiSearch.splitter.type`, default `ast`):

| | **AST splitter** (`ast`) | **Recursive splitter** (`recursive`) |
|---|---|---|
| How it works | Parses the file into a real syntax tree (tree-sitter) and cuts on **logical units**: functions, classes, methods, interfaces, traits… | Doesn't understand syntax — splits on separators (paragraph → line → word) up to `chunkSize`, with overlap. |
| Chunk quality | High — each chunk is a coherent unit → better embeddings & search. | Good enough, language-agnostic. |
| Works for | Languages with a grammar (js/ts, py, java, c/c++, go, rust, c#, scala, php, ruby). | **Anything** (JSON, YAML, shell, plain text, unsupported languages). |

They are **not** mutually exclusive. With the `ast` splitter selected, the recursive
splitter is still used automatically as a safety net:

- the file's language has no grammar → fall back to recursive,
- the file fails to parse (broken/partial code) → fall back to recursive,
- a single AST node is larger than `chunkSize` → the recursive splitter sub-divides it.

**Markdown** is handled separately by a dedicated splitter built on a real Markdown AST
(`remark`/mdast): it splits by heading boundaries and thematic breaks (`---`), and records
the heading path (e.g. `Title > Section`) in each chunk's metadata. If `remark` can't be
loaded it falls back to the recursive splitter too.

> The original project used LangChain for the fallback. This project replaced it with a
> small, dependency-free recursive splitter — same idea, far lighter dependency tree.

## Re-ranking (optional, recommended)

Vector search is good at *recall* but not always at putting the single best match first.
A **reranker** is a second stage: after the vector DB returns a pool of candidates, a
dedicated rerank model re-scores `(query, document)` pairs and reorders them. It noticeably
improves the top results.

This uses **OpenRouter's rerank endpoint** (`POST /api/v1/rerank`), which exposes Cohere's
rerank models (currently free on OpenRouter):

| Model | Notes |
|---|---|
| `cohere/rerank-4-fast` | lowest latency (default) |
| `cohere/rerank-4-pro` | highest accuracy, 32K context |
| `cohere/rerank-v3.5` | multilingual / semi-structured, 4K context |

Enable it in Settings (`aiSearch.reranker.*`):

```json
{
  "aiSearch.reranker.enabled": true,
  "aiSearch.reranker.model": "cohere/rerank-4-fast",
  "aiSearch.reranker.apiKey": "sk-or-..."
}
```

- Reranking is **on demand, not automatic**: run a normal search first, then click the
  **↑ Re-rank results** button that appears above the results to reorder them. This keeps
  every search fast and only spends rerank calls when you ask for them.
- If `reranker.apiKey` is empty **and** your embedding provider is already OpenRouter, that
  key is reused automatically — no extra credentials needed.
- `reranker.baseURL` is optional (defaults to `https://openrouter.ai/api/v1`); since the
  request/response is Cohere-compatible, you can point it at Cohere/Jina/Voyage instead.
- On click, the extension fetches a larger candidate pool from the vector DB, reranks it,
  and shows the reordered top results. **If reranking fails for any reason, search silently
  falls back to the normal vector-search order** — it never breaks search.

## Project layout

```
packages/core              # indexing engine: embeddings, vector DBs, splitters
packages/vscode-extension  # the VS Code / VSCodium extension
```

See [AGENTS.md](AGENTS.md) for architecture and contributor notes.

## Publishing

The extension goes to two marketplaces from the **same `.vsix`**:
[VS Code Marketplace](https://marketplace.visualstudio.com/) (VS Code) and
[Open VSX](https://open-vsx.org/) (VSCodium and other open editors).

### Easiest: GitHub Actions (recommended)

A workflow at [`.github/workflows/publish.yml`](.github/workflows/publish.yml) builds and
publishes to **both** marketplaces automatically when you push a version tag.

**One-time setup**

1. **VS Code Marketplace** — create a publisher named `jao` at
   <https://marketplace.visualstudio.com/manage>, then create an Azure DevOps **Personal
   Access Token** (scope *Marketplace → Manage*).
   Docs: <https://code.visualstudio.com/api/working-with-extensions/publishing-extension>
2. **Open VSX** — sign in at <https://open-vsx.org> with GitHub, create an **Access Token**
   (Settings → Access Tokens), then create your namespace once:
   ```bash
   npx ovsx create-namespace jao -p <OPEN_VSX_TOKEN>
   ```
3. **Add both tokens as repo secrets** (GitHub → Settings → Secrets and variables → Actions):
   - `VSCE_PAT` = the Azure DevOps token
   - `OVSX_PAT` = the Open VSX token

**Each release** — easiest from VS Code: open the Command Palette → **Tasks: Run Task** →
**Release (bump version, tag & push)**, then pick `patch`, `minor`, or `major`. That bumps
the extension version, commits, tags, and pushes — which triggers the publish workflow.

Equivalent from the terminal:

```bash
scripts/release.sh patch        # or: minor | major
```

(You can also trigger the workflow manually from the **Actions** tab via *Run workflow*.)

### Manual alternative (no CI)

```bash
npm run package:vscode                                    # -> packages/vscode-extension/ai-semantic-search-<version>.vsix
cd packages/vscode-extension
npx @vscode/vsce publish -i ai-semantic-search-*.vsix -p <AZURE_DEVOPS_PAT>
npx ovsx publish        ai-semantic-search-*.vsix -p <OPEN_VSX_TOKEN>
```

## License

MIT. Started from [zilliztech/claude-context](https://github.com/zilliztech/claude-context) (also MIT).

## Credits

<a target="_blank" href="https://icons8.com/icon/JNzjznWAq3J5/search">Search</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a>
