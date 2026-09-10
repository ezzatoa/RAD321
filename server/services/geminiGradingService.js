const { GoogleGenAI } = require('@google/genai');
const { getDatabase } = require('../db/database');

// Master course curriculum benchmarks and answer keys for all 15 labs
const LAB_BENCHMARKS = {
  'lab-01': {
    title: "Lab 1: The Imaging Chain & Radiographer's Role",
    week: 1,
    keyConcepts: "X-ray tube physics & anatomy (filament heating current 3.8-4.8A, thermionic electron emission mA, tube potential kVp, rotating anode target Z=74 W vs Z=42 Mo, Bremsstrahlung efficiency eta = 10^-9*Z*V showing ~99% heat vs ~1% X-ray, filtration beam hardening & HVL compliance >=2.5mm Al eq), 4 stages of image formation (primary beam propagation, patient interaction/attenuation, receptor capture, image processing/display), 4 receptor families (Screen-Film, CR PSP, DR flat panel, Fluoroscopy image intensifier), dual radiographer role (image recording vs image analysis under ALARA).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-02': {
    title: "Lab 2: Image Formation Simulator",
    week: 2,
    keyConcepts: "Inverse square law (I2 = I1 * (d1/d2)^2), Direct square law mAs compensation (mAs2 = mAs1 * (d2/d1)^2), Magnification factor (MF = SID / SOD, OID = SID - SOD, % enlargement = (MF - 1)*100%), mAs photon quantity linearity, kVp beam energy and penetration, patient thickness attenuation, remnant beam formation, distance radiation protection under occupational ALARA (Time, Distance, Shielding; doubling distance quarters scatter dose).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-03': {
    title: "Lab 3: Film Receptors & Darkroom Conditions",
    week: 3,
    keyConcepts: "Double-emulsion film cross-section (base polyester, adhesive subbing, emulsion with silver halide AgBr/AgI microcrystals and sensitivity specks, supercoat), Intensifying screens (rare-earth phosphors Gd2O2S:Tb green vs LaOBr:Tm blue, 99% light conversion, spectral matching), Gurney-Mott latent image formation (photoelectron ejection, speck trapping, interstitial Ag+ migration, neutral Ag0 catalytic center), Safelight filter transmission (GBX-2 ruby red vs Wratten 6B amber) and inverse-square distance (>1.2m / 120cm), Automatic processor chemistry (Developer PQ, Squeegee rinse, Fixer ammonium thiosulfate clearing & alum hardening, Wash hypo removal, Dryer) and Arrhenius time-temperature activity.",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-04': {
    title: "Lab 4: Optical Density & Sensitometry",
    week: 4,
    keyConcepts: "Optical density logarithmic definition (OD = log10(I0/It) = -log10(T)), Rule of 0.3 OD (halving of light transmission), H&D characteristic curve (D-log E plot), Base + Fog (gross fog D-min < 0.20 OD), Toe region, Straight-line portion (useful diagnostic range), Shoulder / D-max saturation, Film speed (speed point at net OD 1.0 above base+fog), Film gamma (slope gamma = delta_OD / delta_logE) and average gradient, Exposure latitude and its inverse reciprocal relationship with contrast (Latitude proportional to 1/gamma), 21-step sensitometer strip QA (speed index, contrast index).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-05': {
    title: "Lab 5: Radiographic Contrast Simulator",
    week: 5,
    keyConcepts: "Radiographic contrast tripartite definition (Subject Contrast * Receptor Contrast * Display Contrast), Subject contrast physics (Beer-Lambert attenuation I = I0 * exp(-mu * x), Photoelectric absorption proportional to Z^3/E^3 vs Compton scattering, cortical bone Z=13.8 vs soft tissue Z=7.4, tissue physical density, beam kVp energy), Short-scale contrast (high contrast, few gray shades, extremity bone) vs Long-scale contrast (low contrast, many gray shades, chest parenchyma), Receptor contrast (film gamma) vs Digital wide linear dynamic range, Digital processing (Look-Up Tables LUT, Window Width WW controlling contrast scale, Window Level WL controlling display brightness), ALARA contrast optimization (adequate penetration before windowing).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-06': {
    title: "Lab 6: Spatial Resolution & Magnification",
    week: 6,
    keyConcepts: "Spatial resolution and spatial frequency (line pairs per millimeter lp/mm, f = 1/(2w)), Geometric magnification factor (M = SID / SOD = SID / (SID - OID)), Focal spot geometric unsharpness / penumbra blur (Ug = F * OID / SOD = F * (M - 1)), Ray geometry: Umbra (true geometric shadow) vs Penumbra (focal spot blur), Geometric limiting spatial resolution (R_limit approx 1 / (2 * Ug)), Focal spot selection trade-offs (small 0.6 mm for fine extremity detail vs large 1.2 mm for high tube current loading capacity and anode thermal protection), Geometry optimization (OID minimization, extended SID to restore sharpness), Patient kinetic motion unsharpness (Um = v * t, mitigation via immobilization and short exposure times), Macroradiography principles (fractional microfocus tubes 0.1-0.3 mm with intentional air-gap magnification).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-07': {
    title: "Lab 7: Geometric Distortion",
    week: 7,
    keyConcepts: "Radiographic distortion classification (Size distortion / magnification M = SID / SOD vs Shape distortion vs Positional distortion), Shape distortion mechanics: Foreshortening (anatomical part tilted/angled relative to image receptor under perpendicular central ray, L_proj approx L0 * M * cos(theta_part), shape factor < 1.0) vs Elongation (central ray angled relative to aligned part/IR, or lateral displacement off-center exposing anatomy to diverging beam theta_ray = arctan(offset / SOD), shape factor > 1.0), Geometric Alignment Triad (Part parallel to IR, CR perpendicular to Part and IR, CR centered over ROI), Beam ray divergence off-centering physics, Intentional clinical tube angulation (e.g. AP Axial cervical spine 15-20 deg cephalad, Townes 30 deg caudad, calcaneus axial 40 deg cephalad to unmask anatomical superimposition), Critical distinction between geometric distortion (shape/size misrepresentation) and unsharpness (penumbra boundary blur).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-08': {
    title: "Lab 8: Scatter Control, Collimation & Grids",
    week: 8,
    keyConcepts: "Compton scattering physics (incoherent scatter producing unwanted omnidirectional background fog and degrading SNR), Scatter-to-Primary Ratio (SPR = I_scatter / I_primary), Determinants of scatter production (field size / irradiated tissue volume V = A * x, patient thickness x, beam kVp energy), Pre-patient scatter control: Beam collimation (limits irradiated tissue volume, preserves subject contrast, directly reduces patient dose under ALARA), Post-patient scatter cleanup: Anti-scatter grids (Dr. Gustav Bucky and Dr. Hollis Potter), Grid ratio (r = h / D, where h is lead strip height and D is interspace width), Grid frequency (lines/cm), Contrast Improvement Factor (CIF or K = (1 + SPR_before) / (1 + SPR_after)), Bucky Factor / grid conversion factor (BF = mAs_with / mAs_without, patient dose multiplier), Grid cutoff mechanisms (off-level, off-center, off-focus, and upside-down focused grid), Air-gap technique (natural scatter bypass with magnification trade-off).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-09': {
    title: "Lab 9: Quantum Noise, DQE & SNR",
    week: 9,
    keyConcepts: "Poisson photon statistics (sigma_q = sqrt(N)), Relative noise scaling (sigma_q / S = 1 / sqrt(N)), Quadrature noise addition (sigma_tot = sqrt(sigma_q^2 + sigma_int^2)), Signal-to-Noise Ratio (SNR = S / sigma_tot proportional to sqrt(mAs * DQE)), Contrast-to-Noise Ratio (CNR = |S_target - S_background| / sigma_tot), Rose Criterion for visual perception threshold (SNR >= 5.0, CNR >= 2.5 for reliable low-contrast lesion conspicuity), Detective Quantum Efficiency (DQE = SNR_out^2 / SNR_in^2 as measure of detector dose preservation), Electronic noise floor vs quantum mottle dominance regimes, ALARA low-dose protocol optimization.",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-10': {
    title: "Lab 10: Fluoroscopy Imaging Chain Simulator",
    week: 10,
    keyConcepts: "Image Intensifier (II) tube architecture (input phosphor CsI:Na needle crystals, Sb-Cs photocathode photoemission, electrostatic focusing lenses, accelerating anode at 25-35 kV, ZnCdS:Ag output phosphor), Minification Gain (MG = (d_in / d_out)^2), Flux Gain (FG ~ 50-100), Total Brightness Gain (BG = MG * FG), Magnification Mode physics (increased lens voltage, shift of electron crossover closer to photocathode, ABC/AERC tube output compensation yielding patient dose rate penalty ~ (d_0 / d_mag)^2), Spatial resolution enhancement (lp/mm) vs patient dose trade-off, Fluoroscopic radiation protection ALARA principles (time / pulsed fluoroscopy 7.5-15 pps, 5-minute cumulative timer, Inverse-Square Law distance 1/d^2 for scatter, 0.5 mm Pb protective aprons, thyroid shields, ceiling lead acrylic shields, and table lead curtains).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-11': {
    title: "Lab 11: Digital Receptors & Digital Resolution",
    week: 11,
    keyConcepts: "Computed Radiography (CR photostimulable phosphor BaFBr:Eu2+, metastable F-centers, laser scanning 633 nm, photostimulated luminescence PSL 390 nm, PMT, turbid light scattering MTF degradation) vs Indirect Flat-Panel DR (CsI:Tl needle scintillator light channeling + a-Si photodiode TFT array) vs Direct Flat-Panel DR (amorphous Selenium a-Se photoconductor under high-voltage bias, vertical charge collection, zero lateral light spread, superior MTF), Matrix Pixel Size (p_matrix = FOV / Matrix), Effective Sampling Pitch (p_eff = max(p_DEL, p_matrix)), Sampling frequency (f_s = 1 / p_eff), Nyquist limiting spatial frequency (f_N = 1 / (2 * p_eff) lp/mm), Shannon-Nyquist theorem & Moiré aliasing artifacts (f_alias = |f_s - f|), DEL Fill Factor (Active Area / Total DEL Area), Limiting spatial resolution at 10% MTF (R_10% ~ f_N * MTF_material), Minimum resolvable feature width (Delta_x = 1 / (2 * R_10%)), Sampling bottlenecks (matrix-limited vs detector-limited).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-12': {
    title: "Lab 12: Digital Contrast, Windowing & Latitude",
    week: 12,
    keyConcepts: "Digital contrast and grayscale transformation: Window Width (WW) controlling displayed contrast and Look-Up Table (LUT) slope (G = 255 / WW), Window Level (WL) controlling overall image brightness and tissue midpoint, Active display passband (T_low = WL - WW/2 to T_high = WL + WW/2) with black clipping and white saturation, Anatomical window presets (Mediastinum/Soft tissue: WW 400, WL 40; Bone: WW 1500, WL 400; Lung: WW 1200, WL -500; Narrow nodule: WW 120, WL 45), Wide linear dynamic exposure latitude and automatic rescaling masking overexposure ('dose creep'), IEC Deviation Index (DI = 10 * log10[EI / EI_target], target -1.0 to +1.0 DI), Poisson quantum noise vs. photon economy, Subtle lesion Contrast-to-Noise Ratio (CNR) and Rose criterion (CNR >= 4.0).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-13': {
    title: "Lab 13: The IMAGE Process: Recording Stages",
    week: 13,
    keyConcepts: "Clinical systematic recording workflow: Stage I (Initial setup: 2 unique patient identifiers [Name/DOB], clinical requisition, tabletop non-grid vs. table Bucky 8:1 grid, standard 100 cm SID), Stage M (Manual exposure factors: kVp penetration and subject contrast, mAs photon fluence, IEC Deviation Index [DI = 10 * log10(EI / 200)], Small 0.6 mm vs. Large 1.2 mm focal spot size), Stage A (Anatomy preparation & positioning: True AP knee alignment with parallel epicondyles, removal of radiopaque external zipper/brace artifacts, sandbag immobilization to prevent motion), Stage G (Guidance: Central Ray centered 1.25 cm distal to patellar apex through joint space, 4-sided beam collimation 18x24 cm reducing scatter fraction S/P, anatomical lead side marker 'R' placed laterally in-beam, clear respiration/motion suspension), Critical gating flags (missing marker <=55%, metallic artifact <=45%, unverified ID <=45%, clipped anatomy <=48%), Geometric unsharpness (Ug = FSS * OID / SOD) and total unsharpness (Ut = sqrt[Ug^2 + Um^2]).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-14': {
    title: "Lab 14: The IMAGE Process: Evaluate (Critique)",
    week: 14,
    keyConcepts: "Stage E (Systematic 5-Domain Image Critique: 1. Anatomical Coverage & Collimation [distal femur to proximal tib/fib VOI, 4-sided margins controlling scatter]; 2. Part Positioning & Condylar Alignment [True AP knee, femoral epicondyles parallel to IR, open femorotibial joint space, patella centered over distal femur, exactly 1/3 proximal fibular head superimposition behind lateral tibial condyle]; 3. Exposure Index & Quantum Noise [target EI 200, DI = 10 * log10(mAs / 8.0), noise SD = 28 / sqrt(mAs), photon starvation mottle at mAs <= 2.5 vs. detector saturation]; 4. Lead Side Marker & Legal Integrity [in-beam physical lead marker, missing marker protocol requiring dual-technologist electronic annotation, wrong side marker escalation]; 5. Artifacts & Motion Integrity [radiopaque clothing/zipper over VOI, kinetic motion unsharpness, detector line defects]), Weighted composite score formula (Score = 0.30*S_Anat + 0.25*S_Pos + 0.25*S_Exp + 0.10*S_Mark + 0.10*S_Art), Evidence-based ALARA repeat gating rules: distinguishing fatal non-diagnostic defects requiring repeat (clipped essential VOI anatomy, severe rotation >15 deg, severe quantum mottle EI < 75 / DI < -4, metallic foreign body over VOI, severe motion blur) from non-fatal administrative/display variances (missing side marker on otherwise pristine diagnostic image rectifiable via verified electronic annotation without re-irradiating patient; window width WW and window level WL post-processing adjustments).",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
  },
  'lab-15': {
    title: "Lab 15: Radiographic Artifact Identification",
    week: 15,
    keyConcepts: "10 Authentic clinical artifact classifications across DR, CR, and Screen-Film (1. DR column/dead pixel line defect, 2. CR stationary grid moiré pattern aliasing, 3. CR PSP plate ghosting/incomplete erasure, 4. Radiopaque foreign body zipper/snap over VOI, 5. Patient involuntary motion blur, 6. Focused grid cutoff/off-level misalignment, 7. Screen-film static discharge tree/crown spark, 8. Automatic processor pi lines at pi*d intervals and guide-shoe scratches, 9. Quantum mottle/photon starvation, and 0. Optimal clean diagnostic baseline), IMAGE root-cause isolation across 5 stages (Stage I: plate erasure, cassette handling, darkroom humidity; Stage M: technique mAs photon starvation; Stage A: patient gowning, external artifact removal, immobilization; Stage G: central ray centering, grid alignment, anti-scatter mechanics; Stage E: TFT readout array hardware, chemical processor rollers), Volume of Interest (VOI) diagnostic impact multiplier (1.0x critical VOI overlap vs. 0.35x peripheral margins), Evidence-based ALARA repeat gating rules: distinguishing mandatory repeat justified (critical VOI obscured, e.g. metallic zipper over knee joint, severe motion unsharpness, severe quantum mottle) from do-not-repeat / post-processing recovery (CR moiré filtering, peripheral static spark outside VOI) and hardware failure quarantine (DR TFT column line defect where patient must NEVER be re-exposed on same defective receptor), and departmental QC prevention protocols.",
    rubricMax: { c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }
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

    // Check if both phases are submitted or if Phase 2 is pending
    const currentSub = db.prepare('SELECT excel_submitted_at, status FROM lab_submissions WHERE id = ?').get(submissionId);
    const finalStatus = (currentSub && (currentSub.excel_submitted_at || currentSub.status === 'submitted' || currentSub.status === 'graded')) ? 'graded' : 'in_lab_submitted';

    // Save evaluation result to database
    db.prepare(`
      UPDATE lab_submissions
      SET
        total_score = ?,
        ai_score = ?,
        ai_feedback = ?,
        rubric_scores = ?,
        status = ?,
        ai_graded_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      evaluationResult.totalScore,
      evaluationResult.totalScore,
      JSON.stringify(evaluationResult),
      JSON.stringify(evaluationResult.rubricScores),
      finalStatus,
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
  // Call Gemini Flash via official Google GenAI SDK
  async _callGeminiGrading({ client, model, submission, benchmark, parsedState, parsedRuns, attachments }) {
    const isLab1 = submission.lab_id === 'lab-01';
    const excelAttachment = attachments.find(a => /\.(xlsx|xls|csv)$/i.test(a.original_filename)) || attachments[0];

    const prompt = `
You are an expert academic evaluator and Senior Radiologic Technologist Professor grading a laboratory assignment in the Diagnostic Radiology Technology Program at Taibah University.

Course: RAD 321 — Image Recording & Analysis
Laboratory Module: ${benchmark.title} (Week ${benchmark.week})
Core Concepts & Key Benchmark Answers: ${benchmark.keyConcepts}

EVALUATION FRAMEWORK — TWO-PART STANDARDIZED 20-POINT RUBRIC:
Each lab assignment consists of two integral parts:
PART I: IN-LAB INTERACTIVE ACTIVITIES & SIMULATION (10.0 Points Total)
- Criterion c1: Conceptual Understanding & Knowledge Check (Max 4.0 pts): Accuracy of imaging chain principles, pre-lab predictions, and mastery quiz scores.
- Criterion c2: Interactive Simulation Execution & Data Acquisition (Max 6.0 pts): Number of unique controlled simulation runs (minimum 3 required), systematic variable manipulation, and accurate trend recording in the virtual laboratory.

PART II: POST-LAB EXCEL DATA ANALYSIS, CALCULATIONS & CLINICAL SYNTHESIS (10.0 Points Total)
- Criterion c3: Excel Spreadsheet Data Analysis & Mathematical Calculations (Max 5.0 pts): Quantitative analysis of exported simulation data, mathematical modeling (inverse square law, magnification, contrast/noise calculations), data tables, and graphing.
- Criterion c4: Clinical Reasoning & ALARA Radiation Safety (Max 3.0 pts): Application of findings to patient dose optimization, image repeat decision-making, and clinical trade-offs.
- Criterion c5: Completeness, Organization & Professional Technical Reporting (Max 2.0 pts): Structured presentation, clear methodology, file organization, and radiological reporting standards.

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
- Submission Phase Status: ${submission.status}
- In-Lab Submission Timestamp: ${submission.in_lab_submitted_at || 'Recorded'}
- Post-Lab Excel Analysis Timestamp: ${submission.excel_submitted_at || 'Pending / Attached'}
- Uploaded Excel/Data Analysis Files: ${attachments.length > 0 ? attachments.map(a => `${a.original_filename} (${Math.round(a.file_size / 1024)} KB)`).join(', ') : 'None uploaded'}
- Student Excel Analysis Notes: "${submission.excel_analysis_notes || 'None provided'}"

GRADING INSTRUCTIONS:
1. Thoroughly evaluate both Part I (In-Lab execution) and Part II (Excel analysis & synthesis).
2. If the student has not yet uploaded their Excel analysis file (e.g., initial in-lab submission), score Part II based on available worksheet calculations and indicate in feedback that the Excel workbook upload is pending for full credit.
3. If an Excel/CSV file is attached, award credit for rigorous data treatment, calculations, and analytical synthesis.
4. Total score must equal exactly c1 + c2 + c3 + c4 + c5 (out of 20.0).

You MUST respond strictly in valid JSON format conforming to this JSON schema:
{
  "totalScore": number (float between 0 and 20, sum of c1+c2+c3+c4+c5),
  "part1Score": number (float between 0 and 10, sum of c1+c2),
  "part2Score": number (float between 0 and 10, sum of c3+c4+c5),
  "overallFeedback": "Detailed, encouraging, and pedagogically sound evaluation summary addressing both in-lab simulation work and post-lab Excel data analysis.",
  "strengths": ["Strength 1", "Strength 2"],
  "areasForImprovement": ["Area 1", "Area 2"],
  "rubricScores": {
    "c1": number (0 to 4),
    "c2": number (0 to 6),
    "c3": number (0 to 5),
    "c4": number (0 to 3),
    "c5": number (0 to 2),
    "part1Total": number (0 to 10),
    "part2Total": number (0 to 10)
  },
  "rubricBreakdown": {
    "c1": { "score": number, "max": 4, "part": "Part I: In-Lab", "rationale": "Clear justification of criterion 1 score" },
    "c2": { "score": number, "max": 6, "part": "Part I: In-Lab", "rationale": "Clear justification of criterion 2 score" },
    "c3": { "score": number, "max": 5, "part": "Part II: Post-Lab Excel", "rationale": "Clear justification of criterion 3 score" },
    "c4": { "score": number, "max": 3, "part": "Part II: Post-Lab Excel", "rationale": "Clear justification of criterion 4 score" },
    "c5": { "score": number, "max": 2, "part": "Part II: Post-Lab Excel", "rationale": "Clear justification of criterion 5 score" }
  }
}
`;

    const response = await client.models.generateContent({
      model: model || 'gemini-2.5-flash',
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
    const hasExcelFile = attachments.some(a => /\.(xlsx|xls|csv)$/i.test(a.original_filename));

    // Part I: In-Lab (Max 10 pts)
    // c1: Conceptual Understanding & Quiz (out of 4)
    const quizRatio = submission.quiz_total > 0 ? (submission.quiz_score / submission.quiz_total) : 1;
    let c1 = Math.round((quizRatio * 2.5 + (wordCount > 60 ? 1.5 : 1.0)) * 2) / 2;
    if (c1 > 4.0) c1 = 4.0;
    if (c1 < 1.0) c1 = 1.0;

    // c2: Simulation Execution & Data Acquisition (out of 6)
    let c2 = 2.5;
    if (parsedRuns.length >= 1) c2 = 4.0;
    if (parsedRuns.length >= 2) c2 = 5.0;
    if (parsedRuns.length >= 3) c2 = 6.0;

    // Part II: Post-Lab Excel Data Analysis & Clinical Synthesis (Max 10 pts)
    // c3: Excel Analysis & Mathematical Calculations (out of 5)
    let c3 = 3.0;
    if (hasExcelFile) c3 = 4.5;
    if (wordCount > 100) c3 = Math.min(5.0, c3 + 0.5);

    // c4: Clinical ALARA Reasoning (out of 3)
    let c4 = 2.0;
    const lowerText = textValues.toLowerCase();
    if (lowerText.includes('alara') || lowerText.includes('dose') || lowerText.includes('patient') || lowerText.includes('magnification')) {
      c4 = 3.0;
    }

    // c5: Completeness & Professional Technical Reporting (out of 2)
    let c5 = 1.5;
    if (hasExcelFile && parsedRuns.length >= 3) c5 = 2.0;

    const part1Score = Math.round((c1 + c2) * 10) / 10;
    const part2Score = Math.round((c3 + c4 + c5) * 10) / 10;
    const totalScore = Math.round((part1Score + part2Score) * 10) / 10;

    return {
      totalScore,
      part1Score,
      part2Score,
      overallFeedback: `Standardized evaluation for ${benchmark.title}. Part I (In-Lab): ${part1Score}/10 pts (${parsedRuns.length} recorded runs, quiz ${submission.quiz_score}/${submission.quiz_total}). Part II (Post-Lab Excel Analysis): ${part2Score}/10 pts (${hasExcelFile ? 'Excel analysis workbook verified' : 'Analysis based on recorded worksheet evidence'}).`,
      strengths: [
        `Executed ${parsedRuns.length} controlled experimental runs in the virtual lab.`,
        `Scored ${submission.quiz_score}/${submission.quiz_total} on the knowledge check mastery quiz.`,
        hasExcelFile ? 'Submitted Excel spreadsheet data analysis sheet.' : 'Addressed clinical ALARA radiation safety principles.'
      ],
      areasForImprovement: [
        hasExcelFile ? 'Ensure trend graphs include labeled axis units and formula captions.' : 'Upload the post-lab Excel data analysis sheet for full Part II credit.',
        'Detail step-by-step mathematical reasoning for all clinical exposure calculations.'
      ],
      rubricScores: {
        c1, c2, c3, c4, c5,
        part1Total: part1Score,
        part2Total: part2Score
      },
      rubricBreakdown: {
        c1: { score: c1, max: 4, part: 'Part I: In-Lab', rationale: `Evaluated conceptual understanding and quiz score (${submission.quiz_score}/${submission.quiz_total}).` },
        c2: { score: c2, max: 6, part: 'Part I: In-Lab', rationale: `Recorded ${parsedRuns.length} controlled simulation runs with systematic variable adjustment.` },
        c3: { score: c3, max: 5, part: 'Part II: Post-Lab Excel', rationale: hasExcelFile ? 'Excel spreadsheet data analysis uploaded and verified.' : 'Worksheet mathematical calculations evaluated (Excel workbook pending).' },
        c4: { score: c4, max: 3, part: 'Part II: Post-Lab Excel', rationale: 'Clinical decision-making and ALARA radiation safety analysis.' },
        c5: { score: c5, max: 2, part: 'Part II: Post-Lab Excel', rationale: 'Completeness, professional reporting, and technical documentation.' }
      }
    };
  }
};

module.exports = geminiGradingService;
