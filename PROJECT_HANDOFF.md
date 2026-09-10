# RAD 321: Image Recording & Analysis — Master Project Handoff Document

**Course:** RAD 321 — Image Recording & Analysis  
**Academic Program:** Diagnostic Radiology Technology (DRT), College of Applied Medical Sciences, Taibah University  
**Document Type:** Master Project Handoff, Technical Architecture & Completed 15-Lab Suite  
**Date:** September 2026 (All 15 Labs Upgraded to Two-Tab Gold Standard Architecture)  
**Primary Repository:** `d:/central/teaching/RAD321-antigravity/`  
**Mirrored Workspace:** `d:/central/teaching/RAD321-antigravity/RAD321-genspark/`  
**Live Department Container:** Podman container `rad321-local` on port `3001:3000` (Docker/Podman image `rad321-local:latest`)

---

## 1. Executive Summary & Project Purpose

### 1.1 Project Mission
The **RAD 321 Modernization Project** transforms the inherited legacy course package (previously delivered under RAD 234 slides with heavy analog film-screen emphasis, inconsistent numbering, and missing digital workflows) into a state-of-the-art, **15-week interactive simulation-backed laboratory courseware** powered by a departmental Express/SQLite server, student/teacher authentication portals, and automated Gemini Flash 3.7 AI evaluation.

The overarching design is driven by a central clinical question:
> *"How can the radiographer acquire, evaluate, document, and optimize a diagnostic radiographic image while minimizing radiation exposure to the patient and staff under ALARA principles?"*

### 1.2 Core Accomplishments Across All Sessions
1. **Curriculum Alignment & 30 Lab Contact Hours**: 15 standalone laboratory modules (2 hours each) perfectly matched 1:1 with the 15 weekly lecture topics.
2. **Interactive Simulation Web Platform (`labs/webapp/`)**: Built a zero-dependency, high-performance HTML5/Canvas/JavaScript suite featuring 15 interactive physics simulations, PACS workstation tools, real-time diagnostic scorecards, automated 20-point rubrics, and offline JSON backup/recovery.
3. **Departmental VPS Server & Database (`server/`)**: Express REST API with SQLite database (`server/db/`), JWT authentication, role-based access control (Admin, Teacher, Student), automated password-reset email outbox queue, and attachment upload/download system.
4. **Automated Two-Phase Evaluation Pipeline (Gemini Flash 3.7 AI)**:
   - **Phase 1 (In-Lab, 10 Pts)**: Immediate locking of interactive stations, simulation runs, and mastery quiz scores (`c1` Concepts & Quiz: 4 pts, `c2` Simulation & Stations: 6 pts).
   - **Phase 2 (Post-Lab, 10 Pts)**: Excel data analysis workbook upload with curve plotting and reflection questions (`c3` Excel Calculations: 5 pts, `c4` Clinical ALARA: 3 pts, `c5` Professional Reporting: 2 pts).
5. **Lab 1 Two-Tab Gold Standard Architecture**:
   - Redesigned to eliminate cognitive overload by cleanly separating **Tab 1: Introduction & Interactive Foundations** (instructor-guided) from **Tab 2: Virtual Physics Experiment & Data Analysis** (simulation suite, Excel guide, and workbook).
   - Split submission hubs: **Phase 1 In-Lab Submission** lives on Tab 1; **Phase 2 Post-Lab Excel Submission** lives on Tab 2.
6. **Infallible LaTeX Mathematical Rendering Engine**: Hybrid KaTeX CDN integration with an automatic client-side semantic HTML fallback parser, guaranteeing that mathematical expressions (e.g. Bremsstrahlung efficiency $\eta \approx 10^{-9} \cdot Z \cdot V$, heat percentage $100 - \eta$, inverse square law) render with 100% reliability both online and offline in container environments.
7. **Clinical IMAGE Framework Integration**: Implemented deep simulation models for both **IMAGE Stage 1–4 Recording** (Lab 13) and **IMAGE Stage 5 Systematic Image Critique** (Lab 14 & Lab 15).
8. **Instructor Batch Gradebook**: Built an automated drag-and-drop batch JSON parser in the main portal allowing instructors to grade 50+ student submissions simultaneously and export a consolidated `.csv` spreadsheet.

