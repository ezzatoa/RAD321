const express = require('express');
const path = require('path');
const cors = require('cors');
require('dotenv').config();

const { getDatabase } = require('./db/database');
const authRoutes = require('./routes/authRoutes');
const adminRoutes = require('./routes/adminRoutes');
const teacherRoutes = require('./routes/teacherRoutes');
const studentRoutes = require('./routes/studentRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Initialize database
const db = getDatabase();

// API Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'RAD 321 Department VPS Laboratory Platform',
    institution: 'Taibah University · Diagnostic Radiology Technology',
    version: '2.0.0',
    timestamp: new Date().toISOString()
  });
});

// Mount API Routes
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/teacher', teacherRoutes);
app.use('/api/student', studentRoutes);

// Attachment Download Route (Protected or Token-based)
app.get('/api/attachments/:id/download', (req, res) => {
  try {
    const attachId = Number(req.params.id);
    const attach = db.prepare('SELECT * FROM submission_attachments WHERE id = ?').get(attachId);

    if (!attach || !attach.file_path) {
      return res.status(404).send('File not found');
    }

    res.download(attach.file_path, attach.original_filename);
  } catch (err) {
    res.status(500).send('Error downloading attachment: ' + err.message);
  }
});

// Serve Static Files from labs/webapp
const WEBAPP_DIR = path.join(__dirname, '../labs/webapp');
app.use(express.static(WEBAPP_DIR));

// Serve activation route
app.get('/activate/:token', (req, res) => {
  res.sendFile(path.join(WEBAPP_DIR, 'index.html'));
});

// Fallback for SPA routing
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  res.sendFile(path.join(WEBAPP_DIR, 'index.html'));
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

// Start Server
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log('================================================================');
    console.log(`🚀 RAD 321 Department VPS Server is RUNNING on port ${PORT}`);
    console.log(`🌐 Web Platform URL: http://localhost:${PORT}`);
    console.log(`📚 Diagnostic Radiology Technology · Taibah University`);
    console.log('================================================================');
  });
}

module.exports = app;
