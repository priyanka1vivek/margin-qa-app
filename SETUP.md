# Setup guide

These steps connect Margin to your own accounts. The `.env.local` file is excluded from Git.

## 1. Supabase

1. Create a Supabase project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, paste and run all of [`supabase/schema.sql`](supabase/schema.sql). This creates the pgvector extension, four tables, the private `documents` storage bucket, row level security policies and the `match_document_chunks` search function.
3. Under **Authentication → Providers**, enable Email. Keep email confirmation enabled if you want users to verify their addresses. For local testing, add `http://localhost:3000` to **Authentication → URL Configuration → Redirect URLs** and set the Site URL there.
4. Under **Project Settings → API**, copy the project URL and the publishable/anon key. Use the anon or publishable key, never a service role key, for `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## 2. OpenAI

Create an API key with available API credit. The app uses `text-embedding-3-small` at 1,536 dimensions and `gpt-4o-mini` for structured answers. ChatGPT subscriptions and API billing are separate.

## 3. Local environment

Install Node.js 20.9 or newer. Then:

```powershell
git clone https://github.com/your-username/your-repo.git
cd your-repo
Copy-Item .env.example .env.local
npm install
npm run dev
```

Edit `.env.local` before starting:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-or-publishable-key
OPENAI_API_KEY=your-openai-api-key
OPENAI_CHAT_MODEL=gpt-4o-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

Use `cp .env.example .env.local` on macOS or Linux. Go to [http://localhost:3000](http://localhost:3000), create an account, and follow the confirmation link if email confirmation is enabled. Upload `examples/sample-handbook.md`, select it, and ask a question. A question outside its contents should produce a clear “not enough evidence” response.

## 4. Vercel

1. Push the repository to GitHub and import it as a new project in [Vercel](https://vercel.com).
2. Add all five variables from `.env.local` to the Vercel project's Environment Variables; deploy again after adding them.
3. Add the deployed domain to Supabase Authentication's Site URL and Redirect URLs.
4. Test sign-up, upload, a cited answer, a question with no support in the document, and reopening the original from a citation.

The upload route limits files to 5 MB and its processing function is configured for 60 seconds. Very long or image-only PDFs may fail: this version extracts text but does not perform OCR. A failed upload remains visible with a retry action. The app stores up to 80 chunks per file and limits a new conversation to 12 selected documents.

## Useful checks

```powershell
npm test
npm run build
```

Do not commit `.env.local`. If sign-in works but document requests return 400, confirm that the SQL setup completed and that the Storage bucket and access policies exist. If indexing fails, check the OpenAI key, billing and server logs. The interface displays the indexing error and offers a retry.
