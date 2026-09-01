const { getDatabase } = require('../db/database');
const authService = require('../services/authService');
const emailService = require('../services/emailService');

async function testDeletion() {
  const db = getDatabase();
  console.log('Testing User and Corresponding Logs Deletion...');
  
  // 1. Create a dummy student
  const dummy = await authService.registerStudent({
    name: 'Delete Me Test',
    studentId: '999999999',
    email: 'deleteme@student.taibahu.edu.sa',
    gender: 'Male',
    classYear: 'Year 3',
    sectionId: 1
  });
  console.log('Registered dummy student ID:', dummy.id);

  // Approve dummy & record outbox email
  const app = await authService.approveStudent(dummy.id, 1, 'http://localhost:8080');
  await emailService.sendActivationEmail(app.user, app.activationToken, 'http://localhost:8080');
  console.log('Approved dummy student, activation email logged.');

  // Check outbox count before
  const outboxCountBefore = db.prepare("SELECT count(id) as count FROM outbox_emails WHERE to_email = 'deleteme@student.taibahu.edu.sa'").get().count;
  console.log('Outbox emails for dummy before deletion:', outboxCountBefore);

  // 2. Perform deletion simulation
  const user = db.prepare('SELECT id, name, email FROM users WHERE id = ?').get(dummy.id);
  db.prepare('DELETE FROM submission_attachments WHERE user_id = ?').run(dummy.id);
  db.prepare('DELETE FROM lab_submissions WHERE user_id = ?').run(dummy.id);
  db.prepare('DELETE FROM messages WHERE sender_id = ? OR recipient_user_id = ?').run(dummy.id, dummy.id);
  db.prepare('DELETE FROM outbox_emails WHERE to_email = ?').run(user.email);
  db.prepare('DELETE FROM audit_logs WHERE user_id = ?').run(dummy.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(dummy.id);

  // Verify purged
  const userAfter = db.prepare('SELECT id FROM users WHERE id = ?').get(dummy.id);
  const outboxAfter = db.prepare("SELECT count(id) as count FROM outbox_emails WHERE to_email = 'deleteme@student.taibahu.edu.sa'").get().count;
  console.log('User exists after deletion:', !!userAfter);
  console.log('Outbox emails after deletion:', outboxAfter);

  if (!userAfter && outboxAfter === 0) {
    console.log('SUCCESS: User and corresponding logs purged cleanly!');
  } else {
    throw new Error('FAIL: User or logs remained.');
  }
}

testDeletion().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
