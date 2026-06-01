# AI Search

Semantic search for VS Code / VSCodium. Index your codebase into a vector database
and search it by meaning, from the editor sidebar.

> Started from [zilliztech/claude-context](https://github.com/zilliztech/claude-context)
> (independent project, not a fork).

## Features

- 🔍 Semantic search from the activity-bar sidebar
- 🌳 AST-aware chunking: js/ts, python, java, c/c++, go, rust, c#, scala, **php**, **ruby**
- 📝 Markdown-aware chunking via a real Markdown AST (headings & `---`)
- 🔌 Embeddings: OpenAI, **OpenRouter**, VoyageAI, Ollama, Gemini
- 💾 Vector DBs: Milvus / Zilliz Cloud (default), **LanceDB** (local), **Local FAISS+SQLite**

## Usage

1. Open the **AI Search** view from the activity bar.
2. Configure an **embedding provider** and a **vector database** (gear icon, or Settings →
   search `aiSearch`).
3. **Index** your codebase, then search.

### Settings

- `aiSearch.embeddingProvider.provider`: `OpenAI` / `OpenRouter` / `VoyageAI` / `Ollama` / `Gemini`
- `aiSearch.embeddingProvider.model`, `.apiKey`, `.baseURL`, `.host` (Ollama)
- `aiSearch.vectorDatabase.provider`: `Milvus` / `LanceDB` / `Local`
- `aiSearch.vectorDatabase.dataDir`: folder for local DBs (default `~/.ai-search`)
- `aiSearch.milvus.address`, `.token`
- `aiSearch.splitter.type`: `ast` (default) or `recursive`; `.chunkSize`, `.chunkOverlap`

> LanceDB / Local backends use native modules and work best when running from source.
> The **Milvus (REST)** backend needs no native modules.

See the [repository README](https://github.com/cvladan/vscode-ai-search) for build and
local-development instructions.

## License

MIT

## Credits

<a target="_blank" href="https://icons8.com/icon/JNzjznWAq3J5/search">Search</a> icon by <a target="_blank" href="https://icons8.com">Icons8</a>
