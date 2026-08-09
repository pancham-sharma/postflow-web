ALTER TABLE public.oauth_states
  ADD COLUMN IF NOT EXISTS return_origin text;