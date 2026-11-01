ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS escalation text NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS turning_point text NOT NULL DEFAULT '';
