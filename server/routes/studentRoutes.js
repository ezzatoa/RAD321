const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const reportingService = require('../services/reportingService');
const { getDatabase } = require('../db/database');

// Guard all student routes
router.use(authenticate, requireRole('student', 'teacher', 'admin'));

// Configure Multer for assignment file attachments
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `sub-${req.user.id}-${req.params.labId}-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 } // 25MB max
});

// 1. Student Dashboard
router.get('/dashboard', (req, res) => {
  try {
    const db = getDatabase();
    const studentReport = reportingService.getStudentReport(req.user.id);

    // Get section announcements
    let announcements = [];
    if (req.user.section_id) {
      announcements = db.prepare(`
        SELECT m.*, u.name as sender_name
        FROM messages m
        JOIN users u ON m.sender_id = u.id
        WHERE m.recipient_section_id = ? OR m.recipient_user_id = ?
        ORDER BY m.created_at DESC
        LIMIT 10
      `).all(req.user.section_id, req.user.id);
    }

    res.json({
      student: studentReport.student,
      summary: studentReport.summary,
      labs: studentReport.labsBreakdown,
      announcements
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Get Specific Lab State for Student
router.get('/labs/:labId', (req, res) => {
  try {
    const db = getDatabase();
    const labId = req.params.labId;

    const submission = db.prepare(`
      SELECT *
      FROM lab_submissions
      WHERE user_id = ? AND lab_id = ?
    `).get(req.user.id, labId);

    const attachments = db.prepare(`
      SELECT id, original_filename, saved_filename, file_size, mime_type, created_at
      FROM submission_attachments
      WHERE user_id = ? AND lab_id = ?
    `).all(req.user.id, labId);

    let parsedState = {};
    let parsedRuns = [];
    let parsedRubric = {};
    let parsedAiFeedback = null;

    if (submission) {
      try { parsedState = JSON.parse(submission.state_data || '{}'); } catch (e) {}
      try { parsedRuns = JSON.parse(submission.runs_data || '[]'); } catch (e) {}
      try { parsedRubric = JSON.parse(submission.rubric_scores || '{}'); } catch (e) {}
      try { parsedAiFeedback = JSON.parse(submission.ai_feedback || 'null'); } catch (e) {}
    }

    res.json({
      labId,
      submission: submission ? {
        ...submission,
        state_data: parsedState,
        runs_data: parsedRuns,
        rubric_scores: parsedRubric,
        ai_feedback: parsedAiFeedback,
        attachments
      } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Save Lab State (Autosave / Progress Sync)
router.post('/labs/:labId/save', (req, res) => {
  try {
    const db = getDatabase();
    const labId = req.params.labId;
    const weekNumber = parseInt(labId.replace('lab-', ''), 10) || 1;
    const { state, runs, progressPercent, quizScore, quizTotal, prediction, rubricScores } = req.body;

    const existing = db.prepare('SELECT id, status FROM lab_submissions WHERE user_id = ? AND lab_id = ?').get(req.user.id, labId);

    if (existing && existing.status === 'graded') {
      // Return without overwriting finalized grade
      return res.json({ success: true, message: 'Lab is already graded. Changes saved to draft.', status: 'graded' });
    }

    const stateJson = JSON.stringify(state || {});
    const runsJson = JSON.stringify(runs || []);
    const rubricJson = JSON.stringify(rubricScores || {});

    if (existing) {
      db.prepare(`
        UPDATE lab_submissions
        SET
          prediction = COALESCE(?, prediction),
          state_data = ?,
          runs_data = ?,
          progress_percent = ?,
          quiz_score = COALESCE(?, quiz_score),
          quiz_total = COALESCE(?, quiz_total),
          rubric_scores = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        prediction || null,
        stateJson,
        runsJson,
        progressPercent || 0,
        quizScore !== undefined ? quizScore : null,
        quizTotal !== undefined ? quizTotal : 4,
        rubricJson,
        existing.id
      );
    } else {
      db.prepare(`
        INSERT INTO lab_submissions (
          user_id, lab_id, week_number, status, progress_percent, prediction,
          state_data, runs_data, quiz_score, quiz_total, rubric_scores, total_score
        ) VALUES (
          ?, ?, ?, 'in_progress', ?, ?,
          ?, ?, ?, ?, ?, 0
        )
      `).run(
        req.user.id,
        labId,
        weekNumber,
        progressPercent || 0,
        prediction || null,
        stateJson,
        runsJson,
        quizScore || 0,
        quizTotal || 4,
        rubricJson
      );
    }

    res.json({ success: true, message: 'Lab state autosaved to department server.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Formal Submit Lab Assignment
router.post('/labs/:labId/submit', (req, res) => {
  try {
    const db = getDatabase();
    const labId = req.params.labId;
    const weekNumber = parseInt(labId.replace('lab-', ''), 10) || 1;
    const { state, runs, quizScore, quizTotal, prediction, rubricScores } = req.body;

    const stateJson = JSON.stringify(state || {});
    const runsJson = JSON.stringify(runs || []);
    const rubricJson = JSON.stringify(rubricScores || {});

    const existing = db.prepare('SELECT id, status FROM lab_submissions WHERE user_id = ? AND lab_id = ?').get(req.user.id, labId);

    let submissionId = existing?.id;

    if (existing) {
      db.prepare(`
        UPDATE lab_submissions
        SET
          status = 'submitted',
          progress_percent = 100,
          prediction = COALESCE(?, prediction),
          state_data = ?,
          runs_data = ?,
          quiz_score = COALESCE(?, quiz_score),
          quiz_total = COALESCE(?, quiz_total),
          rubric_scores = ?,
          submitted_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        prediction || null,
        stateJson,
        runsJson,
        quizScore !== undefined ? quizScore : null,
        quizTotal !== undefined ? quizTotal : 4,
        rubricJson,
        existing.id
      );
    } else {
      const result = db.prepare(`
        INSERT INTO lab_submissions (
          user_id, lab_id, week_number, status, progress_percent, prediction,
          state_data, runs_data, quiz_score, quiz_total, rubric_scores, total_score, submitted_at
        ) VALUES (
          ?, ?, ?, 'submitted', 100, ?,
          ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP
        )
      `).run(
        req.user.id,
        labId,
        weekNumber,
        prediction || null,
        stateJson,
        runsJson,
        quizScore || 0,
        quizTotal || 4,
        rubricJson
      );
      submissionId = result.lastInsertRowid;
    }

    // Attach any uploaded attachments to this submission
    db.prepare(`
      UPDATE submission_attachments
      SET submission_id = ?
      WHERE user_id = ? AND lab_id = ? AND submission_id IS NULL
    `).run(submissionId, req.user.id, labId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES (?, 'STUDENT_SUBMIT_LAB', ?)
    `).run(req.user.id, `Submitted ${labId} assignment for evaluation`);

    res.json({
      success: true,
      message: `Lab ${weekNumber} assignment successfully submitted! It has been queued for teacher evaluation.`,
      submissionId
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Upload File Attachment for Lab
router.post('/labs/:labId/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const db = getDatabase();
    const labId = req.params.labId;

    // Check if submission exists
    const sub = db.prepare('SELECT id FROM lab_submissions WHERE user_id = ? AND lab_id = ?').get(req.user.id, labId);

    const stmt = db.prepare(`
      INSERT INTO submission_attachments (
        submission_id, user_id, lab_id, original_filename, saved_filename, file_path, file_size, mime_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      sub ? sub.id : null,
      req.user.id,
      labId,
      req.file.originalname,
      req.file.filename,
      req.file.path,
      req.file.size,
      req.file.mimetype
    );

    res.status(201).json({
      success: true,
      message: 'Attachment uploaded successfully.',
      attachment: {
        id: result.lastInsertRowid,
        original_filename: req.file.originalname,
        file_size: req.file.size,
        mime_type: req.file.mimetype
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Delete File Attachment
router.delete('/attachments/:id', (req, res) => {
  try {
    const db = getDatabase();
    const attachId = Number(req.params.id);

    const attach = db.prepare('SELECT * FROM submission_attachments WHERE id = ?').get(attachId);
    if (!attach) return res.status(404).json({ error: 'Attachment not found.' });

    // Authorization check
    if (attach.user_id !== req.user.id && req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Access denied.' });
    }

    // Remove file from disk
    if (fs.existsSync(attach.file_path)) {
      try { fs.unlinkSync(attach.file_path); } catch (e) {}
    }

    db.prepare('DELETE FROM submission_attachments WHERE id = ?').run(attachId);

    res.json({ success: true, message: 'Attachment deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Announcements Inbox
router.get('/announcements', (req, res) => {
  try {
    const db = getDatabase();
    const announcements = db.prepare(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.recipient_section_id = ? OR m.recipient_user_id = ?
      ORDER BY m.created_at DESC
    `).all(req.user.section_id || 0, req.user.id);

    res.json({ announcements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
