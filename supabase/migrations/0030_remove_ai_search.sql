-- 0030: Search with AI is removed (2026-10-13). Its search history table goes with it.
-- Everything needed to bring it back, including this table's SQL, is in docs/ai-search.md.
drop table if exists public.ai_searches;
