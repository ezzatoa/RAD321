const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { authenticate, requireRole } = require('../middleware/authMiddleware');
const authService = require('../services/authService');
const emailService = require('../services/emailService');
const { getDatabase } = require('../db/database');

// Guard all admin routes
router.use(authenticate, requireRole('admin'));

// 1. Admin Dashboard Stats
router.get('/dashboard', (req, res) => {
  try {
    const db = getDatabase();
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const pendingCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE status = 'pending'").get().count;
    const activeStudents = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'student' AND status = 'active'").get().count;
    const teachersCount = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'teacher'").get().count;
    const totalSections = db.prepare('SELECT COUNT(*) as count FROM sections').get().count;
    const totalSubmissions = db.prepare('SELECT COUNT(*) as count FROM lab_submissions').get().count;
    const gradedSubmissions = db.prepare("SELECT COUNT(*) as count FROM lab_submissions WHERE status = 'graded'").get().count;

    res.json({
      stats: {
        totalUsers,
        pendingApprovals: pendingCount,
        activeStudents,
        teachersCount,
        totalSections,
        totalSubmissions,
        gradedSubmissions
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Pending Student Approvals
router.get('/pending-students', (req, res) => {
  try {
    const db = getDatabase();
    const pending = db.prepare(`
      SELECT u.id, u.name, u.student_id, u.email, u.gender, u.class_year, u.section_id, u.created_at, s.name as section_name
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE u.status = 'pending'
      ORDER BY u.created_at ASC
    `).all();

    res.json({ pending });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Approve Student
router.post('/approve-student/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const db = getDatabase();

    // Dynamically resolve public appUrl based on live request or settings
    let dbUrl = db.prepare("SELECT value FROM system_settings WHERE key = 'app_url'").get()?.value;
    const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const requestUrl = host ? `${proto}://${host}` : null;

    let appUrl = process.env.APP_URL;
    if (!appUrl || appUrl.includes('localhost')) {
      if (requestUrl && !requestUrl.includes('localhost')) {
        appUrl = requestUrl;
      } else if (dbUrl && !dbUrl.includes('localhost')) {
        appUrl = dbUrl;
      } else {
        appUrl = requestUrl || dbUrl || 'https://rad321.amsc.education';
      }
    }

    // Automatically update system_settings if live public domain is detected
    if (appUrl && !appUrl.includes('localhost') && dbUrl !== appUrl) {
      try {
        db.prepare("UPDATE system_settings SET value = ? WHERE key = 'app_url'").run(appUrl);
      } catch (e) {}
    }

    const result = await authService.approveStudent(userId, req.user.id, appUrl);
    const emailResult = await emailService.sendActivationEmail(result.user, result.activationToken, appUrl);

    res.json({
      success: true,
      message: `Student ${result.user.name} approved! Activation token email dispatched.`,
      user: result.user,
      activationLink: result.activationLink,
      emailStatus: emailResult.status
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 4. Reject Student
router.post('/reject-student/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { reason } = req.body;
    await authService.rejectStudent(userId, req.user.id, reason);
    res.json({ success: true, message: 'Student application rejected.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 5. User Management (CRUD)
router.get('/users', (req, res) => {
  try {
    const db = getDatabase();
    const { role, status, sectionId, gender, search } = req.query;

    let query = `
      SELECT u.id, u.name, u.student_id, u.email, u.role, u.gender, u.class_year, u.section_id, u.status, u.last_login, u.created_at,
             s.name as section_name, s.code as section_code
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE 1=1
    `;
    const params = [];

    if (role) { query += ' AND u.role = ?'; params.push(role); }
    if (status) { query += ' AND u.status = ?'; params.push(status); }
    if (sectionId) { query += ' AND u.section_id = ?'; params.push(Number(sectionId)); }
    if (gender) { query += ' AND u.gender = ?'; params.push(gender); }
    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ? OR u.student_id LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ' ORDER BY u.role ASC, u.name ASC';
    const users = db.prepare(query).all(...params);

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/users/:id', (req, res) => {
  try {
    const db = getDatabase();
    const userId = Number(req.params.id);
    const user = db.prepare(`
      SELECT u.id, u.name, u.student_id, u.email, u.role, u.gender, u.class_year, u.section_id, u.status, u.last_login, u.created_at,
             s.name as section_name, s.code as section_code
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE u.id = ?
    `).get(userId);

    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', (req, res) => {
  try {
    const db = getDatabase();
    const { name, student_id, email, password, role, gender, class_year, section_id, status } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Name, email, and role are required.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'User with this email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = password ? bcrypt.hashSync(password, salt) : null;

    const stmt = db.prepare(`
      INSERT INTO users (name, student_id, email, password_hash, role, gender, class_year, section_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      name.trim(),
      student_id ? student_id.trim() : null,
      cleanEmail,
      passwordHash,
      role,
      gender || 'Male',
      class_year || 'Year 3',
      section_id ? Number(section_id) : null,
      status || 'active'
    );

    db.prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'ADMIN_CREATE_USER', ?)").run(
      req.user.id,
      `Created ${role} account for ${name} (${cleanEmail})`
    );

    res.status(201).json({ success: true, userId: result.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/users/:id', (req, res) => {
  try {
    const db = getDatabase();
    const userId = Number(req.params.id);
    const { name, student_id, email, role, gender, class_year, section_id, status, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    let passwordHash = user.password_hash;
    if (password && password.trim().length > 0) {
      const salt = bcrypt.genSaltSync(10);
      passwordHash = bcrypt.hashSync(password.trim(), salt);
    }

    db.prepare(`
      UPDATE users
      SET name = ?, student_id = ?, email = ?, password_hash = ?, role = ?, gender = ?, class_year = ?, section_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name || user.name,
      student_id !== undefined ? student_id : user.student_id,
      email ? email.trim().toLowerCase() : user.email,
      passwordHash,
      role || user.role,
      gender || user.gender,
      class_year || user.class_year,
      section_id !== undefined ? (section_id ? Number(section_id) : null) : user.section_id,
      status || user.status,
      userId
    );

    db.prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'ADMIN_UPDATE_USER', ?)").run(
      req.user.id,
      `Updated user #${userId} (${user.name})`
    );

    res.json({ success: true, message: 'User updated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/users/:id', (req, res) => {
  try {
    const db = getDatabase();
    const userId = Number(req.params.id);
    const fs = require('fs');

    if (userId === req.user.id) {
      return res.status(400).json({ error: 'You cannot delete your own admin account.' });
    }

    const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(userId);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    // Clean up physical attachment files on disk
    const attachments = db.prepare('SELECT file_path FROM submission_attachments WHERE user_id = ?').all(userId);
    attachments.forEach(a => {
      if (a.file_path && fs.existsSync(a.file_path)) {
        try { fs.unlinkSync(a.file_path); } catch (e) {}
      }
    });

    // Purge corresponding submissions, attachments, messages, outbox logs, and audit logs
    db.prepare('DELETE FROM submission_attachments WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM lab_submissions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_user_id = ?').run(userId, userId);
    db.prepare('DELETE FROM outbox_emails WHERE to_email = ?').run(user.email);
    db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);

    db.prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'ADMIN_DELETE_USER', ?)").run(
      req.user.id,
      `Deleted user #${userId} (${user.name} - ${user.email}) and purged related submissions, outbox, and audit logs`
    );

    res.json({ success: true, message: `User ${user.name} and all corresponding logs and records deleted successfully.` });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 6. Section Management
router.get('/sections', (req, res) => {
  try {
    const db = getDatabase();
    const sections = db.prepare(`
      SELECT s.*, u.name as teacher_name, u.email as teacher_email,
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

router.post('/sections', (req, res) => {
  try {
    const db = getDatabase();
    const { name, code, gender_target, class_year, academic_term, teacher_id, description } = req.body;

    if (!name || !code) {
      return res.status(400).json({ error: 'Section name and code are required.' });
    }

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
      teacher_id ? Number(teacher_id) : null,
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
    const { name, code, gender_target, class_year, academic_term, teacher_id, description } = req.body;

    db.prepare(`
      UPDATE sections
      SET name = ?, code = ?, gender_target = ?, class_year = ?, academic_term = ?, teacher_id = ?, description = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name,
      code.toUpperCase(),
      gender_target,
      class_year,
      academic_term,
      teacher_id ? Number(teacher_id) : null,
      description,
      sectionId
    );

    res.json({ success: true, message: 'Section updated successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/sections/:id', (req, res) => {
  try {
    const db = getDatabase();
    const sectionId = Number(req.params.id);

    // Unassign students first
    db.prepare('UPDATE users SET section_id = NULL WHERE section_id = ?').run(sectionId);
    db.prepare('DELETE FROM sections WHERE id = ?').run(sectionId);

    res.json({ success: true, message: 'Section deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 7. System Settings & Configuration
router.get('/settings', (req, res) => {
  try {
    const db = getDatabase();
    const settingsRows = db.prepare('SELECT key, value, description FROM system_settings').all();
    const settings = {};
    settingsRows.forEach(r => {
      settings[r.key] = r.value;
    });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/settings', (req, res) => {
  try {
    const db = getDatabase();
    const { settings } = req.body; // object of { key: value }

    const updateStmt = db.prepare(`
      INSERT INTO system_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP
    `);

    for (const [k, v] of Object.entries(settings || {})) {
      updateStmt.run(k, String(v));
    }

    db.prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'ADMIN_UPDATE_SETTINGS', 'Updated system configurations')").run(req.user.id);

    res.json({ success: true, message: 'System settings saved successfully.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/test-smtp', async (req, res) => {
  try {
    const { testEmail } = req.body;
    const target = testEmail || req.user.email;
    const result = await emailService.testSmtp(target);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 8. Outbox Email Inspector (Local VPS Email Queue)
router.get('/outbox', (req, res) => {
  try {
    const db = getDatabase();
    const emails = db.prepare(`
      SELECT id, to_email, to_name, subject, token_link, status, error_message, created_at, sent_at
      FROM outbox_emails
      ORDER BY created_at DESC
      LIMIT 100
    `).all();

    res.json({ emails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/outbox/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = Number(req.params.id);
    db.prepare('DELETE FROM outbox_emails WHERE id = ?').run(id);
    res.json({ success: true, message: 'Outbox email log deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/outbox', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM outbox_emails').run();
    db.prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'ADMIN_CLEAR_OUTBOX', 'Cleared all email outbox logs')").run(req.user.id);
    res.json({ success: true, message: 'All outbox logs cleared.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// 9. Audit Logs
router.get('/audit-logs', (req, res) => {
  try {
    const db = getDatabase();
    const logs = db.prepare(`
      SELECT a.*, u.name as user_name, u.email as user_email
      FROM audit_logs a
      LEFT JOIN users u ON a.user_id = u.id
      ORDER BY a.created_at DESC
      LIMIT 150
    `).all();

    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/audit-logs/:id', (req, res) => {
  try {
    const db = getDatabase();
    const id = Number(req.params.id);
    db.prepare('DELETE FROM audit_logs WHERE id = ?').run(id);
    res.json({ success: true, message: 'Audit log entry deleted.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/audit-logs', (req, res) => {
  try {
    const db = getDatabase();
    db.prepare('DELETE FROM audit_logs').run();
    db.prepare("INSERT INTO audit_logs (user_id, action, details) VALUES (?, 'ADMIN_CLEAR_LOGS', 'Cleared prior audit log history')").run(req.user.id);
    res.json({ success: true, message: 'All audit logs cleared.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
