const assert = require('assert');
const { getDatabase } = require('../db/database');
const authService = require('../services/authService');
const geminiGradingService = require('../services/geminiGradingService');
const reportingService = require('../services/reportingService');
const emailService = require('../services/emailService');

async function runTests() {
  console.log('🧪 Starting RAD 321 Department Platform Integration Test Suite...\n');
  const db = getDatabase();

  // Test 1: Student Self-Registration Workflow
  console.log('▶ Test 1: Student Self-Registration...');
  const regEmail = `test.student.${Date.now()}@student.taibahu.edu.sa`;
  const regId = `ID${Date.now().toString().slice(-6)}`;
  const registered = await authService.registerStudent({
    name: 'Test Student Workflow',
    studentId: regId,
    email: regEmail,
    gender: 'Male',
    classYear: 'Year 3',
    sectionId: 1
  });
  assert.strictEqual(registered.status, 'pending', 'Newly registered student should have pending status');
  console.log('  ✔ Registration creates pending record');

  // Test 2: Admin Approval & Token Generation
  console.log('▶ Test 2: Admin Approval & Token Generation...');
  const approval = await authService.approveStudent(registered.id, 1, 'http://localhost:3000');
  assert.strictEqual(approval.user.status, 'active', 'Approved user should be active');
  assert.ok(approval.activationToken, 'Approval must produce an activation token');
  assert.ok(approval.activationLink.includes(approval.activationToken), 'Activation link must contain token');
  console.log('  ✔ Admin approval generates one-time activation token');

  // Test 3: Email Service & Outbox Logging
  console.log('▶ Test 3: Email Service & Outbox Logging...');
  const emailRes = await emailService.sendActivationEmail(approval.user, approval.activationToken, 'http://localhost:3000');
  assert.ok(emailRes.activationLink, 'Email dispatch returns activation link');
  const outboxEntry = db.prepare('SELECT * FROM outbox_emails WHERE to_email = ? ORDER BY id DESC').get(regEmail);
  assert.ok(outboxEntry, 'Email was logged to outbox table for local VPS audit');
  assert.strictEqual(outboxEntry.token_link, approval.activationLink, 'Outbox contains correct activation link');
  console.log('  ✔ Email logged to internal outbox queue for VPS inspection');

  // Test 4: One-Time Token Activation & Password Set
  console.log('▶ Test 4: One-Time Token Activation...');
  const activation = await authService.activateWithToken(approval.activationToken, 'NewStudentPass@123');
  assert.ok(activation.token, 'Activation should return a valid JWT token');
  assert.strictEqual(activation.user.email, regEmail, 'Activation returns correct user');
  console.log('  ✔ One-time token validates and sets new password');

  // Test 5: Login with newly activated credentials
  console.log('▶ Test 5: Login with new credentials...');
  const loginRes = await authService.login(regEmail, 'NewStudentPass@123');
  assert.ok(loginRes.token, 'Login should succeed and return JWT');
  assert.strictEqual(loginRes.user.email, regEmail);
  console.log('  ✔ Login successful with activated credentials');

  // Test 6: Lab State Save, Assignment Submission & Grading
  console.log('▶ Test 6: Lab State Save & Grading...');
  const runs = [
    { runNumber: 1, settings: 'kVp: 75; mAs: 10; SID: 100 cm; OID: 5 cm', result: 'Intensity: 100%; MF: 1.05', interpretation: 'Baseline standard' },
    { runNumber: 2, settings: 'kVp: 75; mAs: 10; SID: 140 cm; OID: 5 cm', result: 'Intensity: 51%; MF: 1.04', interpretation: 'Inverse square intensity drop' },
    { runNumber: 3, settings: 'kVp: 75; mAs: 10; SID: 100 cm; OID: 15 cm', result: 'Intensity: 100%; MF: 1.18', interpretation: 'High geometric magnification' }
  ];
  const state = {
    meta: { studentName: 'Test Student Workflow', studentId: regId, section: 'Section 1' },
    fields: {
      q1: 'Run 1 vs Run 2 showed 51% drop due to inverse square law.',
      q2: 'I2 = 100 * (100/140)^2 = 51.02%',
      q3: 'Increased OID increased magnification to 1.18 and caused edge unsharpness.',
      q4: 'Patient attenuation vs radiographer mAs and SID settings.'
    },
    quiz: { 'q2-1': { correct: true }, 'q2-2': { correct: true }, 'q2-3': { correct: true }, 'q2-4': { correct: true } }
  };

  db.prepare(`
    INSERT INTO lab_submissions (user_id, lab_id, week_number, status, progress_percent, prediction, state_data, runs_data, quiz_score, quiz_total, rubric_scores, total_score, submitted_at)
    VALUES (?, 'lab-02', 2, 'submitted', 100, 'Longer SID reduces magnification', ?, ?, 4, 4, '{}', 0, CURRENT_TIMESTAMP)
  `).run(registered.id, JSON.stringify(state), JSON.stringify(runs));

  const sub = db.prepare("SELECT id FROM lab_submissions WHERE user_id = ? AND lab_id = 'lab-02'").get(registered.id);

  // Trigger AI Grading
  console.log('▶ Test 7: Automated AI Grading (Gemini Flash 3.7 / Fallback Engine)...');
  const gradeResult = await geminiGradingService.gradeSubmission(sub.id);
  assert.ok(gradeResult.totalScore > 0 && gradeResult.totalScore <= 20, 'Total score must be between 0 and 20');
  assert.ok(gradeResult.rubricBreakdown, 'Rubric breakdown must exist');
  assert.ok(gradeResult.rubricBreakdown.c1, 'Criterion c1 must be graded');
  assert.ok(gradeResult.rubricBreakdown.c2, 'Criterion c2 must be graded');
  assert.ok(gradeResult.rubricBreakdown.c3, 'Criterion c3 must be graded');
  assert.ok(gradeResult.rubricBreakdown.c4, 'Criterion c4 must be graded');
  assert.ok(gradeResult.rubricBreakdown.c5, 'Criterion c5 must be graded');
  console.log(`  ✔ Graded successfully with score: ${gradeResult.totalScore}/20`);

  // Test 8: Reporting Engine
  console.log('▶ Test 8: Reporting Engine (Individual, Section, Gender Comparative)...');
  const studentRep = reportingService.getStudentReport(registered.id);
  assert.ok(studentRep.summary, 'Student report summary exists');
  assert.strictEqual(studentRep.summary.completedLabs, 1, 'Completed labs count should be 1');

  const secRep = reportingService.getSectionReport(1);
  assert.ok(secRep.stats.studentCount > 0, 'Section student count > 0');
  assert.ok(secRep.stats.averageScore >= 0, 'Section average score computed');

  const courseAnalytics = reportingService.getCourseAnalytics();
  assert.ok(courseAnalytics.genderComparison.male, 'Male cohort metrics calculated');
  assert.ok(courseAnalytics.genderComparison.female, 'Female cohort metrics calculated');
  console.log(`  ✔ Male Cohort Avg: ${courseAnalytics.genderComparison.male.averageScore}/20 | Female Cohort Avg: ${courseAnalytics.genderComparison.female.averageScore}/20`);

  const csv = reportingService.generateGradebookCSV();
  assert.ok(csv.includes('Student ID,Full Name,Email,Gender'), 'CSV header formatted correctly');
  assert.ok(csv.includes(regEmail), 'Generated CSV contains newly registered student');
  console.log('  ✔ Consolidated CSV gradebook generated cleanly');

  console.log('\n🎉 ALL INTEGRATION TESTS PASSED CLEANLY (8/8)!');
}

if (require.main === module) {
  runTests().catch(err => {
    console.error('❌ Test suite failure:', err);
    process.exit(1);
  });
}

module.exports = { runTests };
