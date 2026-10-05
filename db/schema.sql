-- Agence IA Tech Teranga — schéma PostgreSQL
-- Idempotent : exécuté au démarrage de l'application.

CREATE TABLE IF NOT EXISTS users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email           text NOT NULL UNIQUE,
  name            text NOT NULL,
  password_hash   text NOT NULL,
  role            text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  monthly_budget_usd numeric(10,2),          -- NULL = illimité
  active          boolean NOT NULL DEFAULT true,
  company_context text NOT NULL DEFAULT '',   -- contexte injecté dans chaque agent
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id          text PRIMARY KEY,               -- sha256 du jeton de session
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS projects (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projects_user_idx ON projects(user_id);

CREATE TABLE IF NOT EXISTS runs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  goal        text NOT NULL,
  summary     text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','done','failed','cancelled')),
  tier        text NOT NULL DEFAULT 'standard',
  web_search  boolean NOT NULL DEFAULT true,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_user_idx ON runs(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS missions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_slug  text NOT NULL,
  project_id  uuid REFERENCES projects(id) ON DELETE SET NULL,
  title       text NOT NULL,
  status      text NOT NULL DEFAULT 'a_valider' CHECK (status IN ('en_cours','a_valider','validee','archivee','echec')),
  tier        text NOT NULL DEFAULT 'standard',
  web_search  boolean NOT NULL DEFAULT true,
  run_id      uuid REFERENCES runs(id) ON DELETE SET NULL,
  step_index  integer,
  cost_usd    numeric(12,6) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS missions_user_idx ON missions(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id          bigserial PRIMARY KEY,
  mission_id  uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('user','assistant')),
  text        text NOT NULL,
  content     jsonb,          -- blocs bruts de l'API (contexte de recherche chiffré pour les tours suivants)
  sources     jsonb NOT NULL DEFAULT '[]',
  searches    jsonb NOT NULL DEFAULT '[]',
  model       text,
  cost_usd    numeric(12,6) NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_mission_idx ON messages(mission_id, id);

CREATE TABLE IF NOT EXISTS run_steps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id      uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  idx         integer NOT NULL,
  agent_slug  text NOT NULL,
  mission     text NOT NULL,
  why         text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','done','failed','skipped')),
  mission_id  uuid REFERENCES missions(id) ON DELETE SET NULL,
  error       text,
  UNIQUE (run_id, idx)
);

CREATE TABLE IF NOT EXISTS usage (
  id            bigserial PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id    uuid REFERENCES missions(id) ON DELETE SET NULL,
  run_id        uuid REFERENCES runs(id) ON DELETE SET NULL,
  kind          text NOT NULL,              -- mission | plan
  model         text NOT NULL,
  input_tokens  integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_read_tokens  integer NOT NULL DEFAULT 0,
  cache_write_tokens integer NOT NULL DEFAULT 0,
  web_searches  integer NOT NULL DEFAULT 0,
  cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_user_month_idx ON usage(user_id, created_at);

-- ---------------------------------------------------------------- Studio vidéo
CREATE TABLE IF NOT EXISTS app_settings (
  key         text PRIMARY KEY,
  value_enc   text NOT NULL,              -- chiffré (AES-256-GCM)
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_profiles (
  user_id           uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name      text NOT NULL DEFAULT '',
  photo_path        text,                 -- relatif à MEDIA_DIR
  photo_remote_url  text,                 -- copie hébergée chez le fournisseur
  photo_remote_at   timestamptz,
  voice_provider    text NOT NULL DEFAULT 'chatterbox' CHECK (voice_provider IN ('chatterbox','elevenlabs')),
  voice_sample_path text,
  voice_remote_url  text,
  voice_remote_at   timestamptz,
  eleven_voice_id   text,
  voice_language    text NOT NULL DEFAULT 'french',
  consent_at        timestamptz,          -- l'utilisateur certifie que c'est sa propre image et sa propre voix
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS studio_videos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,
  run_id        uuid REFERENCES runs(id) ON DELETE SET NULL,
  format        text NOT NULL,
  title         text NOT NULL DEFAULT '',
  brief         jsonb NOT NULL DEFAULT '{}',
  storyboard    jsonb,
  status        text NOT NULL DEFAULT 'scripting'
                CHECK (status IN ('scripting','ready','rendering','done','failed','cancelled')),
  progress      jsonb NOT NULL DEFAULT '{}',
  output_path   text,
  thumb_path    text,
  estimate_usd  numeric(12,6) NOT NULL DEFAULT 0,
  cost_usd      numeric(12,6) NOT NULL DEFAULT 0,
  error         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS studio_videos_user_idx ON studio_videos(user_id, updated_at DESC);
ALTER TABLE usage ADD COLUMN IF NOT EXISTS video_id uuid REFERENCES studio_videos(id) ON DELETE SET NULL;