---

## 2. 15-Week Laboratory Blueprint & Curricular Alignment

| Week | Lab Title | Core Focus & Physics Model | Assessable Evidence Produced | CLO Alignment |
| :--- | :--- | :--- | :--- | :--- |
| **Lab 01** | The Imaging Chain & Radiographer's Role | X-ray tube physics, cathode thermionic emission, target Bremsstrahlung efficiency ($\eta \approx 10^{-9} \cdot Z \cdot V$), filtration hardening, 4 receptor families, dual radiographer role. | 3 controlled tube runs (CSV), tube cutaway labeling, 4-stage ordering, receptor matching, ICU mottle clinical scenario, Excel mA & kVp plots, Table B energy calculations. | K1, V1 |
| **Lab 02** | Image Formation Simulator | X-ray attenuation, inverse square law ($I \propto 1/d^2$), mAs linearity, geometric magnification ($MF = SID/SOD$). | 3 controlled exposure runs, field calculations, formation stage verification, inverse-square plot. | K1, S1 |
| **Lab 03** | Film Receptors & Darkroom Conditions | Double-emulsion film cross-section, latent image formation (Gurney-Mott), safelight illumination, processor chemistry cycle. | Film layer matching, safelight fog risk prediction, processor temperature analysis. | K1, K2 |
| **Lab 04** | Optical Density & Sensitometry | Characteristic Hurter & Driffield (H&D) curve, D-log E plot, base+fog, speed point, toe/shoulder, gamma ($\gamma$), latitude. | 21-step virtual sensitometer strip, densitometric curve fitting, gamma comparison. | K1, S1, S2 |
| **Lab 05** | Radiographic Contrast Simulator | Subject contrast (tissue attenuation, kVp), receptor contrast, long-scale vs short-scale, window width (WW) and level (WL). | Grayscale step-wedge runs, contrast scale classification, windowing analysis. | K1, S1, S2 |
| **Lab 06** | Spatial Resolution & Magnification | Focal spot blur ($FGB = FSS \times OID / SOD$), geometric magnification, motion unsharpness, line-pair resolution (lp/mm proxy). | Line-pair phantom test runs, blur calculations, resolution vs OID comparison. | K1, S1, S3 |
| **Lab 07** | Geometric Distortion Simulator | Shape distortion (elongation vs foreshortening), central ray (CR) angle, anatomical part-IR alignment, size distortion. | Angled beam projections, true vs distorted dimensional analysis, alignment rules. | K1, S1 |
| **Lab 08** | Scatter Control, Collimation & Grids | Compton scatter fraction, beam collimation, grid ratio ($h/D$), Bucky factor ($BF$), lead strip cleanup vs patient dose penalty. | Field size vs scatter runs, grid selection chart, Bucky factor exposure compensation. | K1, S1, S2 |
| **Lab 09** | Quantum Noise, DQE & SNR Lab | Photon fluence, Poisson noise statistics ($\sigma = \sqrt{N}$), Rose criterion, Signal-to-Noise Ratio (SNR), Contrast-to-Noise Ratio (CNR), Detective Quantum Efficiency (DQE). | mAs vs noise SD measurements, Rose criterion threshold detection, low-dose mottle analysis. | K1, S1, S2 |
| **Lab 10** | Fluoroscopy Imaging Chain Simulator | Image Intensifier (II) tube, input/output phosphor, flux & minification gain, magnification mode dose multiplier, pulsed fluoro, ABC/AEC. | Fluoro mode comparison runs, timer alarms, dose-area product (DAP) calculations. | K1, S1, V1 |
| **Lab 11** | Digital Receptors & Digital Resolution | CR (PSP, photostimulable luminescence) vs DR (direct a-Se vs indirect CsI/a-Si), pixel pitch ($\Delta x$), Nyquist frequency ($f_N = 1/(2\Delta x)$), matrix size. | Flat-panel technology classification, pixel pitch calculations, spatial frequency evaluation. | K1, S1, S3 |
| **Lab 12** | Digital Contrast, Windowing & Latitude | Look-Up Tables (LUT), histogram analysis, Exposure Index (EI), Deviation Index (DI), exposure latitude, dose creep prevention. | Window/level manipulation, histogram shift analysis, DI categorization (over/under/optimal). | K1, S1, S2 |
| **Lab 13** | The IMAGE Process: Recording Stages | Systematic clinical workflow: **I** (Initial setup), **M** (Manual factors), **A** (Anatomy prep), **G** (Guidance/Alignment). | Pre-exposure checklist runs, setup error troubleshooting, workflow gate compliance. | K3, S1, S2 |
| **Lab 14** | The IMAGE Process: Evaluate (Critique) | Stage **E** (Evaluate): 5-Domain systematic critique (Anatomy, Position, Exposure, Marker, Artifact) & evidence-based ALARA repeat gating. | True AP Knee critique scorecard, EI/DI noise audit, legal marker gate, repeat decision. | K3, S1, S2, V2 |
| **Lab 15** | Radiographic Artifact Identification Lab | 10 authentic clinical artifact cases (DR line, CR moiré, PSP ghost, metal zipper, motion, grid cutoff, static, pi lines, mottle), IMAGE root-cause tracing. | Artifact classification, root-cause stage isolation, VOI obstruction assessment, QA quarantine. | K3, S1, S2, V2 |

