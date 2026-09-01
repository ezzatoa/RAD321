const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDatabase } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'rad321-department-vps-super-secret-key-2026';
const TOKEN_EXPIRY = '7d';

const authService = {
  // Register a new student (pending admin approval)
  async registerStudent({ name, studentId, email, gender, classYear, sectionId }) {
    const db = getDatabase();

    if (!name || !email) {
      throw new Error('Name and email are required for registration.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.prepare('SELECT id, status FROM users WHERE email = ?').get(cleanEmail);

    if (existing) {
      if (existing.status === 'pending') {
        throw new Error('An application with this email is already awaiting approval.');
      }
      throw new Error('An account with this email already exists.');
    }

    if (studentId) {
      const existingId = db.prepare('SELECT id FROM users WHERE student_id = ?').get(studentId.trim());
      if (existingId) {
        throw new Error('An account with this Student ID already exists.');
      }
    }

    const stmt = db.prepare(`
      INSERT INTO users (name, student_id, email, password_hash, role, gender, class_year, section_id, status)
      VALUES (?, ?, ?, NULL, 'student', ?, ?, ?, 'pending')
    `);

    const result = stmt.run(
      name.trim(),
      studentId ? studentId.trim() : null,
      cleanEmail,
      gender || 'Male',
      classYear || 'Year 3',
      sectionId ? Number(sectionId) : null
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES (?, 'STUDENT_SELF_REGISTER', ?)
    `).run(result.lastInsertRowid, `Self-registered student ${name} (${cleanEmail})`);

    return db.prepare('SELECT id, name, student_id, email, role, gender, class_year, section_id, status FROM users WHERE id = ?').get(result.lastInsertRowid);
  },

  // Admin approves student and creates activation token
  async approveStudent(userId, adminUserId, appUrl = 'http://localhost:3000') {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      throw new Error('User not found.');
    }
    if (user.status !== 'pending' && user.status !== 'rejected') {
      throw new Error(`User is already in '${user.status}' status.`);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    db.prepare(`
      UPDATE users
      SET status = 'active', activation_token = ?, activation_token_expires = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(token, expires, userId);

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES (?, 'ADMIN_APPROVE_STUDENT', ?)
    `).run(adminUserId || null, `Approved registration for ${user.name} (${user.email})`);

    const activationLink = `${appUrl.replace(/\/$/, '')}/activate/${token}`;

    return {
      user: { ...user, status: 'active' },
      activationToken: token,
      activationLink
    };
  },

  // Admin rejects student
  async rejectStudent(userId, adminUserId, reason = '') {
    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    if (!user) {
      throw new Error('User not found.');
    }

    db.prepare(`
      UPDATE users
      SET status = 'rejected', activation_token = NULL, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(userId);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES (?, 'ADMIN_REJECT_STUDENT', ?)
    `).run(adminUserId || null, `Rejected registration for ${user.name} (${user.email}). Reason: ${reason}`);

    return { success: true };
  },

  // Student activates account via one-time token and sets password
  async activateWithToken(token, newPassword) {
    const db = getDatabase();

    if (!token || !newPassword) {
      throw new Error('Token and password are required.');
    }

    if (newPassword.length < 6) {
      throw new Error('Password must be at least 6 characters long.');
    }

    const user = db.prepare(`
      SELECT * FROM users
      WHERE activation_token = ?
    `).get(token);

    if (!user) {
      throw new Error('Invalid or expired activation token.');
    }

    if (user.activation_token_expires && new Date(user.activation_token_expires) < new Date()) {
      throw new Error('This activation token has expired. Please contact your department administrator.');
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(newPassword, salt);

    db.prepare(`
      UPDATE users
      SET password_hash = ?, activation_token = NULL, activation_token_expires = NULL, status = 'active', last_login = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(passwordHash, user.id);

    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES (?, 'USER_ACTIVATION_COMPLETE', ?)
    `).run(user.id, `User ${user.name} set password and activated account`);

    const updatedUser = db.prepare(`
      SELECT u.id, u.name, u.student_id, u.email, u.role, u.gender, u.class_year, u.section_id, s.name as section_name
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE u.id = ?
    `).get(user.id);

    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return {
      user: updatedUser,
      token: jwtToken
    };
  },

  // Login
  async login(email, password) {
    const db = getDatabase();

    if (!email || !password) {
      throw new Error('Email and password are required.');
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.prepare(`
      SELECT u.*, s.name as section_name
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE u.email = ?
    `).get(cleanEmail);

    if (!user) {
      throw new Error('Invalid email or password.');
    }

    if (user.status === 'pending') {
      throw new Error('Your registration is pending Department Admin approval. You will receive an activation email once approved.');
    }

    if (user.status === 'rejected') {
      throw new Error('Your registration was not approved. Please contact your course coordinator.');
    }

    if (user.status === 'suspended') {
      throw new Error('Your account has been suspended. Please contact the administrator.');
    }

    if (!user.password_hash) {
      throw new Error('Account password is not set. Please use the activation link sent to your email.');
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      throw new Error('Invalid email or password.');
    }

    db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?').run(user.id);

    const jwtToken = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return {
      user: {
        id: user.id,
        name: user.name,
        student_id: user.student_id,
        email: user.email,
        role: user.role,
        gender: user.gender,
        class_year: user.class_year,
        section_id: user.section_id,
        section_name: user.section_name,
        status: user.status
      },
      token: jwtToken
    };
  },

  // JWT Middleware / Verification
  verifyJwt(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (e) {
      return null;
    }
  }
};

module.exports = authService;
