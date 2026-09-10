const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, 'rad321.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let dbInstance = null;

function getDatabase() {
  if (dbInstance) return dbInstance;

  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = new Database(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');

  // Initialize schema if tables don't exist
  initSchema(dbInstance);

  return dbInstance;
}

function initSchema(db) {
  if (fs.existsSync(SCHEMA_PATH)) {
    const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
    db.exec(schemaSql);
  }

  // Safe migrations for existing SQLite databases
  try {
    const masterSql = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='lab_submissions'").get();
    if (masterSql && masterSql.sql && !masterSql.sql.includes("'in_lab_submitted'")) {
      db.exec(`
        PRAGMA foreign_keys = OFF;
        CREATE TABLE lab_submissions_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          lab_id TEXT NOT NULL,
          week_number INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'in_lab_submitted', 'submitted', 'graded')),
          progress_percent INTEGER DEFAULT 0,
          prediction TEXT,
          state_data TEXT,
          runs_data TEXT,
          quiz_score REAL DEFAULT 0,
          quiz_total REAL DEFAULT 4,
          rubric_scores TEXT,
          total_score REAL DEFAULT 0,
          ai_score REAL,
          ai_feedback TEXT,
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
        INSERT INTO lab_submissions_migrated (
          id, user_id, lab_id, week_number, status, progress_percent, prediction, state_data, runs_data,
          quiz_score, quiz_total, rubric_scores, total_score, ai_score, ai_feedback, ai_graded_at,
          teacher_feedback, teacher_graded_by, teacher_graded_at, submitted_at, created_at, updated_at
        )
        SELECT 
          id, user_id, lab_id, week_number, status, progress_percent, prediction, state_data, runs_data,
          quiz_score, quiz_total, rubric_scores, total_score, ai_score, ai_feedback, ai_graded_at,
          teacher_feedback, teacher_graded_by, teacher_graded_at, submitted_at, created_at, updated_at
        FROM lab_submissions;
        DROP TABLE lab_submissions;
        ALTER TABLE lab_submissions_migrated RENAME TO lab_submissions;
        PRAGMA foreign_keys = ON;
      `);
      console.log('Successfully migrated lab_submissions table schema with updated CHECK constraint.');
    } else {
      const cols = db.prepare("PRAGMA table_info(lab_submissions)").all().map(c => c.name);
      if (!cols.includes('in_lab_submitted_at')) {
        db.exec("ALTER TABLE lab_submissions ADD COLUMN in_lab_submitted_at DATETIME;");
      }
      if (!cols.includes('excel_submitted_at')) {
        db.exec("ALTER TABLE lab_submissions ADD COLUMN excel_submitted_at DATETIME;");
      }
      if (!cols.includes('excel_file_id')) {
        db.exec("ALTER TABLE lab_submissions ADD COLUMN excel_file_id INTEGER;");
      }
      if (!cols.includes('excel_analysis_notes')) {
        db.exec("ALTER TABLE lab_submissions ADD COLUMN excel_analysis_notes TEXT;");
      }
    }
  } catch (err) {
    console.warn('Migration check note:', err.message);
  }
}

module.exports = {
  getDatabase,
  DB_PATH
};
