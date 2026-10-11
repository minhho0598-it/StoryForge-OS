ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS story_outline jsonb,
    ADD COLUMN IF NOT EXISTS beat_generation jsonb;