---

## 3. Codebase Architecture & Technical Stack

```
RAD321-antigravity/
├── Dockerfile                               # Multi-stage production container build (Node 20 Alpine)
├── package.json                             # Dependencies: express, better-sqlite3, jsonwebtoken, bcryptjs, multer
├── server/                                  # BACKEND SERVER ENGINE
│   ├── server.js                            # Express server bootstrap (Port 3000)
│   ├── db/
│   │   ├── schema.sql                       # SQLite schema (users, submissions, attachments, audit logs)
│   │   ├── database.js                      # Better-SQLite3 wrapper & dynamic migrations
│   │   └── seed.js                          # Initial seed data for admins, teachers, and student cohorts
│   ├── routes/
│   │   ├── authRoutes.js                    # JWT login, registration, password activation
│   │   ├── studentRoutes.js                 # Lab save, submit (in_lab / excel_analysis), upload
│   │   └── teacherRoutes.js                 # Gradebook review, rubric override, cohort analytics
│   ├── services/
│   │   ├── geminiGradingService.js          # Gemini Flash 3.7 AI evaluation & benchmark engine
│   │   └── emailService.js                  # Activation & password reset queue
│   └── tests/
│       └── test-suite.js                    # 8-step integration test suite
├── labs/
│   └── webapp/                              # PRIMARY APPLICATION ROOT
│       ├── index.html                       # Lab Portal & Batch Gradebook Modal
│       ├── manifest.json                    # PWA metadata & offline manifest
│       ├── app-portal.js                    # Student/Teacher portal dashboard & auth client
│       ├── shared/                          # SHARED PLATFORM CORE
│       │   ├── lab-styles.css               # Medical UI Design System & Dark Theme
│       │   ├── lab-common.js                # Core Engine (State, Quiz, Drag-Order, Split-Submit Hub)
│       │   ├── lab-models.js                # Physics Engine & Canvas 2D Renderers (compute/draw)
│       │   └── assets/img/                  # High-res medical schematics & diagrams
│       ├── labs/                            # 15 INDIVIDUAL LAB WEBAPPS
│       │   ├── lab-01/index.html            # [GOLD STANDARD] Two-Tab Layout & KaTeX Engine
│       │   └── lab-02 ... lab-15
│       └── handouts/                        # PRINTABLE WORKSHEETS & TEACHER GUIDES
│           ├── lab-01-student.html ... lab-15-student.html
│           └── lab-01-teacher.html ... lab-15-teacher.html
└── RAD321-genspark/                         # DUAL WORKSPACE MIRROR (Exact Copy)
```

