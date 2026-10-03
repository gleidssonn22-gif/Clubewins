CREATE TABLE IF NOT EXISTS video_likes (
    video_id TEXT NOT NULL,
    viewer_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (video_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS video_likes_video_id
    ON video_likes (video_id);