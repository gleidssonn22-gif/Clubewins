CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    creator TEXT NOT NULL,
    caption TEXT NOT NULL DEFAULT '',
    object_key TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS videos_status_created_at
    ON videos (status, created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
    viewer_id TEXT NOT NULL,
    creator TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (viewer_id, creator)
);

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    reporter_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    details TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewed', 'dismissed')),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS reports_status_created_at
    ON reports (status, created_at DESC);