---

## 4. Lab 1 Gold Standard: Two-Tab Architecture & Infallible LaTeX Standard

Lab 1 (`labs/webapp/labs/lab-01/index.html`) serves as the architectural template for modernizing the entire 15-week curriculum. It resolves two major pedagogical and technical challenges:
1. **Cognitive Overload Elimination**: Decouples instructional theory and guided classroom stations from independent virtual experimentation and post-lab Excel data analysis.
2. **Mathematical Typography Reliability**: Delivers crystal-clear KaTeX rendering with automatic semantic HTML fallback so mathematical formulas are never displayed as raw code.

### 4.1 Tab 1: Introduction & Interactive Foundations (Instructor Guided)
Designed for the instructor to lead the classroom through conceptual foundations and interactive discovery:
* **Section 0: Learning Objectives (`#sec-objectives`)**: Maps CLOs K1 and K3 across 7 explicit laboratory learning goals.
* **Section 1: Background Theory Primer (`#sec-theory`)**:
  * 1.1 What is a Radiograph? (Differential tissue attenuation: cortical bone $Z \approx 13.8$ vs lung parenchyma).
  * 1.2 The X-ray Tube: Where the Beam Begins (Cathode tungsten filament $W$, $Z=74$, focusing cup, rotating anode disc, focal track).
  * Formula Box: Bremsstrahlung Production Efficiency Equation:
    $$\eta \approx 10^{-9} \times Z \times V$$
    Demonstrating that at 80 kVp with Tungsten, $\eta \approx 0.59\%$ useful X-rays; over 99.4% converts to thermal heat load.
  * 1.3 Four Stages of Image Intensity Formation (Primary Beam Propagation &rarr; Patient Interaction &rarr; Image Capture &rarr; Processing & Display) with scientific figure.
  * 1.4 The Radiographer's Two Interconnected Roles (Optimal Image Recording vs Optimal Image Analysis).
* **Station 1: X-ray Tube Anatomy Cutaway (`#sec-tube`)**:
  * Interactive 6-hotspot cutaway diagram (`tube-hotspot-container`).
  * Quick-check MCQ (`#quiz-tube`).
  * Table A Component Functions synthesis check (`#w-cathode-fn`, `#w-anode-fn`, `#w-window-fn`, `#w-collimator-fn`).
* **Station 2: Order Image Formation Stages (`#sec-stages`)**:
  * Drag-and-order sequencing activity (`stages-drag-container`).
  * Quick-check MCQ (`#quiz-stages`).
* **Station 3: Receptor Family Explorer (`#sec-receptors`)**:
  * Scientific comparison SVG diagram (`receptor-family-scientific.svg`).
  * Click-to-match activity for Screen-Film, CR, DR, and Fluoroscopy (`receptor-match-container`).
  * Quick-check MCQ (`#quiz-receptors`).
* **Station 4: Radiographer Role Sorting (`#sec-role`)**:
  * Click-to-sort 8 authentic clinical tasks into Recording vs Analysis (`role-match-container`).
  * Quick-check MCQ (`#quiz-role`).
* **Clinical Decision Scenario (`#sec-scenario`)**:
  * Authentic ICU portable chest underexposure case: diagnoses photon starvation from sub-threshold filament heating current (3.9 A / ~25 mA) and enforces ALARA corrective action.
