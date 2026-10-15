# Margin — Document Q&A with sources

Margin is a web application for asking questions across your own documents. It finds relevant passages with vector search, generates an answer grounded in those passages, and shows clickable citations back to the original files. Each user's documents and conversations are private to their account.

## Features

- **Private document library:** Sign in, upload PDF, DOCX, TXT or Markdown files, and choose which documents a conversation can use.
- **Cited answers:** Retrieved passages carry document names and PDF page numbers. Selecting a citation reveals the passage and opens the source file.
- **Grounded responses:** When the selected documents do not support an answer, the app says so rather than supplying an unsupported response.
- **Conversation history:** Return to previous questions and their sources.
- **Document processing:** Text is extracted, split into passages, embedded and stored in PostgreSQL with pgvector. Failed files can be retried.
- **Account isolation:** Supabase Authentication and PostgreSQL row level security scope files, passages, conversations and messages to the signed-in user.

## How it works

1. Upload a file. The server extracts text and keeps real PDF page boundaries.
2. OpenAI creates embeddings for the passages, which are stored in pgvector. The original is kept in private Supabase Storage.
3. A question is embedded and matched only against the documents selected for that conversation.
4. OpenAI writes a response using the retrieved excerpts. Citation IDs are validated against the excerpts before they appear in the UI.
5. The answer and citations are saved in the user's conversation history.

The frontend uses **Next.js and React**. Next.js Route Handlers implement the API; **Supabase** provides authentication, PostgreSQL and private file storage; **OpenAI** provides embeddings and structured answers. The project is ready to configure for **Vercel** deployment.

## Run locally

Requires Node.js 20.9 or newer, a Supabase project and an OpenAI API key.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). On Windows PowerShell, use `Copy-Item .env.example .env.local` in place of `cp`.

Before starting, run [`supabase/schema.sql`](supabase/schema.sql) in your Supabase project's SQL Editor and fill in `.env.local`. See [SETUP.md](SETUP.md) for the exact account, database, and Vercel steps. Upload [`examples/sample-handbook.md`](examples/sample-handbook.md) and ask **“What must happen before a release?”** to try the full pipeline.

## Project structure

| Path | Purpose |
| --- | --- |
| `app/page.js`, `app/globals.css` | Library, chat, citations and authentication UI |
| `app/api/` | Authenticated upload, retrieval and conversation endpoints |
| `lib/extract.js`, `lib/chunk.js` | File parsing and page-aware text splitting |
| `lib/ai.js`, `lib/indexer.js` | Embeddings, grounded answers and indexing |
| `supabase/schema.sql` | Tables, pgvector search, storage and access policies |

Run `npm test` for extraction and citation checks, or `npm run build` to verify the production build.
