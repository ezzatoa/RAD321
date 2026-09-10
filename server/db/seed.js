const bcrypt = require('bcryptjs');
const { getDatabase } = require('./database');

async function seed() {
  const db = getDatabase();
  console.log('Seeding RAD 321 Department Database...');

  // 1. Seed System Settings
  const settings = [
    { key: 'gemini_api_key', value: process.env.GEMINI_API_KEY || '', description: 'Google Gemini API Key for automated rubric grading' },
    { key: 'gemini_model', value: 'gemini-3.7-flash', description: 'Gemini model designation for AI evaluations' },
    { key: 'smtp_host', value: 'smtp.gmail.com', description: 'Department SMTP Host server (e.g. smtp.gmail.com)' },
    { key: 'smtp_port', value: '465', description: 'SMTP port (587 for TLS, 465 for SSL)' },
    { key: 'smtp_user', value: 'ezzatoa@gmail.com', description: 'SMTP username or authentication email' },
    { key: 'smtp_pass', value: process.env.GMAIL_APP_PASSWORD || '', description: 'SMTP password or Gmail App Password' },
    { key: 'smtp_from', value: 'RAD 321 Admin <ezzatoa@gmail.com>', description: 'Default sender address for emails' },
    { key: 'app_url', value: process.env.APP_BASE_URL || 'http://localhost:3000', description: 'Base URL for one-time activation links' },
    { key: 'allow_self_registration', value: 'true', description: 'Allow new students to register online' },
    { key: 'require_admin_approval', value: 'true', description: 'Require admin approval before token generation' }
  ];

  const insertSetting = db.prepare(`
    INSERT INTO system_settings (key, value, description)
    VALUES (@key, @value, @description)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, description = excluded.description
  `);

  for (const s of settings) {
    insertSetting.run(s);
  }

  // 2. Seed Default Admin & Teacher
  const salt = bcrypt.genSaltSync(10);
  const adminHash = bcrypt.hashSync('Admin@123456', salt);
  const teacherHash = bcrypt.hashSync('Teacher@123456', salt);
  const studentHash = bcrypt.hashSync('Student@123456', salt);

  const insertUser = db.prepare(`
    INSERT INTO users (name, student_id, email, password_hash, role, gender, class_year, section_id, status)
    VALUES (@name, @student_id, @email, @password_hash, @role, @gender, @class_year, @section_id, @status)
    ON CONFLICT(email) DO UPDATE SET
      name = excluded.name,
      student_id = excluded.student_id,
      password_hash = excluded.password_hash,
      role = excluded.role,
      gender = excluded.gender,
      class_year = excluded.class_year,
      section_id = excluded.section_id,
      status = excluded.status
  `);

  insertUser.run({
    name: 'Prof. Ezzat (Admin)',
    student_id: null,
    email: 'ezzatoa@gmail.com',
    password_hash: adminHash,
    role: 'admin',
    gender: 'Male',
    class_year: 'Faculty',
    section_id: null,
    status: 'active'
  });

  const teacher = insertUser.run({
    name: 'Prof. Ezzat (RAD 321 Lead)',
    student_id: null,
    email: 'instructor@taibahu.edu.sa',
    password_hash: teacherHash,
    role: 'teacher',
    gender: 'Male',
    class_year: 'Faculty',
    section_id: null,
    status: 'active'
  });

  const teacherUser = db.prepare('SELECT id FROM users WHERE email = ?').get('instructor@taibahu.edu.sa');

  // 3. Seed Sections
  const insertSection = db.prepare(`
    INSERT INTO sections (name, code, gender_target, class_year, academic_term, teacher_id, description)
    VALUES (@name, @code, @gender_target, @class_year, @academic_term, @teacher_id, @description)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      gender_target = excluded.gender_target,
      class_year = excluded.class_year,
      teacher_id = excluded.teacher_id,
      description = excluded.description
  `);

  insertSection.run({
    name: 'Section 1 — Male Cohort',
    code: 'SEC-M1',
    gender_target: 'Male',
    class_year: 'Year 3 - Cohort 2026',
    academic_term: 'Fall 2026',
    teacher_id: teacherUser.id,
    description: 'Monday Morning Session (8:00 AM - 10:00 AM) - DRT Simulation Suite A'
  });

  insertSection.run({
    name: 'Section 2 — Female Cohort',
    code: 'SEC-F1',
    gender_target: 'Female',
    class_year: 'Year 3 - Cohort 2026',
    academic_term: 'Fall 2026',
    teacher_id: teacherUser.id,
    description: 'Tuesday Morning Session (8:00 AM - 10:00 AM) - DRT Simulation Suite B'
  });

  insertSection.run({
    name: 'Section 3 — Clinical Practicum Group',
    code: 'SEC-CP1',
    gender_target: 'Mixed',
    class_year: 'Year 3 - Cohort 2026',
    academic_term: 'Fall 2026',
    teacher_id: teacherUser.id,
    description: 'Wednesday Advanced Practice & OSCE Preparation'
  });

  const secM1 = db.prepare('SELECT id FROM sections WHERE code = ?').get('SEC-M1');
  const secF1 = db.prepare('SELECT id FROM sections WHERE code = ?').get('SEC-F1');

  // 4. Seed Demo Students
  const demoStudents = [
    {
      name: 'Ahmed Al-Harbi',
      student_id: '441012341',
      email: 'ahmed.harbi@student.taibahu.edu.sa',
      password_hash: studentHash,
      role: 'student',
      gender: 'Male',
      class_year: 'Year 3',
      section_id: secM1.id,
      status: 'active'
    },
    {
      name: 'Khalid Al-Otaibi',
      student_id: '441012342',
      email: 'khalid.otaibi@student.taibahu.edu.sa',
      password_hash: studentHash,
      role: 'student',
      gender: 'Male',
      class_year: 'Year 3',
      section_id: secM1.id,
      status: 'active'
    },
    {
      name: 'Faisal Al-Zahrani',
      student_id: '441012343',
      email: 'faisal.zahrani@student.taibahu.edu.sa',
      password_hash: studentHash,
      role: 'student',
      gender: 'Male',
      class_year: 'Year 3',
      section_id: secM1.id,
      status: 'active'
    },
    {
      name: 'Sara Al-Ghamdi',
      student_id: '441012344',
      email: 'sara.alghamdi@student.taibahu.edu.sa',
      password_hash: studentHash,
      role: 'student',
      gender: 'Female',
      class_year: 'Year 3',
      section_id: secF1.id,
      status: 'active'
    },
    {
      name: 'Nour Al-Harbi',
      student_id: '441012345',
      email: 'nour.alharbi@student.taibahu.edu.sa',
      password_hash: studentHash,
      role: 'student',
      gender: 'Female',
      class_year: 'Year 3',
      section_id: secF1.id,
      status: 'active'
    },
    {
      name: 'Reem Al-Shehri',
      student_id: '441012346',
      email: 'reem.alshehri@student.taibahu.edu.sa',
      password_hash: studentHash,
      role: 'student',
      gender: 'Female',
      class_year: 'Year 3',
      section_id: secF1.id,
      status: 'active'
    },
    {
      name: 'Mohammed Al-Anazi (New Applicant)',
      student_id: '441012347',
      email: 'mohammed.anazi@student.taibahu.edu.sa',
      password_hash: null,
      role: 'student',
      gender: 'Male',
      class_year: 'Year 3',
      section_id: secM1.id,
      status: 'pending'
    },
    {
      name: 'Hadeel Al-Mutairi (New Applicant)',
      student_id: '441012348',
      email: 'hadeel.mutairi@student.taibahu.edu.sa',
      password_hash: null,
      role: 'student',
      gender: 'Female',
      class_year: 'Year 3',
      section_id: secF1.id,
      status: 'pending'
    }
  ];

  for (const stu of demoStudents) {
    insertUser.run(stu);
  }

  // 5. Seed Realistic Submissions for Student Analytics Demonstrations
  const ahmedUser = db.prepare('SELECT id FROM users WHERE email = ?').get('ahmed.harbi@student.taibahu.edu.sa');
  const saraUser = db.prepare('SELECT id FROM users WHERE email = ?').get('sara.alghamdi@student.taibahu.edu.sa');
  const khalidUser = db.prepare('SELECT id FROM users WHERE email = ?').get('khalid.otaibi@student.taibahu.edu.sa');
  const nourUser = db.prepare('SELECT id FROM users WHERE email = ?').get('nour.alharbi@student.taibahu.edu.sa');

  const insertSubmission = db.prepare(`
    INSERT INTO lab_submissions (
      user_id, lab_id, week_number, status, progress_percent, prediction,
      state_data, runs_data, quiz_score, quiz_total, rubric_scores,
      total_score, ai_score, ai_feedback, teacher_feedback, teacher_graded_by, teacher_graded_at, submitted_at
    ) VALUES (
      @user_id, @lab_id, @week_number, @status, @progress_percent, @prediction,
      @state_data, @runs_data, @quiz_score, @quiz_total, @rubric_scores,
      @total_score, @ai_score, @ai_feedback, @teacher_feedback, @teacher_graded_by, @teacher_graded_at, @submitted_at
    )
    ON CONFLICT(user_id, lab_id) DO UPDATE SET
      status = excluded.status,
      progress_percent = excluded.progress_percent,
      total_score = excluded.total_score,
      ai_score = excluded.ai_score,
      ai_feedback = excluded.ai_feedback,
      teacher_feedback = excluded.teacher_feedback
  `);

  // Sample submission 1: Ahmed Lab 01 (Graded)
  if (ahmedUser) {
    insertSubmission.run({
      user_id: ahmedUser.id,
      lab_id: 'lab-01',
      week_number: 1,
      status: 'graded',
      progress_percent: 100,
      prediction: 'I predict that identifying the X-ray tube anode and cathode correctly is foundational to understanding heel effect and beam geometry.',
      state_data: JSON.stringify({
        meta: { studentName: 'Ahmed Al-Harbi', studentId: '441012341', section: 'Section 1 — Male Cohort' },
        fields: {
          q1: 'The anode target receives incident electrons to produce bremsstrahlung and characteristic radiation, while the cathode filament supplies electrons via thermionic emission.',
          q2: 'Stage 1 produces the beam, Stage 2 represents patient interaction and differential absorption, Stage 3 is detector capture, Stage 4 is digital processing and PACS display.',
          q3: 'The radiographer must optimize diagnostic image quality while strictly upholding ALARA radiation protection principles.'
        },
        quiz: { 'q1-1': { correct: true }, 'q1-2': { correct: true }, 'q1-3': { correct: true }, 'q1-4': { correct: true } }
      }),
      runs_data: JSON.stringify([
        { runNumber: 1, settings: 'Cathode/Anode alignment; Tube housing lead shield verified', result: '99% leakage attenuation achieved', interpretation: 'Meets NCRP safety regulations' }
      ]),
      quiz_score: 4,
      quiz_total: 4,
      rubric_scores: JSON.stringify({ c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }),
      total_score: 20,
      ai_score: 19.5,
      ai_feedback: JSON.stringify({
        overallFeedback: 'Outstanding work by Ahmed. The description of dual radiographer roles and imaging chain stages is precise and well articulated.',
        rubricBreakdown: {
          c1: { score: 4, max: 4, rationale: 'Accurate and comprehensive explanation of tube anatomy and imaging stages.' },
          c2: { score: 5, max: 5, rationale: 'Proper exploration of all tube components.' },
          c3: { score: 4.5, max: 5, rationale: 'Clear worksheet answers citing imaging chain physics.' },
          c4: { score: 3, max: 3, rationale: 'Strong clinical connection to ALARA practices.' },
          c5: { score: 3, max: 3, rationale: 'Thorough and complete worksheet report.' }
        }
      }),
      teacher_feedback: 'Excellent mastery of the fundamental imaging chain. Keep up the high standard.',
      teacher_graded_by: teacherUser.id,
      teacher_graded_at: new Date().toISOString(),
      submitted_at: new Date().toISOString()
    });

    // Ahmed Lab 02 (Submitted, pending AI/teacher grade)
    insertSubmission.run({
      user_id: ahmedUser.id,
      lab_id: 'lab-02',
      week_number: 2,
      status: 'submitted',
      progress_percent: 100,
      prediction: 'Increasing SID will reduce image magnification and decrease beam intensity following the inverse square law.',
      state_data: JSON.stringify({
        meta: { studentName: 'Ahmed Al-Harbi', studentId: '441012341', section: 'Section 1 — Male Cohort' },
        fields: {
          q1: 'Run 1 (75 kVp, 10 mAs, 100 cm SID) vs Run 2 (75 kVp, 10 mAs, 140 cm SID): The primary beam intensity at the receptor dropped from 100% to ~51% due to inverse-square law divergence.',
          q2: 'I2 = I1 * (d1/d2)^2 = 100 * (100/140)^2 = 51.02% of initial intensity.',
          q3: 'Increasing OID from 5 cm to 15 cm increased the magnification factor from 1.05 to 1.18, resulting in visible penumbral blur on the detector.',
          q4: 'Patient-dependent cause: high body habitus causing attenuation. Radiographer-controllable cause: insufficient mAs or excessive SID without compensation.'
        },
        quiz: { 'q2-1': { correct: true }, 'q2-2': { correct: true }, 'q2-3': { correct: true }, 'q2-4': { correct: true } }
      }),
      runs_data: JSON.stringify([
        { runNumber: 1, settings: 'kVp: 75; mAs: 10; SID: 100 cm; OID: 5 cm', result: 'Intensity: 100%; MF: 1.05; SOD: 95 cm', interpretation: 'Baseline exposure standard.' },
        { runNumber: 2, settings: 'kVp: 75; mAs: 10; SID: 140 cm; OID: 5 cm', result: 'Intensity: 51%; MF: 1.04; SOD: 135 cm', interpretation: 'Inverse square intensity reduction confirmed.' },
        { runNumber: 3, settings: 'kVp: 75; mAs: 10; SID: 100 cm; OID: 15 cm', result: 'Intensity: 100%; MF: 1.18; SOD: 85 cm', interpretation: 'High geometric magnification observed.' }
      ]),
      quiz_score: 4,
      quiz_total: 4,
      rubric_scores: JSON.stringify({ c1: 4, c2: 5, c3: 4, c4: 3, c5: 3 }),
      total_score: 19,
      ai_score: null,
      ai_feedback: null,
      teacher_feedback: null,
      teacher_graded_by: null,
      teacher_graded_at: null,
      submitted_at: new Date().toISOString()
    });
  }

  // Sample submission 2: Sara Lab 01 & Lab 02 (Graded)
  if (saraUser) {
    insertSubmission.run({
      user_id: saraUser.id,
      lab_id: 'lab-01',
      week_number: 1,
      status: 'graded',
      progress_percent: 100,
      prediction: 'The 4 stages of image formation connect x-ray physics directly to diagnostic image display and patient radiation protection.',
      state_data: JSON.stringify({
        meta: { studentName: 'Sara Al-Ghamdi', studentId: '441012344', section: 'Section 2 — Female Cohort' },
        fields: {
          q1: 'Cathode generates electrons, Anode targets decelerate electrons producing x-ray photons.',
          q2: 'Stage 1: Production, Stage 2: Interaction, Stage 3: Detection, Stage 4: Processing and PACS presentation.',
          q3: 'Ensuring high diagnostic image quality while keeping patient dose As Low As Reasonably Achievable.'
        },
        quiz: { 'q1-1': { correct: true }, 'q1-2': { correct: true }, 'q1-3': { correct: true }, 'q1-4': { correct: true } }
      }),
      runs_data: JSON.stringify([
        { runNumber: 1, settings: 'Tube simulation baseline', result: 'Standard spectrum', interpretation: 'Nominal output' }
      ]),
      quiz_score: 4,
      quiz_total: 4,
      rubric_scores: JSON.stringify({ c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }),
      total_score: 20,
      ai_score: 20,
      ai_feedback: JSON.stringify({
        overallFeedback: 'Exemplary submission with flawless answers and solid scientific grounding.',
        rubricBreakdown: {
          c1: { score: 4, max: 4, rationale: 'Flawless conceptual understanding.' },
          c2: { score: 5, max: 5, rationale: 'Accurate simulation execution.' },
          c3: { score: 5, max: 5, rationale: 'Clear and detailed calculations and answers.' },
          c4: { score: 3, max: 3, rationale: 'Strong clinical ALARA linkage.' },
          c5: { score: 3, max: 3, rationale: 'High professionalism and completeness.' }
        }
      }),
      teacher_feedback: 'Exceptional submission, Sara. Full credit awarded.',
      teacher_graded_by: teacherUser.id,
      teacher_graded_at: new Date().toISOString(),
      submitted_at: new Date().toISOString()
    });

    insertSubmission.run({
      user_id: saraUser.id,
      lab_id: 'lab-02',
      week_number: 2,
      status: 'graded',
      progress_percent: 100,
      prediction: 'Longer SID minimizes magnification and reduces intensity according to 1/d^2.',
      state_data: JSON.stringify({
        meta: { studentName: 'Sara Al-Ghamdi', studentId: '441012344', section: 'Section 2 — Female Cohort' },
        fields: {
          q1: 'Run 1 (SID 100cm) vs Run 2 (SID 140cm): Beam intensity reduced to 51% of baseline following the inverse square relationship.',
          q2: 'I2 = I1 * (100/140)^2 = 100 * 0.5102 = 51.02%.',
          q3: 'Increased OID significantly elevated geometric magnification (MF = SID/SOD = 100/85 = 1.18) and reduced image sharpness.',
          q4: 'Patient-dependent: thickness and tissue attenuation; Radiographer: SID selection and collimation.'
        },
        quiz: { 'q2-1': { correct: true }, 'q2-2': { correct: true }, 'q2-3': { correct: true }, 'q2-4': { correct: true } }
      }),
      runs_data: JSON.stringify([
        { runNumber: 1, settings: 'kVp: 75; mAs: 10; SID: 100 cm; OID: 5 cm', result: 'Intensity: 100%; MF: 1.05', interpretation: 'Nominal baseline' },
        { runNumber: 2, settings: 'kVp: 75; mAs: 10; SID: 140 cm; OID: 5 cm', result: 'Intensity: 51%; MF: 1.04', interpretation: 'Lower intensity, minimal magnification' },
        { runNumber: 3, settings: 'kVp: 75; mAs: 10; SID: 100 cm; OID: 15 cm', result: 'Intensity: 100%; MF: 1.18', interpretation: 'Severe magnification blur' }
      ]),
      quiz_score: 4,
      quiz_total: 4,
      rubric_scores: JSON.stringify({ c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }),
      total_score: 20,
      ai_score: 20,
      ai_feedback: JSON.stringify({
        overallFeedback: 'Perfect mathematical and clinical synthesis of inverse-square law and geometric magnification.',
        rubricBreakdown: {
          c1: { score: 4, max: 4, rationale: 'Accurate understanding of exposure physics.' },
          c2: { score: 5, max: 5, rationale: 'Full set of 3 controlled runs executed cleanly.' },
          c3: { score: 5, max: 5, rationale: 'Exact mathematical calculation shown.' },
          c4: { score: 3, max: 3, rationale: 'Great clinical reasoning for portable chest positioning.' },
          c5: { score: 3, max: 3, rationale: 'Flawless worksheet structure.' }
        }
      }),
      teacher_feedback: 'Top-tier analysis. Well done.',
      teacher_graded_by: teacherUser.id,
      teacher_graded_at: new Date().toISOString(),
      submitted_at: new Date().toISOString()
    });
  }

  // Sample submission 3: Khalid Lab 01 (Graded)
  if (khalidUser) {
    insertSubmission.run({
      user_id: khalidUser.id,
      lab_id: 'lab-01',
      week_number: 1,
      status: 'graded',
      progress_percent: 100,
      prediction: 'Cathode and anode work together to create primary x-ray photons.',
      state_data: JSON.stringify({
        meta: { studentName: 'Khalid Al-Otaibi', studentId: '441012342', section: 'Section 1 — Male Cohort' },
        fields: {
          q1: 'Filament generates thermionic electrons which strike the tungsten target.',
          q2: 'Generation, interaction, receptor absorption, display.',
          q3: 'Ensure diagnostic quality while maintaining ALARA.'
        },
        quiz: { 'q1-1': { correct: true }, 'q1-2': { correct: true }, 'q1-3': { correct: true }, 'q1-4': { correct: false } }
      }),
      runs_data: JSON.stringify([{ runNumber: 1, settings: 'Standard', result: 'OK', interpretation: 'Done' }]),
      quiz_score: 3,
      quiz_total: 4,
      rubric_scores: JSON.stringify({ c1: 3.5, c2: 4.5, c3: 4, c4: 2.5, c5: 3 }),
      total_score: 17.5,
      ai_score: 17.5,
      ai_feedback: JSON.stringify({
        overallFeedback: 'Good effort, but review the distinction between secondary and scatter radiation.',
        rubricBreakdown: {
          c1: { score: 3.5, max: 4, rationale: 'Good conceptual overview.' },
          c2: { score: 4.5, max: 5, rationale: 'Completed simulation.' },
          c3: { score: 4, max: 5, rationale: 'One quiz error in receptor classification.' },
          c4: { score: 2.5, max: 3, rationale: 'Brief clinical ALARA answer.' },
          c5: { score: 3, max: 3, rationale: 'Completed report.' }
        }
      }),
      teacher_feedback: 'Solid work. Please review question 4 regarding receptor efficiency.',
      teacher_graded_by: teacherUser.id,
      teacher_graded_at: new Date().toISOString(),
      submitted_at: new Date().toISOString()
    });
  }

  // Sample submission 4: Nour Lab 01 (In Progress)
  if (nourUser) {
    insertSubmission.run({
      user_id: nourUser.id,
      lab_id: 'lab-01',
      week_number: 1,
      status: 'in_progress',
      progress_percent: 60,
      prediction: 'I am exploring the cathode filament assembly and focusing cup.',
      state_data: JSON.stringify({
        meta: { studentName: 'Nour Al-Harbi', studentId: '441012345', section: 'Section 2 — Female Cohort' },
        fields: {
          q1: 'The focusing cup directs the electron cloud toward the focal track on the anode.'
        },
        quiz: { 'q1-1': { correct: true }, 'q1-2': { correct: true } }
      }),
      runs_data: JSON.stringify([]),
      quiz_score: 2,
      quiz_total: 4,
      rubric_scores: JSON.stringify({}),
      total_score: 0,
      ai_score: null,
      ai_feedback: null,
      teacher_feedback: null,
      teacher_graded_by: null,
      teacher_graded_at: null,
      submitted_at: null
    });
  }

  // 6. Seed Sample Section Announcements
  const insertMessage = db.prepare(`
    INSERT INTO messages (sender_id, recipient_section_id, subject, body, type, is_email_dispatched)
    VALUES (?, ?, ?, ?, 'announcement', 1)
  `);

  insertMessage.run(
    teacherUser.id,
    secM1.id,
    'Welcome to RAD 321 — Fall 2026 Laboratory Course',
    'Dear Section 1 students,\n\nPlease ensure you complete Lab 01 (The Imaging Chain) and Lab 02 (Image Formation Simulator) before next Monday. Remember to download your experimental run CSV data and conduct the inverse-square law calculations as outlined in the worksheet.\n\nBest regards,\nProf. Ezzat'
  );

  insertMessage.run(
    teacherUser.id,
    secF1.id,
    'Welcome to RAD 321 — Fall 2026 Laboratory Course',
    'Dear Section 2 students,\n\nWelcome to RAD 321. Our virtual lab platform is now active for Lab 01 and Lab 02. Please review the clinical scenario on geometric distortion and upload your calculations sheet.\n\nBest regards,\nProf. Ezzat'
  );

  // 7. Seed Sample Outbox Emails
  const insertOutbox = db.prepare(`
    INSERT INTO outbox_emails (to_email, to_name, subject, html_body, token_link, status)
    VALUES (?, ?, ?, ?, ?, 'sent')
  `);

  insertOutbox.run(
    'ahmed.harbi@student.taibahu.edu.sa',
    'Ahmed Al-Harbi',
    'RAD 321 Account Approved — Set Your Password',
    '<p>Dear Ahmed Al-Harbi,</p><p>Your registration for RAD 321 has been approved by the department administrator. Please click the link below to set your account password:</p><p><a href="http://localhost:3000/activate/demo-token-ahmed">Activate Account & Set Password</a></p>',
    'http://localhost:3000/activate/demo-token-ahmed'
  );

  console.log('Database seeded successfully!');
  console.log('Default Admin Account: ezzatoa@gmail.com / Admin@123456');
  console.log('Default Teacher Account: instructor@taibahu.edu.sa / Teacher@123456');
  console.log('Default Student Accounts: ahmed.harbi@student.taibahu.edu.sa / Student@123456 (and others)');
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
}

module.exports = { seed };