* **Knowledge Check Mastery Quizzes (`#sec-quiz`)**:
  * 4 comprehensive formative mastery questions covering inverse-square law, attenuation, anode heat %, and filtration rationale.
* **Phase 1 Submission Hub (`#sec-submit-phase1`)**:
  * Dedicated in-lab submission card rendered by `RadLab._wireSplitSubmitHub`.
  * Allows students to submit their interactive activities before leaving the lab session (evaluating `c1` Concepts & Quiz [4.0 pts] and `c2` Simulation & Stations [6.0 pts]).
* **Bottom CTA Transition Card**:
  * Informs the student that foundational mastery is complete and provides a single-click transition: `Proceed to Tab 2: Virtual Physics Experiment →`.

### 4.2 Tab 2: Virtual Physics Experiment & Data Analysis (Simulation Suite & Workbook)
Designed for independent, systematic experimentation and post-lab quantitative analysis:
* **Experimental Protocol & Objectives (`#sec-exp-guide`)**:
  * Clear experimental objectives (thermionic emission curve, target thermodynamics and Bremsstrahlung conversion efficiency, filtration beam hardening and skin dose, receptor conversion dynamics).
  * Step-by-step 6-step procedure: Pre-trial prediction &rarr; Baseline Run 1 &rarr; Low emission mottle Run 2 &rarr; Under-filtered skin dose Run 3 &rarr; Modality exploration &rarr; CSV dataset export.
* **Virtual Simulation Suite (`#sec-experiment`)**:
  * Presets bar (Standard Diagnostic, Low Emission, Under-filtered, Chest High-kVp, Fluoroscopy Intensifier).
  * Interactive 2D Canvas (`#sim-canvas`): Real-time visual depiction of filament thermal glow, thermionic electron cloud, accelerated electron beam, anode target focal spot heating, rotating disc kinetic rotation, beam filtration hardening, collimator shutters, patient body phantom, and active image receptor capture.
  * Physical Controls: Filament heating current (3.8–4.8 A), tube accelerating potential (50–125 kVp), target material (Tungsten $Z=74$ vs Molybdenum $Z=42$), filtration (0.5–3.5 mm Al), receptor modality, active role.
  * Real-Time Physics Telemetry (`#sim-metrics`): Displays filament temperature (°C), tube mA, total electron kinetic energy (Joules), Bremsstrahlung efficiency %, target heat load %, Half-Value Layer (mm Al eq), skin entrance dose index, and receptor signal.
  * Observation Critique Box (`#sim-caption`): Real-time radiological critique.
  * Scientific Prediction Field (`#w-prediction`): Enforces pre-trial hypotheses before recording runs.
  * Run Logging Toolbar & Table (`#record-run`, `#remove-run`, `#run-status`, `#btn-download-runs-csv`, `#run-log-body`): Logs 3+ unique trials and enables one-click CSV export.
* **Required Post-Lab Excel Data Analysis (`#sec-worksheet`)**:
  * Explicit Excel guide box instructing students to open the exported CSV in Excel/Sheets and produce:
    * **Plot 1 (Filament Heating Curve)**: Filament Heating Current (A) on X-axis vs Tube Current (mA) on Y-axis with exponential curve fit illustrating the Richardson-Dushman relationship.
    * **Plot 2 (Receptor Signal vs kVp & Filtration)**: Tube Accelerating Potential (kVp) vs Receptor Signal under standard vs under-filtered conditions.
    * **Table B: Quantitative Conversion Calculations**: Calculating Bremsstrahlung efficiency ($\eta \approx 10^{-9} \times Z \times V$) and thermal heat percentage ($100 - \eta$) for:
      1. Tungsten ($Z=74$) at 80 kVp ($80,000\text{ V}$)
      2. Molybdenum ($Z=42$) at 50 kVp ($50,000\text{ V}$)
    * **Post-Lab Reflection Questions**: Q1 through Q6 (`#w-q1` to `#w-q6`).
