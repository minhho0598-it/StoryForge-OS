ALTER TABLE public.chapters
    ADD COLUMN IF NOT EXISTS memory_before_chapter jsonb;

ALTER TABLE public.beats
    ADD COLUMN IF NOT EXISTS pronoun_mapping text NOT NULL DEFAULT '';
