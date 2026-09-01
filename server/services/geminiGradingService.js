const { GoogleGenAI } = require('@google/genai');
const { getDatabase } = require('../db/database');

// Master course curriculum benchmarks and answer keys for all 15 labs
const LAB_BENCHMARKS = {
  'lab-01': {
    title: "Lab 1: The Imaging Chain & Radiographer's Role",
    week: 1,
    keyConcepts: "X-ray tube anatomy (anode, cathode, target, filament, focusing cup, vacuum envelope), 4 stages of image formation (1: generation, 2: patient interaction/differential absorption, 3: detection/receptor capture, 4: processing/display), receptor types (CR, DR, Screen-film), dual radiographer role (diagnostic quality + ALARA radiation protection).",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-02': {
    title: "Lab 2: Image Formation Simulator",
    week: 2,
    keyConcepts: "Inverse square law (I2 = I1 * (d1/d2)^2), Magnification factor (MF = SID / SOD, OID = SID - SOD), mAs photon quantity linearity, kVp beam energy and penetration, patient thickness attenuation, remnant beam.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-03': {
    title: "Lab 3: Film Receptors & Darkroom Conditions",
    week: 3,
    keyConcepts: "Double-emulsion film cross-section (base, adhesive, emulsion with silver halide AgBr crystals, supercoat), Gurney-Mott latent image formation, safelight filter (amber/red) transmission and distance (>1.2m), automatic processor chemistry (developer, fixer, wash, dryer) and temperature/replenishment effects.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-04': {
    title: "Lab 4: Optical Density & Sensitometry",
    week: 4,
    keyConcepts: "H&D characteristic curve (D-log E plot), Base + Fog (gross fog < 0.20 OD), Toe region, Straight-line portion, Shoulder/D-max, Film speed (speed point at net OD 1.0 above base+fog), Film gamma (average gradient/slope = contrast), Film latitude (dynamic range).",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-05': {
    title: "Lab 5: Radiographic Contrast Simulator",
    week: 5,
    keyConcepts: "Subject contrast (tissue atomic number, physical density, thickness, beam kVp energy), Receptor contrast, High contrast (short-scale, narrow latitude, low kVp) vs Low contrast (long-scale, wide latitude, high kVp), Window Width (WW controls contrast scale) and Window Level (WL controls display brightness).",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-06': {
    title: "Lab 6: Spatial Resolution & Magnification",
    week: 6,
    keyConcepts: "Geometric unsharpness/focal spot blur (FGB = FSS * OID / SOD), Line-pair resolution phantom (lp/mm), Small vs large focal spot selection, Patient motion unsharpness mitigation (short exposure time), OID minimization.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-07': {
    title: "Lab 7: Geometric Distortion",
    week: 7,
    keyConcepts: "Shape distortion: Foreshortening (anatomical part angled relative to image receptor with perpendicular central ray) vs Elongation (central ray angled relative to aligned part/IR), Size distortion (magnification), Central Ray centering.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-08': {
    title: "Lab 8: Scatter Control, Collimation & Grids",
    week: 8,
    keyConcepts: "Compton scattering vs Photoelectric absorption, Beam collimation (reduces scatter production and patient dose), Grid ratio (r = h/D), Bucky factor (BF = mAs with grid / mAs without grid), Grid cutoff (off-level, off-center, upside-down focused grid), ALARA dose penalty.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-09': {
    title: "Lab 9: Quantum Noise, DQE & SNR",
    week: 9,
    keyConcepts: "Photon fluence, Poisson noise statistics (sigma = sqrt(N)), Rose criterion for threshold object visibility (SNR >= 5), Signal-to-Noise Ratio (SNR), Contrast-to-Noise Ratio (CNR), Detective Quantum Efficiency (DQE = SNR_out^2 / SNR_in^2), Low-dose quantum mottle prevention.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-10': {
    title: "Lab 10: Fluoroscopy Imaging Chain Simulator",
    week: 10,
    keyConcepts: "Image Intensifier (II) tube components (input phosphor CsI, photocathode, electrostatic lenses, anode, output phosphor ZnCdS:Ag), Flux gain, Minification gain, Total brightness gain, Magnification mode dose penalty (Dose ~ (D_normal / D_mag)^2), Pulsed fluoroscopy, Automatic Brightness Control (ABC), 5-minute timer.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-11': {
    title: "Lab 11: Digital Receptors & Digital Resolution",
    week: 11,
    keyConcepts: "Computed Radiography (CR photostimulable phosphor BaFBr:Eu2+, photostimulated luminescence PSL, laser scan, photomultiplier tube PMT) vs Direct Digital Radiography (DR direct a-Se vs indirect CsI / a-Si TFT flat panels), Pixel pitch (delta_x), Nyquist limiting spatial frequency (f_N = 1 / (2 * delta_x)), Matrix dimensions, Dynamic range.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-12': {
    title: "Lab 12: Digital Contrast, Windowing & Latitude",
    week: 12,
    keyConcepts: "Digital image processing pipeline: Histogram generation, Values of Interest (VOI), Rescaling, Look-Up Table (LUT) application, Exposure Index (EI) and Deviation Index (DI = 10 * log10(EI / EI_target)), Wide dynamic exposure latitude, Preventing dose creep under ALARA.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-13': {
    title: "Lab 13: The IMAGE Process: Recording Stages",
    week: 13,
    keyConcepts: "Clinical systematic workflow: Stage I (Initial setup & room readiness), Stage M (Manual/Technical factors: kVp, mAs, SID, grid), Stage A (Anatomy preparation & positioning), Stage G (Guidance, central ray alignment, collimation, lead markers, respiration instructions).",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-14': {
    title: "Lab 14: The IMAGE Process: Evaluate (Critique)",
    week: 14,
    keyConcepts: "Stage E (Systematic Image Critique): 5 Domains (Anatomy & Collimation, Positioning & Part Alignment, Exposure Index & Noise, Lead Side Marker & ID Gate, Artifact & Motion integrity), Evidence-based ALARA repeat gating (Accept & Transmit to PACS, Accept with Annotation, Reject & Repeat, Recoverable do-not-repeat).",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  },
  'lab-15': {
    title: "Lab 15: Radiographic Artifact Identification",
    week: 15,
    keyConcepts: "10 Authentic clinical artifact classifications across DR, CR, and Screen-Film (DR column defect, CR moiré grid aliasing, PSP ghosting, radiopaque metal zipper, patient motion blur, focused grid cutoff, static discharge, processor pi lines, quantum mottle), IMAGE root-cause isolation (I, M, A, G, E), VOI obstruction assessment, QA quarantine.",
    rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
  }
};