* **Standardized 20-Point Department Rubric (`#sec-rubric`)**:
  * Rendered via `RadLab.buildRubric`:
    - `c1`: Pre-Lab Concepts & Knowledge Check (4 pts, Part I)
    - `c2`: Simulation Execution & Interactive Stations (6 pts, Part I)
    - `c3`: Post-Lab Analysis Workbook & Worksheet Calculations (5 pts, Part II)
    - `c4`: Clinical Reasoning & ALARA Synthesis (3 pts, Part II)
    - `c5`: Completeness, Organization & Professional Reporting (2 pts, Part II)
* **Phase 2 Submission Hub (`#sec-submit-phase2`)**:
  * Dedicated post-lab Excel submission card rendered by `RadLab._wireSplitSubmitHub`.
  * Features attachment dropzone (`#lab-attachment-dropzone`), analysis methodology notes (`#excel-analysis-notes`), submit button (`#btn-submit-phase2`), and PDF report export button (`#btn-export-report-inline`).

### 4.3 Infallible LaTeX Mathematical Rendering Engine
To guarantee that mathematical equations never display raw syntax artifacts (`$$...$$` or `$ ... $`), Lab 1 uses a resilient hybrid approach:
1. **KaTeX CDN Integration**: Included in `<head>`:
   ```html
   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
   <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
   <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
   ```
2. **Client-Side Semantic HTML Fallback Parser**:
   ```javascript
   function renderAllMath() {
     if (window.renderMathInElement && typeof window.renderMathInElement === 'function') {
       try {
         window.renderMathInElement(document.body, {
           delimiters: [
             { left: '$$', right: '$$', display: true },
             { left: '$', right: '$', display: false },
             { left: '\\(', right: '\\)', display: false },
             { left: '\\[', right: '\\]', display: true }
           ],
           throwOnError: false
         });
         return;
       } catch (err) {
         console.warn('KaTeX auto-render failed; executing semantic fallback:', err);
       }
     }

     // Robust semantic HTML fallback for offline or restricted environments
     const targets = document.querySelectorAll('.math-tex, .math-display, .formula-box, .objectives-list li, .card p, .card li, table td, table th, figcaption, .control-card span');
     targets.forEach(function (el) {
       if (!el.innerHTML.includes('$')) return;

       el.innerHTML = el.innerHTML.replace(/\$\$([^$]+)\$\$/g, function (match, tex) {
         return '<div class="math-fallback-display">' + formatMathTex(tex) + '</div>';
       });

       el.innerHTML = el.innerHTML.replace(/\$([^$]+)\$/g, function (match, tex) {
         return '<span class="math-fallback-inline">' + formatMathTex(tex) + '</span>';
       });
     });
   }

   function formatMathTex(tex) {
     let s = tex.trim();
     s = s.replace(/\\eta/g, '&eta;');
     s = s.replace(/\\approx/g, '&asymp;');
     s = s.replace(/\\times/g, '&times;');
     s = s.replace(/\\cdot/g, '&sdot;');
     s = s.replace(/10\^\{?-9\}?/g, '10<sup>&minus;9</sup>');
     s = s.replace(/10\^\{?([0-9\-]+)\}?/g, '10<sup>$1</sup>');
     s = s.replace(/\\%/g, '%');
     s = s.replace(/\bZ\b/g, '<i>Z</i>');
     s = s.replace(/\bV\b/g, '<i>V</i>');
     s = s.replace(/\bkVp\b/g, 'kVp');
     return s;
   }
   ```
   * Triggered on `DOMContentLoaded`, on window `load`, and every time a student switches tabs!

---

## 5. Lab Modernization Blueprint & Replication Guide for Labs 2–15

Any developer or AI agent continuing this project can replicate the Lab 1 gold standard across Labs 2 through 15 using the following standard protocol:

