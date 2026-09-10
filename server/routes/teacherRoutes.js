const express = require('express');
const router = express.Router();
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const geminiGradingService = require('../services/geminiGradingService');
const reportingService = require('../services/reportingService');
const emailService = require('../services/emailService');
const { getDatabase } = require('../db/database');

// Guard all teacher routes (both teacher and admin have access)
router.use(authenticate, requireRole('teacher', 'admin'));

// 1. Teacher Dashboard
router.get('/dashboard', (req, res) => {
  try {
    const db = getDatabase();
    const isTeacher = req.user.role === 'teacher';
    const teacherFilter = isTeacher ? 'WHERE teacher_id = ' + req.user.id : '';

    const sections = db.prepare(`
      SELECT s.*, (SELECT COUNT(*) FROM users WHERE section_id = s.id AND role = 'student') as student_count
      FROM sections s
      ${teacherFilter}
      ORDER BY s.name ASC
    `).all();

    const sectionIds = sections.map(s => s.id);
    let totalStudents = 0;
    sections.forEach(s => totalStudents += s.student_count);

    const pendingSubmissions = db.prepare(`
      SELECT COUNT(*) as count
      FROM lab_submissions s
      JOIN users u ON s.user_id = u.id
      WHERE s.status = 'submitted'
    `).get().count;

    const gradedSubmissions = db.prepare(`
      SELECT COUNT(*) as count
      FROM lab_submissions s
      JOIN users u ON s.user_id = u.id
      WHERE s.status = 'graded'
    `).get().count;

    res.json({
      summary: {
        totalSections: sections.length,
        totalStudents,
        pendingSubmissions,
        gradedSubmissions
      },
      sections
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Sections Management
router.get('/sections', (req, res) => {
  try {
    const db = getDatabase();
    const sections = db.prepare(`
      SELECT s.*, u.name as teacher_name,
             (SELECT COUNT(*) FROM users WHERE section_id = s.id AND role = 'student') as student_count
      FROM sections s
      LEFT JOIN users u ON s.teacher_id = u.id
      ORDER BY s.name ASC
    `).all();

    res.json({ sections });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sections/:id/roster', (req, res) => {
  try {
    const db = getDatabase();
    const sectionId = Number(req.params.id);
    const students = db.prepare(`
      SELECT id, name, student_id, email, gender, class_year, status, last_login
      FROM users
      WHERE section_id = ? AND role = 'student'
      ORDER BY name ASC
    `).all(sectionId);

    res.json({ students });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/sections', (req, res) => {
  try {
    const db = getDatabase();
    const { name, code, gender_target, class_year, academic_term, description } = req.body;

    const stmt = db.prepare(`
      INSERT INTO sections (name, code, gender_target, class_year, academic_term, teacher_id, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name.trim(),
      code.trim().toUpperCase(),
      gender_target || 'Mixed',
      class_year || 'Year 3 - Cohort 2026',
      academic_term || 'Fall 2026',
      req.user.id,
      description || ''
    );

    res.status(201).json({ success: true, sectionId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/sections/:id', (req, res) => {
  try {
    const db = getDatabase();
    const sectionId = Number(req.params.id);
    const { name, code, gender_target, class_year, academic_term, description } = req.body;

    db.prepare(`
      UPDATE sections
      SET name = ?, code = ?, gender_target = ?, class_year = ?, academic_term = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      code.toUpperCase(),
      gender_target,
      class_year,
      academic_term,
      description,
      sectionId
    );

    res.json({ success: true, message: 'Section updated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/sections/:id/students', (req, res) => {
  try {
    const db = getDatabase();
    const sectionId = Number(req.params.id);
    const { studentIds } = req.body; // array of user IDs

    const updateStmt = db.prepare('UPDATE users SET section_id = ? WHERE id = ?');
    for (const sid of (studentIds || [])) {
      updateStmt.run(sectionId, Number(sid));
    }

    res.json({ success: true, message: 'Students assigned to section.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/sections/:id/students/:studentId', (req, res) => {
  try {
    const db = getDatabase();
    const studentId = Number(req.params.studentId);
    db.prepare('UPDATE users SET section_id = NULL WHERE id = ?').run(studentId);
    res.json({ success: true, message: 'Student removed from section.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 3. Section Messaging & Mass Emailing
router.post('/sections/:id/broadcast', async (req, res) => {
  try {
    const db = getDatabase();
    const sectionId = Number(req.params.id);
    const { subject, body, sendEmail } = req.body;

    if (!subject || !body) {
      return res.status(400).json({ error: 'Subject and message body are required.' });
    }

    // Insert message into DB
    db.prepare(`
      INSERT INTO messages (sender_id, recipient_section_id, subject, body, type, is_email_dispatched)
      VALUES (?, ?, ?, ?, 'announcement', ?)
    `).run(req.user.id, sectionId, subject, body, sendEmail ? 1 : 0);

    let emailResults = [];
    if (sendEmail) {
      const students = db.prepare('SELECT email, name FROM users WHERE section_id = ? AND role = "student" AND status = "active"').all(sectionId);
      emailResults = await emailService.sendAnnouncementEmail({
        recipients: students,
        subject,
        body,
        senderName: req.user.name
      });
    }

    res.json({
      success: true,
      message: `Announcement posted to section! ${sendEmail ? `${emailResults.length} emails dispatched.` : ''}`
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Submissions & Grading Hub
router.get('/submissions', (req, res) => {
  try {
    const db = getDatabase();
    const { labId, sectionId, gender, status, search } = req.query;

    let query = `
      SELECT s.id, s.user_id, s.lab_id, s.week_number, s.status, s.progress_percent, s.total_score,
             s.quiz_score, s.quiz_total, s.ai_score, s.in_lab_submitted_at, s.excel_submitted_at, s.excel_file_id,
             s.submitted_at, s.ai_graded_at, s.teacher_graded_at,
             u.name as student_name, u.student_id, u.gender, u.email, sec.name as section_name, sec.id as section_id,
             (SELECT COUNT(*) FROM submission_attachments WHERE submission_id = s.id) as attachment_count
      FROM lab_submissions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN sections sec ON u.section_id = sec.id
      WHERE 1=1
    `;
    const params = [];

    if (labId) { query += ' AND s.lab_id = ?'; params.push(labId); }
    if (sectionId) { query += ' AND u.section_id = ?'; params.push(Number(sectionId)); }
    if (gender) { query += ' AND u.gender = ?'; params.push(gender); }
    if (status) { query += ' AND s.status = ?'; params.push(status); }
    if (search) {
      query += ' AND (u.name LIKE ? OR u.student_id LIKE ? OR u.email LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY s.submitted_at DESC, s.updated_at DESC';
    const submissions = db.prepare(query).all(...params);

    res.json({ submissions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/submissions/:id', (req, res) => {
  try {
    const db = getDatabase();
    const submissionId = Number(req.params.id);

    const submission = db.prepare(`
      SELECT s.*, u.name as student_name, u.student_id, u.gender, u.email, u.class_year, sec.name as section_name,
             t.name as teacher_grader_name
      FROM lab_submissions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN sections sec ON u.section_id = sec.id
      LEFT JOIN users t ON s.teacher_graded_by = t.id
      WHERE s.id = ?
    `).get(submissionId);

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found.' });
    }

    const attachments = db.prepare(`
      SELECT id, original_filename, saved_filename, file_size, mime_type, created_at
      FROM submission_attachments
      WHERE submission_id = ?
    `).all(submissionId);

    let parsedState = {};
    let parsedRuns = [];
    let parsedRubric = {};
    let parsedAiFeedback = null;

    try { parsedState = JSON.parse(submission.state_data || '{}'); } catch (e) {}
    try { parsedRuns = JSON.parse(submission.runs_data || '[]'); } catch (e) {}
    try { parsedRubric = JSON.parse(submission.rubric_scores || '{}'); } catch (e) {}
    try { parsedAiFeedback = JSON.parse(submission.ai_feedback || 'null'); } catch (e) {}

    res.json({
      submission: {
        ...submission,
        state_data: parsedState,
        runs_data: parsedRuns,
        rubric_scores: parsedRubric,
        ai_feedback: parsedAiFeedback,
        attachments
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Automated AI Grading with Gemini Flash 3.7
router.post('/submissions/:id/grade-ai', async (req, res) => {
  try {
    const submissionId = Number(req.params.id);
    const result = await geminiGradingService.gradeSubmission(submissionId);
    res.json({
      success: true,
      message: 'Submission successfully evaluated with Gemini Flash 3.7!',
      evaluation: result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Batch AI Grade
router.post('/batch-grade-ai', async (req, res) => {
  try {
    const { submissionIds } = req.body; // array of submission IDs or empty for all submitted
    const db = getDatabase();

    let targetIds = submissionIds;
    if (!targetIds || targetIds.length === 0) {
      const pending = db.prepare('SELECT id FROM lab_submissions WHERE status = "submitted"').all();
      targetIds = pending.map(p => p.id);
    }

    const results = [];
    for (const sid of targetIds) {
      try {
        const evalRes = await geminiGradingService.gradeSubmission(sid);
        results.push({ submissionId: sid, success: true, score: evalRes.totalScore });
      } catch (e) {
        results.push({ submissionId: sid, success: false, error: e.message });
      }
    }

    res.json({
      success: true,
      message: `Batch grading complete: ${results.filter(r => r.success).length}/${results.length} submissions graded.`,
      results
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Manual Grade Override & Teacher Feedback
router.post('/submissions/:id/grade-manual', (req, res) => {
  try {
    const db = getDatabase();
    const submissionId = Number(req.params.id);
    const { rubricScores, totalScore, teacherFeedback } = req.body;

    db.prepare(`
      UPDATE lab_submissions
      SET
        rubric_scores = ?,
        total_score = ?,
        teacher_feedback = ?,
        teacher_graded_by = ?,
        teacher_graded_at = CURRENT_TIMESTAMP,
        status = 'graded',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      JSON.stringify(rubricScores || {}),
      Number(totalScore),
      teacherFeedback || '',
      req.user.id,
      submissionId
    );

    res.json({ success: true, message: 'Grade updated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. Progress and Assessment Reporting Endpoints
// Individual Student Report
router.get('/reports/student/:id', (req, res) => {
  try {
    const userId = Number(req.params.id);
    const report = reportingService.getStudentReport(userId);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Section-based Report
router.get('/reports/section/:id', (req, res) => {
  try {
    const sectionId = Number(req.params.id);
    const report = reportingService.getSectionReport(sectionId);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Course-wide Analytics (Class & Gender Comparative)
router.get('/reports/course-analytics', (req, res) => {
  try {
    const analytics = reportingService.getCourseAnalytics();
    res.json(analytics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export CSV Gradebook
router.get('/reports/export-csv', (req, res) => {
  try {
    const sectionId = req.query.sectionId ? Number(req.query.sectionId) : null;
    const csvContent = reportingService.generateGradebookCSV(sectionId);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=RAD321_Gradebook_${sectionId ? 'Section_' + sectionId : 'All'}_${new Date().toISOString().slice(0,10)}.csv`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
