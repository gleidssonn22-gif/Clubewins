ALTER TABLE videos
    ADD COLUMN category TEXT NOT NULL DEFAULT 'historias'
    CHECK (category IN ('casal', 'amor-proprio', 'amizade', 'distancia', 'historias'));

ALTER TABLE videos
    ADD COLUMN reply_to TEXT;

CREATE INDEX IF NOT EXISTS videos_category_status_created_at
    ON videos (category, status, created_at DESC);