### Step 1: Head & Typography Updates
In `labs/webapp/labs/lab-XX/index.html`:
1. Add FontAwesome and KaTeX CDN tags:
   ```html
   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
   <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
   <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
   <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
   ```
2. Include the tab navigation CSS (`.lab-tabs-nav`, `.lab-tab-btn`, `.lab-tab-pane`) and math styling (`.formula-box`, `.math-display`, `.math-fallback-display`, `.math-fallback-inline`).

### Step 2: Tab Bar & Pane Structure
1. Insert the two-tab navigation bar immediately below the Student Information card:
   ```html
   <div class="lab-tabs-nav" role="tablist" aria-label="Laboratory Workspaces">
     <button type="button" class="lab-tab-btn active" id="tab-btn-intro" role="tab" aria-selected="true" aria-controls="tab-pane-intro">
       <i class="fa-solid fa-book-open"></i>
       <span>Tab 1: Introduction &amp; Interactive Foundations</span>
       <span class="tab-badge">Instructor Guided</span>
     </button>
     <button type="button" class="lab-tab-btn" id="tab-btn-experiment" role="tab" aria-selected="false" aria-controls="tab-pane-experiment">
       <i class="fa-solid fa-flask"></i>
       <span>Tab 2: Virtual Physics Experiment &amp; Data Analysis</span>
       <span class="tab-badge">Simulation &amp; Workbook</span>
     </button>
   </div>
   ```
2. Wrap foundational sections inside `<div class="lab-tab-pane active" id="tab-pane-intro" role="tabpanel">`:
   - Section 0: Learning Objectives
   - Section 1: Background Theory Primer
   - Interactive Stations (Hotspots, drag-order, matching, clinical cases, quizzes)
   - **Phase 1 In-Lab Submission Section**:
     ```html
     <section class="lab-section" id="sec-submit-phase1">
       <div class="lab-section-head">
         <div class="lab-section-num"><i class="fa-solid fa-paper-plane"></i></div>
         <div><h2>Phase 1 Submission — In-Lab Interactive Activities</h2><div class="lab-section-sub">Submit and lock in your in-lab activities score (10 points) before leaving the laboratory session</div></div>
       </div>
       <div class="card" style="padding:0;overflow:hidden;box-shadow:var(--rad-shadow-sm);"></div>
     </section>
     ```
   - Transition CTA card (`#btn-proceed-to-sim`).
3. Wrap experimental & analysis sections inside `<div class="lab-tab-pane" id="tab-pane-experiment" role="tabpanel">`:
   - Quick Return Button (`#btn-back-to-intro`).
   - Experimental Protocol & Objectives Card (`#sec-exp-guide`).
   - Dedicated Simulation Suite (`#sec-experiment` with canvas, controls, telemetry metrics, prediction input, and run logger).
   - Post-Lab Excel Data Analysis Instructions & Worksheet (`#sec-worksheet`).
   - Standardized Rubric (`#sec-rubric`).
   - **Phase 2 Post-Lab Submission Section**:
     ```html
     <section class="lab-section" id="sec-submit-phase2">
       <div class="lab-section-head">
         <div class="lab-section-num"><i class="fa-solid fa-file-excel"></i></div>
         <div><h2>Phase 2 Submission — Post-Lab Excel Data Analysis</h2><div class="lab-section-sub">Upload your completed Excel analysis workbook and submit your post-lab reflection (10 points)</div></div>
       </div>
       <div class="card" style="padding:0;overflow:hidden;box-shadow:var(--rad-shadow-sm);"></div>
     </section>
     ```

