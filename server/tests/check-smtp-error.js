const { getDatabase } = require('../db/database');
const db = getDatabase();

const lastEmail = db.prepare('SELECT * FROM outbox_emails ORDER BY id DESC LIMIT 5').all();
console.log('Recent Outbox Emails:');
lastEmail.forEach(e => {
  console.log(`[ID ${e.id}] To: ${e.to_email} | Status: ${e.status} | Error: ${e.error_message || 'None'}`);
});

const settings = db.prepare("SELECT key, value FROM system_settings WHERE key LIKE 'smtp%'").all();
console.log('\nCurrent SMTP Settings:');
settings.forEach(s => {
  console.log(`  ${s.key}: ${s.key.includes('pass') ? (s.value ? 'SET (length: ' + s.value.length + ')' : 'NOT SET / EMPTY') : s.value}`);
});
