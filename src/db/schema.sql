-- Sikh ID master database schema
-- Run once against an empty database: mysql -u root -p sikh_id_master < schema.sql

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sikh_id VARCHAR(20) UNIQUE NOT NULL,
  full_name VARCHAR(191) NOT NULL,
  email VARCHAR(191) UNIQUE NOT NULL,
  mobile VARCHAR(30) NULL,
  country VARCHAR(100) NULL,
  password_hash VARCHAR(255) NOT NULL,
  source_site VARCHAR(191) NULL,
  profile_completion TINYINT UNSIGNED NOT NULL DEFAULT 15,
  last_recalculated_at DATETIME NULL,
  last_reminder_sent_at DATETIME NULL,
  last_reminder_section VARCHAR(50) NULL,
  reminder_attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  allow_direct_messages BOOLEAN NOT NULL DEFAULT TRUE,
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_completion (profile_completion),
  INDEX idx_last_reminder (last_reminder_sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS profile_about (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  photo_url VARCHAR(500) NULL,
  date_of_birth DATE NULL,
  dob_visibility ENUM('public','private') NOT NULL DEFAULT 'private',
  city VARCHAR(191) NULL,
  residence_country VARCHAR(100) NULL,
  occupation_type VARCHAR(50) NULL,
  CONSTRAINT fk_about_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS profile_professional (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  job_title VARCHAR(191) NULL,
  company VARCHAR(191) NULL,
  industry VARCHAR(100) NULL,
  experience_years TINYINT UNSIGNED NULL,
  linkedin_url VARCHAR(500) NULL,
  CONSTRAINT fk_prof_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_interests (
  user_id BIGINT UNSIGNED NOT NULL,
  interest_tag VARCHAR(50) NOT NULL,
  PRIMARY KEY (user_id, interest_tag),
  CONSTRAINT fk_interest_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS user_group_preferences (
  user_id BIGINT UNSIGNED NOT NULL,
  platform_name VARCHAR(50) NOT NULL,
  subscribed BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (user_id, platform_name),
  CONSTRAINT fk_grouppref_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS communication_preferences (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  channel_email BOOLEAN NOT NULL DEFAULT TRUE,
  channel_sms BOOLEAN NOT NULL DEFAULT FALSE,
  channel_push BOOLEAN NOT NULL DEFAULT FALSE,
  channel_whatsapp BOOLEAN NOT NULL DEFAULT FALSE,
  topic_alerts BOOLEAN NOT NULL DEFAULT TRUE,
  topic_community_news BOOLEAN NOT NULL DEFAULT TRUE,
  topic_events BOOLEAN NOT NULL DEFAULT TRUE,
  topic_business BOOLEAN NOT NULL DEFAULT TRUE,
  topic_awards BOOLEAN NOT NULL DEFAULT TRUE,
  topic_new_projects BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_comm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS directory_listing (
  user_id BIGINT UNSIGNED PRIMARY KEY,
  wants_listing BOOLEAN NOT NULL DEFAULT FALSE,
  business_name VARCHAR(191) NULL,
  website VARCHAR(500) NULL,
  business_category VARCHAR(100) NULL,
  city VARCHAR(191) NULL,
  country VARCHAR(100) NULL,
  description TEXT NULL,
  contact_details VARCHAR(500) NULL,
  CONSTRAINT fk_dir_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS email_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  email_type ENUM('auto_reminder','manual_campaign') NOT NULL,
  section_key VARCHAR(50) NULL,
  segment_id BIGINT UNSIGNED NULL,
  template_key VARCHAR(100) NULL,
  status ENUM('queued','sent','failed','bounced') NOT NULL DEFAULT 'queued',
  sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_event_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_type (user_id, email_type),
  INDEX idx_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS segments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  filter_json JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_refresh_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Short-lived one-time codes used for the cross-domain SSO redirect handshake
CREATE TABLE IF NOT EXISTS sso_codes (
  code VARCHAR(64) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  site_domain VARCHAR(191) NOT NULL,
  redirect_uri VARCHAR(500) NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_sso_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  token_hash VARCHAR(255) NOT NULL,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_reset_token (token_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per requested code; a new /otp/request wipes any earlier
-- unconsumed code for the same user so only the latest one ever verifies.
CREATE TABLE IF NOT EXISTS login_otps (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  consumed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_otp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_otp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- The central login session (auth.thesikhgroup.com cookie) — lets a user hop
-- to a second WP site without re-entering credentials
CREATE TABLE IF NOT EXISTS central_sessions (
  id VARCHAR(64) PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  CONSTRAINT fk_central_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Content & engagement: events, news corner, hukamnama
-- Added to support admin-managed content shown on member dashboards.
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  description TEXT NULL,
  event_type ENUM('community','business','award','webinar','other') NOT NULL DEFAULT 'community',
  location VARCHAR(191) NULL,
  is_virtual BOOLEAN NOT NULL DEFAULT FALSE,
  event_date DATE NOT NULL,
  event_time VARCHAR(20) NULL,
  image_url VARCHAR(500) NULL,
  cta_label VARCHAR(100) NULL,
  cta_url VARCHAR(500) NULL,
  status ENUM('draft','published','cancelled') NOT NULL DEFAULT 'published',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_event_date (event_date),
  INDEX idx_event_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS news_updates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(191) NOT NULL,
  body TEXT NOT NULL,
  category ENUM('news','update','announcement','press') NOT NULL DEFAULT 'news',
  image_url VARCHAR(500) NULL,
  cta_label VARCHAR(100) NULL,
  cta_url VARCHAR(500) NULL,
  status ENUM('draft','published') NOT NULL DEFAULT 'published',
  published_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_news_published (published_at),
  INDEX idx_news_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One row per calendar date. Admin enters the day's authentic reading
-- (sourced from Sri Darbar Sahib's own broadcast/publication) rather than
-- this being generated — the Hukamnama must be the real day's Vaak, not
-- fabricated text, so this table is a publishing tool, not a content
-- generator.
CREATE TABLE IF NOT EXISTS hukamnama (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  hukam_date DATE NOT NULL UNIQUE,
  gurmukhi_text TEXT NULL,
  transliteration TEXT NULL,
  english_translation TEXT NULL,
  source_name VARCHAR(191) NOT NULL DEFAULT 'Sri Darbar Sahib, Amritsar',
  source_url VARCHAR(500) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- Engagement: RSVPs, saved items, activity feed
-- ============================================================

CREATE TABLE IF NOT EXISTS event_rsvps (
  user_id BIGINT UNSIGNED NOT NULL,
  event_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, event_id),
  CONSTRAINT fk_rsvp_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_rsvp_event FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Polymorphic on purpose (item_type + item_id instead of two FK columns) —
-- keeps this one table instead of one per saveable content type. No FK on
-- item_id since it points at different tables depending on item_type.
CREATE TABLE IF NOT EXISTS saved_items (
  user_id BIGINT UNSIGNED NOT NULL,
  item_type ENUM('event','news') NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, item_type, item_id),
  CONSTRAINT fk_saved_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Direct messages between two members. user_a_id is always the smaller of
-- the two user ids (enforced in the controller, not the DB) so the pair is
-- consistently ordered and the unique key can't be bypassed by swapping
-- sender/recipient.
CREATE TABLE IF NOT EXISTS conversations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_a_id BIGINT UNSIGNED NOT NULL,
  user_b_id BIGINT UNSIGNED NOT NULL,
  last_message_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_pair (user_a_id, user_b_id),
  CONSTRAINT fk_conv_a FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_conv_b FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  body TEXT NOT NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_msg_conv FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_msg_conv (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  subject VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open','resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ticket_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ticket_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  icon VARCHAR(10) NOT NULL,
  title VARCHAR(255) NOT NULL,
  link_url VARCHAR(500) NULL,
  read_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notif_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, created_at),
  INDEX idx_notif_unread (user_id, read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activity_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  icon VARCHAR(10) NOT NULL,
  description VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_activity_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_activity_user (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