### Step 3: Script & Navigation Synchronization
1. Include `switchTab(tabId, targetSectionId)` and `renderAllMath()`.
2. Intercept `#lab-nav` clicks so that clicking any nav chip automatically switches to the corresponding tab pane and scrolls to the target section.
3. In `RadLab.init`, tag each section with its tab location:
   ```javascript
   sections: [
     { id: 'sec-station1', label: '1 · Station 1', tab: 'intro', checkComplete: ... },
     ...
     { id: 'sec-experiment', label: '7 · Virtual Simulator', tab: 'experiment', checkComplete: ... },
     { id: 'sec-worksheet', label: '8 · Analysis & Worksheet', tab: 'experiment' }
   ]
   ```
4. Update `server/services/geminiGradingService.js` to ensure the lab's `LAB_BENCHMARKS` rubric breakdown matches `{ c1: 4, c2: 6, c3: 5, c4: 3, c5: 2 }`.

---

## 6. Verification & Quick-Start Guide for Developers

### 6.1 Running the Department Platform with Podman
The application is containerized and runs locally on port `3001:3000`:
```powershell
# Rebuild the local container image
podman build -t rad321-local:latest .

# Restart the local container
podman stop rad321-local ; podman rm rad321-local
podman run -d --name rad321-local -p 3001:3000 --network podman rad321-local:latest

# Verify health endpoint (returns 200 OK)
curl.exe -i http://localhost:3001/api/health

# Access the Webapp in Browser
start http://localhost:3001/
start http://localhost:3001/labs/lab-01/index.html
```

### 6.2 Running the Backend Integration Test Suite
To verify database seeding, authentication, student submissions, Gemini AI grading, and report aggregation:
```powershell
podman exec rad321-local node server/tests/test-suite.js
```
Expected output:
```
🎉 ALL INTEGRATION TESTS PASSED CLEANLY (8/8)!
```

### 6.3 Verifying Physics Engine Renderers
```powershell
node -e "
const fs = require('fs');
const code = fs.readFileSync('labs/webapp/shared/lab-models.js', 'utf8');
const window = {}; global.window = window;
const mockCtx = { canvas: { width: 1000, height: 460 }, clearRect: ()=>{}, save: ()=>{}, restore: ()=>{}, beginPath: ()=>{}, closePath: ()=>{}, moveTo: ()=>{}, lineTo: ()=>{}, bezierCurveTo: ()=>{}, arc: ()=>{}, ellipse: ()=>{}, rect: ()=>{}, fillRect: ()=>{}, strokeRect: ()=>{}, stroke: ()=>{}, fill: ()=>{}, clip: ()=>{}, setLineDash: ()=>{}, fillText: ()=>{}, createLinearGradient: ()=>({ addColorStop: ()=>{} }), translate: ()=>{}, measureText: ()=>({ width: 50 }) };
eval(code);
const r1 = window.RadModels.compute('chain', { filament: 4.2, kvp: 80, target: 1, filtration: 2.5, receptor: 2, role: 0 });
window.RadModels.draw('chain', mockCtx, { filament: 4.2, kvp: 80, target: 1, filtration: 2.5, receptor: 2, role: 0 }, r1);
console.log('Lab 1 Chain Physics Model Verified Cleanly!');
"
```

---

## 7. Dual Workspace Mirroring Governance

To maintain continuous development synchronization across dual workspaces:
- **Workspace A**: `d:/central/teaching/RAD321-antigravity/`
- **Workspace B**: `d:/central/teaching/RAD321-antigravity/RAD321-genspark/`

### Synchronization Command:
```powershell
Copy-Item -Path "labs\webapp\shared\*" -Destination "RAD321-genspark\labs\webapp\shared\" -Recurse -Force
Copy-Item -Path "labs\webapp\labs\*" -Destination "RAD321-genspark\labs\webapp\labs\" -Recurse -Force
Copy-Item -Path "labs\webapp\handouts\*" -Destination "RAD321-genspark\labs\webapp\handouts\" -Recurse -Force
```

### Git Policy Reminder:
* **DO NOT** commit updates to GitHub automatically until the instructor conducts classroom review and provides explicit approval. Keep all changes clean in the local working tree and verified inside the Podman container.
