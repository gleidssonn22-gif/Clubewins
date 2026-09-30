CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 500),
    created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS comments_video_created_at
    ON comments (video_id, created_at DESC);

CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL,
    viewer_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (poll_id, viewer_id)
);