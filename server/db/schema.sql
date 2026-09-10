-- =========================================================================
-- RAD 321: Image Recording & Analysis — Department VPS Database Schema
-- SQLite 3 Database
-- =========================================================================

PRAGMA foreign_keys = ON;

-- -------------------------------------------------------------------------
-- 1. System Settings Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------------------
-- 2. Sections Table (Student Groupings by Section, Class Year, Gender)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  gender_target TEXT DEFAULT 'Mixed' CHECK(gender_target IN ('Male', 'Female', 'Mixed')),
  class_year TEXT DEFAULT 'Year 3 - Cohort 2026',
  academic_term TEXT DEFAULT 'Fall 2026',
  teacher_id INTEGER,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id) ON DELETE SET NULL
);

-- -------------------------------------------------------------------------
-- 3. Users Table (Admin, Teacher, Student)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  student_id TEXT UNIQUE,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin', 'teacher', 'student')),
  gender TEXT DEFAULT 'Male' CHECK(gender IN ('Male', 'Female', 'Other')),
  class_year TEXT DEFAULT 'Year 3',
  section_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'rejected', 'suspended')),
  activation_token TEXT,
  activation_token_expires DATETIME,
  reset_token TEXT,
  reset_token_expires DATETIME,
  last_login DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL
);

-- -------------------------------------------------------------------------
-- 4. Lab Submissions Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS lab_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  lab_id TEXT NOT NULL,
  week_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'in_lab_submitted', 'submitted', 'graded')),
  progress_percent INTEGER DEFAULT 0,
  prediction TEXT,
  state_data TEXT, -- JSON blob of all lab fields, quiz attempts, and activity states
  runs_data TEXT, -- JSON array of recorded experimental runs
  quiz_score REAL DEFAULT 0,
  quiz_total REAL DEFAULT 4,
  rubric_scores TEXT, -- JSON object: { c1, c2, c3, c4, c5, part1Total, part2Total }
  total_score REAL DEFAULT 0, -- Total out of 20 points
  ai_score REAL,
  ai_feedback TEXT, -- Detailed JSON evaluation from Gemini Flash
  ai_graded_at DATETIME,
  teacher_feedback TEXT,
  teacher_graded_by INTEGER,
  teacher_graded_at DATETIME,
  in_lab_submitted_at DATETIME,
  excel_submitted_at DATETIME,
  excel_file_id INTEGER,
  excel_analysis_notes TEXT,
  submitted_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (teacher_graded_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (excel_file_id) REFERENCES submission_attachments(id) ON DELETE SET NULL,
  UNIQUE(user_id, lab_id)
);

-- -------------------------------------------------------------------------
-- 5. Submission Attachments Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS submission_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER,
  user_id INTEGER NOT NULL,
  lab_id TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  saved_filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES lab_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- -------------------------------------------------------------------------
-- 6. Messages & Section Announcements Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sender_id INTEGER NOT NULL,
  recipient_user_id INTEGER,
  recipient_section_id INTEGER,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'announcement' CHECK(type IN ('announcement', 'direct', 'feedback', 'system')),
  is_email_dispatched INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_section_id) REFERENCES sections(id) ON DELETE CASCADE
);

-- -------------------------------------------------------------------------
-- 7. Outbox Emails Table (Local VPS Inspection & SMTP Queue)
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS outbox_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  token_link TEXT,
  status TEXT DEFAULT 'logged' CHECK(status IN ('sent', 'queued', 'failed', 'logged')),
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  sent_at DATETIME
);

-- -------------------------------------------------------------------------
-- 8. Audit Logs Table
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  details TEXT,
  ip_address TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create Indexes for High-Performance Queries
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role_status ON users(role, status);
CREATE INDEX IF NOT EXISTS idx_users_section ON users(section_id);
CREATE INDEX IF NOT EXISTS idx_users_gender ON users(gender);
CREATE INDEX IF NOT EXISTS idx_submissions_user_lab ON lab_submissions(user_id, lab_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON lab_submissions(status);
CREATE INDEX IF NOT EXISTS idx_attachments_user_lab ON submission_attachments(user_id, lab_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_section ON messages(recipient_section_id);
CREATE INDEX IF NOT EXISTS idx_messages_recipient_user ON messages(recipient_user_id);
CREATE INDEX IF NOT EXISTS idx_outbox_to ON outbox_emails(to_email);
