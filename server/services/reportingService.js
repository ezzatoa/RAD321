const { getDatabase } = require('../db/database');

const TOTAL_LABS = 15;
const CONTACT_HOURS_PER_LAB = 2;

const reportingService = {
  // 1. Get Individual Student Report
  getStudentReport(userId) {
    const db = getDatabase();

    const student = db.prepare(`
      SELECT u.id, u.name, u.student_id, u.email, u.gender, u.class_year, u.status, u.created_at,
             s.id as section_id, s.name as section_name, s.code as section_code
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE u.id = ?
    `).get(userId);

    if (!student) {
      throw new Error(`Student #${userId} not found.`);
    }

    const submissions = db.prepare(`
      SELECT *
      FROM lab_submissions
      WHERE user_id = ?
      ORDER BY week_number ASC
    `).all(userId);

    const submissionMap = {};
    submissions.forEach(sub => {
      let parsedRubric = {};
      let parsedFeedback = null;
      try { parsedRubric = JSON.parse(sub.rubric_scores || '{}'); } catch (e) {}
      try { parsedFeedback = JSON.parse(sub.ai_feedback || 'null'); } catch (e) {}

      submissionMap[sub.lab_id] = {
        ...sub,
        rubric_scores: parsedRubric,
        ai_feedback: parsedFeedback
      };
    });

    const labsBreakdown = [];
    let completedCount = 0;
    let gradedCount = 0;
    let scoreSum = 0;
    let rubricSums = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
    let rubricCounts = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };

    for (let w = 1; w <= TOTAL_LABS; w++) {
      const pad = String(w).padStart(2, '0');
      const labId = `lab-${pad}`;
      const sub = submissionMap[labId] || null;

      if (sub && (sub.status === 'submitted' || sub.status === 'graded')) {
        completedCount++;
        if (sub.status === 'graded') {
          gradedCount++;
          scoreSum += (sub.total_score || 0);

          if (sub.rubric_scores) {
            ['c1', 'c2', 'c3', 'c4', 'c5'].forEach(k => {
              if (sub.rubric_scores[k] !== undefined) {
                rubricSums[k] += Number(sub.rubric_scores[k]);
                rubricCounts[k]++;
              }
            });
          }
        }
      }

      labsBreakdown.push({
        weekNumber: w,
        labId,
        submission: sub
      });
    }

    const avgScore = gradedCount > 0 ? Math.round((scoreSum / gradedCount) * 10) / 10 : 0;
    const gpaPercentage = gradedCount > 0 ? Math.round((avgScore / 20) * 1000) / 10 : 0;
    const contactHours = completedCount * CONTACT_HOURS_PER_LAB;

    const rubricAverages = {};
    ['c1', 'c2', 'c3', 'c4', 'c5'].forEach(k => {
      rubricAverages[k] = rubricCounts[k] > 0 ? Math.round((rubricSums[k] / rubricCounts[k]) * 10) / 10 : 0;
    });

    return {
      student,
      summary: {
        totalLabs: TOTAL_LABS,
        completedLabs: completedCount,
        gradedLabs: gradedCount,
        completionRate: Math.round((completedCount / TOTAL_LABS) * 100),
        contactHours,
        maxContactHours: TOTAL_LABS * CONTACT_HOURS_PER_LAB,
        averageScore: avgScore,
        maxScore: 20,
        gpaPercentage,
        rubricAverages
      },
      labsBreakdown
    };
  },

  // 2. Get Section-Based Aggregate Report
  getSectionReport(sectionId) {
    const db = getDatabase();

    const section = db.prepare(`
      SELECT s.*, u.name as teacher_name, u.email as teacher_email
      FROM sections s
      LEFT JOIN users u ON s.teacher_id = u.id
      WHERE s.id = ?
    `).get(sectionId);

    if (!section) {
      throw new Error(`Section #${sectionId} not found.`);
    }

    const students = db.prepare(`
      SELECT id, name, student_id, email, gender, class_year, status
      FROM users
      WHERE section_id = ? AND role = 'student'
      ORDER BY name ASC
    `).all(sectionId);

    const studentReports = students.map(s => this.getStudentReport(s.id));

    // Compute Section Stats
    let totalScoreSum = 0;
    let totalScoreCount = 0;
    let scoresList = [];
    let completedLabsTotal = 0;
    const labScoreSums = {};
    const labScoreCounts = {};

    for (let w = 1; w <= TOTAL_LABS; w++) {
      const pad = String(w).padStart(2, '0');
      const labId = `lab-${pad}`;
      labScoreSums[labId] = 0;
      labScoreCounts[labId] = 0;
    }

    studentReports.forEach(sr => {
      completedLabsTotal += sr.summary.completedLabs;
      if (sr.summary.gradedLabs > 0) {
        totalScoreSum += sr.summary.averageScore;
        totalScoreCount++;
        scoresList.push(sr.summary.averageScore);
      }

      sr.labsBreakdown.forEach(lb => {
        if (lb.submission && lb.submission.status === 'graded') {
          labScoreSums[lb.labId] += (lb.submission.total_score || 0);
          labScoreCounts[lb.labId]++;
        }
      });
    });

    const studentCount = students.length;
    const avgSectionScore = totalScoreCount > 0 ? Math.round((totalScoreSum / totalScoreCount) * 10) / 10 : 0;
    const sectionCompletionRate = (studentCount * TOTAL_LABS) > 0 ? Math.round((completedLabsTotal / (studentCount * TOTAL_LABS)) * 100) : 0;

    // Standard deviation
    let stdDev = 0;
    if (scoresList.length > 1) {
      const mean = avgSectionScore;
      const variance = scoresList.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / scoresList.length;
      stdDev = Math.round(Math.sqrt(variance) * 10) / 10;
    }

    // Per lab averages
    const labAverages = [];
    for (let w = 1; w <= TOTAL_LABS; w++) {
      const pad = String(w).padStart(2, '0');
      const labId = `lab-${pad}`;
      const count = labScoreCounts[labId];
      const avg = count > 0 ? Math.round((labScoreSums[labId] / count) * 10) / 10 : null;
      labAverages.push({ week: w, labId, averageScore: avg, submissionsCount: count });
    }

    return {
      section,
      stats: {
        studentCount,
        activeStudentCount: students.filter(s => s.status === 'active').length,
        averageScore: avgSectionScore,
        percentageScore: Math.round((avgSectionScore / 20) * 1000) / 10,
        standardDeviation: stdDev,
        completionRate: sectionCompletionRate,
        totalCompletedSubmissions: completedLabsTotal,
        labAverages
      },
      students: studentReports
    };
  },

  // 3. Get Course-wide Class & Gender Comparative Analytics
  getCourseAnalytics() {
    const db = getDatabase();

    const sections = db.prepare('SELECT id, name, code, gender_target FROM sections').all();
    const students = db.prepare("SELECT id, gender, section_id, status FROM users WHERE role = 'student'").all();

    const maleStudents = [];
    const femaleStudents = [];

    students.forEach(st => {
      const rep = this.getStudentReport(st.id);
      if (st.gender === 'Female') {
        femaleStudents.push(rep);
      } else {
        maleStudents.push(rep);
      }
    });

    const calcCohortStats = (cohortReports) => {
      const count = cohortReports.length;
      if (count === 0) {
        return { count: 0, averageScore: 0, completionRate: 0, passRate: 0, distinctionRate: 0, rubricAverages: { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 } };
      }

      let scoreSum = 0;
      let scoreCount = 0;
      let completedLabs = 0;
      let passCount = 0; // >= 12 pts (60%)
      let distCount = 0; // >= 18 pts (90%)
      const rSums = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };
      const rCounts = { c1: 0, c2: 0, c3: 0, c4: 0, c5: 0 };

      cohortReports.forEach(cr => {
        completedLabs += cr.summary.completedLabs;
        if (cr.summary.gradedLabs > 0) {
          scoreSum += cr.summary.averageScore;
          scoreCount++;
          if (cr.summary.averageScore >= 12) passCount++;
          if (cr.summary.averageScore >= 18) distCount++;

          ['c1', 'c2', 'c3', 'c4', 'c5'].forEach(k => {
            if (cr.summary.rubricAverages[k]) {
              rSums[k] += cr.summary.rubricAverages[k];
              rCounts[k]++;
            }
          });
        }
      });

      const avgScore = scoreCount > 0 ? Math.round((scoreSum / scoreCount) * 10) / 10 : 0;
      const compRate = (count * TOTAL_LABS) > 0 ? Math.round((completedLabs / (count * TOTAL_LABS)) * 100) : 0;
      const passRate = scoreCount > 0 ? Math.round((passCount / scoreCount) * 100) : 0;
      const distinctionRate = scoreCount > 0 ? Math.round((distCount / scoreCount) * 100) : 0;

      const rubricAverages = {};
      ['c1', 'c2', 'c3', 'c4', 'c5'].forEach(k => {
        rubricAverages[k] = rCounts[k] > 0 ? Math.round((rSums[k] / rCounts[k]) * 10) / 10 : 0;
      });

      return {
        count,
        gradedStudentsCount: scoreCount,
        averageScore: avgScore,
        percentageScore: Math.round((avgScore / 20) * 1000) / 10,
        completionRate: compRate,
        passRate,
        distinctionRate,
        rubricAverages
      };
    };

    const maleStats = calcCohortStats(maleStudents);
    const femaleStats = calcCohortStats(femaleStudents);

    // Section comparisons
    const sectionComparisons = sections.map(sec => {
      const sRep = this.getSectionReport(sec.id);
      return {
        sectionId: sec.id,
        name: sec.name,
        code: sec.code,
        genderTarget: sec.gender_target,
        studentCount: sRep.stats.studentCount,
        averageScore: sRep.stats.averageScore,
        completionRate: sRep.stats.completionRate,
        passRate: sRep.stats.studentCount > 0 ? Math.round((sRep.students.filter(s => s.summary.averageScore >= 12).length / sRep.stats.studentCount) * 100) : 0
      };
    });

    return {
      overall: {
        totalEnrolled: students.length,
        maleStudentsCount: maleStudents.length,
        femaleStudentsCount: femaleStudents.length,
        totalSections: sections.length
      },
      genderComparison: {
        male: maleStats,
        female: femaleStats
      },
      sectionComparisons
    };
  },

  // 4. Generate Consolidated Gradebook CSV
  generateGradebookCSV(sectionId = null) {
    const db = getDatabase();

    let query = `
      SELECT u.id, u.name, u.student_id, u.email, u.gender, u.class_year, s.name as section_name
      FROM users u
      LEFT JOIN sections s ON u.section_id = s.id
      WHERE u.role = 'student'
    `;
    const params = [];
    if (sectionId) {
      query += ' AND u.section_id = ?';
      params.push(sectionId);
    }
    query += ' ORDER BY s.name ASC, u.name ASC';

    const students = db.prepare(query).all(...params);

    // CSV Header
    let csv = 'Student ID,Full Name,Email,Gender,Section,Class Year,Completed Labs,Avg Score (/20),GPA (%)';
    for (let w = 1; w <= TOTAL_LABS; w++) {
      csv += `,Lab ${w} Score,Lab ${w} Status`;
    }
    csv += '\r\n';

    students.forEach(st => {
      const rep = this.getStudentReport(st.id);
      const row = [
        `"${st.student_id || ''}"`,
        `"${st.name.replace(/"/g, '""')}"`,
        `"${st.email}"`,
        `"${st.gender}"`,
        `"${st.section_name || 'Unassigned'}"`,
        `"${st.class_year || ''}"`,
        rep.summary.completedLabs,
        rep.summary.averageScore,
        rep.summary.gpaPercentage + '%'
      ];

      rep.labsBreakdown.forEach(lb => {
        if (lb.submission && lb.submission.status === 'graded') {
          row.push(lb.submission.total_score);
          row.push('Graded');
        } else if (lb.submission && lb.submission.status === 'submitted') {
          row.push('Submitted');
          row.push('Submitted');
        } else if (lb.submission && lb.submission.status === 'in_progress') {
          row.push('In Progress');
          row.push('In Progress');
        } else {
          row.push('0');
          row.push('Not Started');
        }
      });

      csv += row.join(',') + '\r\n';
    });

    return csv;
  }
};

module.exports = reportingService;
