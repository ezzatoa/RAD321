const authService = require('../services/authService');
const { getDatabase } = require('../db/database');

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please provide a valid Bearer token.' });
  }

  const token = authHeader.split(' ')[1];
  const decoded = authService.verifyJwt(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
  }

  const db = getDatabase();
  const user = db.prepare(`
    SELECT u.id, u.name, u.student_id, u.email, u.role, u.gender, u.class_year, u.section_id, u.status, s.name as section_name
    FROM users u
    LEFT JOIN sections s ON u.section_id = s.id
    WHERE u.id = ?
  `).get(decoded.id);

  if (!user || user.status !== 'active') {
    return res.status(403).json({ error: 'User account is inactive or not found.' });
  }

  req.user = user;
  next();
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires one of: [${allowedRoles.join(', ')}] role.` });
    }
    next();
  };
}

module.exports = {
  authenticate,
  requireRole
};