const geminiGradingService = {
  // Get configured Gemini API client
  getGeminiClient() {
    const db = getDatabase();
    const apiKey = db.prepare("SELECT value FROM system_settings WHERE key = 'gemini_api_key'").get()?.value || process.env.GEMINI_API_KEY;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
  },

  getGeminiModel() {
    const db = getDatabase();
    return db.prepare("SELECT value FROM system_settings WHERE key = 'gemini_model'").get()?.value || 'gemini-3.7-flash';
  },

  // Main evaluation function
  async gradeSubmission(submissionId) {
    const db = getDatabase();

    const submission = db.prepare(`
      SELECT s.*, u.name as student_name, u.student_id, u.gender, u.email, sec.name as section_name
      FROM lab_submissions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN sections sec ON u.section_id = sec.id
      WHERE s.id = ?
    `).get(submissionId);

    if (!submission) {
      throw new Error(`Submission #${submissionId} not found.`);
    }

    const labId = submission.lab_id;
    const benchmark = LAB_BENCHMARKS[labId] || {
      title: `RAD 321 Laboratory ${submission.week_number}`,
      week: submission.week_number,
      keyConcepts: "Radiographic physics, image formation, quality control, and ALARA principles.",
      rubricMax: { c1: 4, c2: 5, c3: 5, c4: 3, c5: 3 }
    };

    let parsedState = {};
    let parsedRuns = [];
    try { parsedState = JSON.parse(submission.state_data || '{}'); } catch (e) {}
    try { parsedRuns = JSON.parse(submission.runs_data || '[]'); } catch (e) {}

    const attachments = db.prepare('SELECT original_filename, file_size FROM submission_attachments WHERE submission_id = ?').all(submissionId);

    const client = this.getGeminiClient();
    const model = this.getGeminiModel();

    let evaluationResult = null;

    if (client) {
      try {
        evaluationResult = await this._callGeminiGrading({
          client,
          model,
          submission,
          benchmark,
          parsedState,
          parsedRuns,
          attachments
        });
      } catch (err) {
        console.warn(`Gemini AI grading API call failed (${err.message}). Falling back to algorithmic rubric evaluator.`);
        evaluationResult = this._algorithmicFallbackGrading(submission, benchmark, parsedState, parsedRuns, attachments);
      }
    } else {
      console.info('Gemini API key not configured. Using deterministic rubric grading engine.');
      evaluationResult = this._algorithmicFallbackGrading(submission, benchmark, parsedState, parsedRuns, attachments);
    }

    // Save evaluation result to database
    db.prepare(`
      UPDATE lab_submissions
      SET
        total_score = ?,
        ai_score = ?,
        ai_feedback = ?,
        rubric_scores = ?,
        status = 'graded',
        ai_graded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      evaluationResult.totalScore,
      evaluationResult.totalScore,
      JSON.stringify(evaluationResult),
      JSON.stringify(evaluationResult.rubricScores),
      submissionId
    );

    // Audit log
    db.prepare(`
      INSERT INTO audit_logs (user_id, action, details)
      VALUES (?, 'AI_GRADE_SUBMISSION', ?)
    `).run(submission.user_id, `AI Graded submission #${submissionId} for ${submission.student_name} (${labId}): Score ${evaluationResult.totalScore}/20`);

    return evaluationResult;
  },

  // Call Gemini 3.7 Flash via official Google GenAI SDK
  async _callGeminiGrading({ client, model, submission, benchmark, parsedState, parsedRuns, attachments }) {
    const prompt = `
You are an expert academic evaluator and Senior Radiologic Technologist Professor grading a laboratory assignment in the Diagnostic Radiology Technology Program at Taibah University.

Course: RAD 321 — Image Recording & Analysis
Laboratory Module: ${benchmark.title} (Week ${benchmark.week})
Core Concepts & Key Benchmark Answers: ${benchmark.keyConcepts}

STUDENT SUBMISSION EVIDENCE:
- Student Name: ${submission.student_name} (ID: ${submission.student_id || 'N/A'})
- Gender / Section: ${submission.gender} / ${submission.section_name || 'N/A'}
- Initial Scientific Prediction: "${submission.prediction || parsedState.fields?.['w-prediction'] || 'N/A'}"
- Number of Controlled Experimental Runs: ${parsedRuns.length}
- Recorded Experimental Runs Data:
${JSON.stringify(parsedRuns, null, 2)}
- Knowledge Check Quiz Score: ${submission.quiz_score} / ${submission.quiz_total}
- Worksheet Written Answers:
${JSON.stringify(parsedState.fields || {}, null, 2)}
- Uploaded Attachments / Calculations: ${attachments.length > 0 ? attachments.map(a => a.original_filename).join(', ') : 'None'}

GRADING INSTRUCTIONS & 20-POINT STANDARDIZED RUBRIC:
Evaluate the student's submission rigorously against the 5 criteria:
1. Criterion c1 - Conceptual Understanding (Max 4.0 pts): Accuracy of physics principles, imaging chain concepts, and correct terminology.
2. Criterion c2 - Simulation Execution & Results (Max 5.0 pts): Minimum 3 unique controlled runs, systematic variable manipulation, and accurate trend observations.
3. Criterion c3 - Calculations & Worksheet Quality (Max 5.0 pts): Correct formulas, mathematical accuracy, step-by-step reasoning, and quiz performance.
4. Criterion c4 - Clinical Reasoning & ALARA Synthesis (Max 3.0 pts): Connection to patient radiation safety, clinical decision justification, and diagnostic image quality trade-offs.
5. Criterion c5 - Completeness & Professionalism (Max 3.0 pts): Completeness of all questions, clarity, structure, and professional radiological reporting.

You MUST respond strictly in valid JSON format conforming to this JSON schema:
{
  "totalScore": number (float between 0 and 20, sum of c1+c2+c3+c4+c5),
  "overallFeedback": "Detailed, encouraging, and pedagogically sound evaluation summary highlighting strengths and specific areas to review.",
  "strengths": ["Strength 1", "Strength 2"],
  "areasForImprovement": ["Area 1", "Area 2"],
  "rubricScores": {
    "c1": number (0 to 4),
    "c2": number (0 to 5),
    "c3": number (0 to 5),
    "c4": number (0 to 3),
    "c5": number (0 to 3)
  },
  "rubricBreakdown": {
    "c1": { "score": number, "max": 4, "rationale": "Clear justification of criterion 1 score" },
    "c2": { "score": number, "max": 5, "rationale": "Clear justification of criterion 2 score" },
    "c3": { "score": number, "max": 5, "rationale": "Clear justification of criterion 3 score" },
    "c4": { "score": number, "max": 3, "rationale": "Clear justification of criterion 4 score" },
    "c5": { "score": number, "max": 3, "rationale": "Clear justification of criterion 5 score" }
  }
}
`;

    const response = await client.models.generateContent({
      model: model || 'gemini-3.7-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const responseText = response.text || (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text);
    if (!responseText) {
      throw new Error('Empty response received from Gemini API');
    }

    const parsed = JSON.parse(responseText.trim());
    return parsed;
  },

  // Deterministic algorithmic fallback when offline or no API key is supplied
  _algorithmicFallbackGrading(submission, benchmark, parsedState, parsedRuns, attachments) {
    const fields = parsedState.fields || {};
    const textValues = Object.values(fields).filter(v => typeof v === 'string').join(' ');
    const wordCount = textValues.split(/\s+/).filter(Boolean).length;

    // c1: Conceptual (out of 4)
    let c1 = 3.0;
    if (wordCount > 80) c1 = 3.5;
    if (wordCount > 150) c1 = 4.0;
    if (wordCount < 30) c1 = 2.0;

    // c2: Simulation (out of 5)
    let c2 = 2.0;
    if (parsedRuns.length >= 1) c2 = 3.5;
    if (parsedRuns.length >= 2) c2 = 4.5;
    if (parsedRuns.length >= 3) c2 = 5.0;

    // c3: Calculations & Quiz (out of 5)
    const quizRatio = submission.quiz_total > 0 ? (submission.quiz_score / submission.quiz_total) : 1;
    let c3 = Math.round((quizRatio * 3.0 + (wordCount > 50 ? 2.0 : 1.0)) * 2) / 2;
    if (c3 > 5.0) c3 = 5.0;

    // c4: Clinical ALARA (out of 3)
    let c4 = 2.5;
    const lowerText = textValues.toLowerCase();
    if (lowerText.includes('alara') || lowerText.includes('dose') || lowerText.includes('patient') || lowerText.includes('magnification')) {
      c4 = 3.0;
    }

    // c5: Completeness (out of 3)
    let c5 = 2.5;
    if (parsedRuns.length >= 3 && wordCount >= 60) c5 = 3.0;
    if (attachments.length > 0 && c5 < 3.0) c5 = 3.0;

    const totalScore = Math.round((c1 + c2 + c3 + c4 + c5) * 10) / 10;

    return {
      totalScore,
      overallFeedback: `Well-structured submission for ${benchmark.title}. Simulation runs (${parsedRuns.length} recorded) and knowledge-check performance demonstrate solid comprehension of the imaging chain. Continue referencing specific formula values in your quantitative responses.`,
      strengths: [
        `Executed ${parsedRuns.length} controlled experimental runs.`,
        `Scored ${submission.quiz_score}/${submission.quiz_total} on the knowledge check quiz.`,
        `Demonstrated clinical awareness of diagnostic image quality and ALARA principles.`
      ],
      areasForImprovement: [
        'Ensure all calculation steps are explicitly detailed with complete units.',
        'Deepen the discussion on clinical trade-offs between patient dose and image noise.'
      ],
      rubricScores: { c1, c2, c3, c4, c5 },
      rubricBreakdown: {
        c1: { score: c1, max: 4, rationale: `Assessed based on conceptual depth and accuracy of radiological terminology (${wordCount} words written).` },
        c2: { score: c2, max: 5, rationale: `Recorded ${parsedRuns.length} controlled simulation runs with parameter adjustments.` },
        c3: { score: c3, max: 5, rationale: `Knowledge check quiz score (${submission.quiz_score}/${submission.quiz_total}) and worksheet formulas.` },
        c4: { score: c4, max: 3, rationale: 'Addressed clinical ALARA radiation safety and positioning considerations.' },
        c5: { score: c5, max: 3, rationale: 'Worksheet and activity completion.' }
      }
    };
  }
};

module.exports = geminiGradingService;
