-- Posts queue
CREATE TABLE IF NOT EXISTS posts (
  id            SERIAL PRIMARY KEY,
  content       TEXT NOT NULL,
  image_url     TEXT,                        -- null for text-only posts
  post_type     VARCHAR(50) NOT NULL,        -- 'tech_tip_tuesday' | 'wait_what_wednesday' | 'friday_weekend'
  status        VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | approved | rejected | published | failed
  scheduled_for TIMESTAMPTZ,
  sms_sid       VARCHAR(100),               -- Twilio SID for reply matching
  fb_post_id    VARCHAR(100),               -- Facebook post ID after publish
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  published_at  TIMESTAMPTZ,
  error_message TEXT
);

-- Voice examples (few-shot tone reference for Claude)
CREATE TABLE IF NOT EXISTS voice_examples (
  id         SERIAL PRIMARY KEY,
  content    TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Settings (key-value store for config)
CREATE TABLE IF NOT EXISTS settings (
  key        VARCHAR(100) PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert defaults (idempotent — safe to run on every boot)
INSERT INTO settings (key, value) VALUES
  ('post_time_tuesday',   '09:00'),
  ('post_time_wednesday', '09:00'),
  ('post_time_friday',    '10:00'),
  ('sms_active',          'true')
ON CONFLICT (key) DO NOTHING;
