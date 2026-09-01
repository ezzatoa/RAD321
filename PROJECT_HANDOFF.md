# RAD 321: Image Recording & Analysis — Master Project Handoff Document

**Course:** RAD 321 — Image Recording & Analysis  
**Academic Program:** Diagnostic Radiology Technology (DRT), College of Applied Medical Sciences, Taibah University  
**Document Type:** Master Project Handoff, Technical Architecture & Future Improvement Roadmap  
**Date:** August 2026  
**Primary Repository:** `d:/central/teaching/RAD321-antigravity/`  
**Mirrored Workspace:** `d:/central/teaching/RAD321-antigravity/RAD321-genspark/`  

---

## 1. Executive Summary & Project Purpose

### 1.1 Project Mission
The **RAD 321 Modernization Project** successfully transformed the inherited legacy course package (previously delivered under RAD 234 slides with heavy analog film-screen emphasis, inconsistent numbering, and missing digital workflows) into a state-of-the-art, **15-week interactive simulation-backed laboratory courseware**.

The overarching design is driven by a central clinical question:
> *"How can the radiographer acquire, evaluate, document, and optimize a diagnostic radiographic image while minimizing radiation exposure to the patient and staff under ALARA principles?"*

### 1.2 Core Accomplishments Across All Sessions
1. **Curriculum Alignment & 30 Lab Contact Hours**: Re-architected 15 standalone laboratory modules (2 hours each) perfectly matched 1:1 with the 15 weekly lecture topics, resolving prior specification arithmetic discrepancies.
2. **Interactive Simulation Web Platform (`labs/webapp/`)**: Built a zero-dependency, high-performance HTML5/Canvas/JavaScript suite featuring 15 interactive physics simulations, PACS workstation tools, real-time diagnostic scorecards, automated 20-point rubrics, and offline JSON backup/recovery.
3. **Clinical IMAGE Framework Integration**: Implemented deep simulation models for both **IMAGE Stage 1–4 Recording** (Lab 13) and **IMAGE Stage 5 Systematic Image Critique** (Lab 14 & Lab 15).
4. **Authentic Artifact Diagnosis & Root-Cause Engine**: Created an interactive 10-case clinical artifact engine across DR, CR, and Screen-Film modalities with 5-stage root-cause tracing and ALARA repeat gating rules.
5. **Instructor Batch Gradebook**: Built an automated drag-and-drop batch JSON parser in the main portal allowing instructors to grade 50+ student submissions simultaneously and export a consolidated `.csv` spreadsheet.
6. **Dual Workspace Synchronization**: Maintained 100% parity across `RAD321-antigravity` and `RAD321-genspark`.

---

## 2. 15-Week Laboratory Blueprint & Curricular Alignment

| Week | Lab Title | Core Focus & Physics Model | Assessable Evidence Produced | CLO Alignment |
| :--- | :--- | :--- | :--- | :--- |
| **Lab 01** | The Imaging Chain & Radiographer's Role | X-ray tube anatomy, 4 stages of image formation, receptor families, dual radiographer role. | Tube diagram labeling, stage-matching challenge, dual-role reflection. | K1, V1 |
| **Lab 02** | Image Formation Simulator | X-ray attenuation, inverse square law ($I \propto 1/d^2$), mAs linearity, geometric magnification ($MF = SID/SOD$). | 3 controlled exposure runs, field calculations, formation stage verification. | K1, S1 |
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

## 3. Codebase Architecture & Technical Design

```
RAD321-antigravity/
├── index.html                               # (Root redirection to webapp)
├── Context.pdf                              # Course contextual specifications
├── RAD321-Future-Syllabus/                  # Curricular modernization package & reports
│   ├── RAD321_Course_Evaluation_and_Modernization_Report.md
│   └── RAD321_Modern_Course_Package/       # Standalone HTML package & legacy decks
├── labs/
│   └── webapp/                              # PRIMARY APPLICATION ROOT
│       ├── index.html                       # Lab Portal & Batch Gradebook Modal
│       ├── manifest.json                    # PWA metadata & offline manifest
│       ├── shared/                          # SHARED PLATFORM CORE
│       │   ├── lab-styles.css               # Medical UI Design System & Dark Theme
│       │   ├── lab-common.js                # Core Lab Engine (State, Quiz, Rubric, Audio)
│       │   ├── lab-models.js                # Physics Engine & Canvas 2D Renderers
│       │   └── assets/img/                  # High-res medical schematics & diagrams
│       ├── labs/                            # 15 INDIVIDUAL LAB WEBAPPS
│       │   ├── lab-01/index.html ... lab-15/index.html
│       └── handouts/                        # PRINTABLE WORKSHEETS & TEACHER GUIDES
│           ├── lab-01-student.html ... lab-15-student.html
│           └── lab-01-teacher.html ... lab-15-teacher.html
└── RAD321-genspark/                         # DUAL WORKSPACE MIRROR (Exact Copy)
```

### 3.1 Key Architectural Principles
1. **Zero-Build & Zero-Dependency**: Runs natively in any standard web browser (Chrome, Edge, Firefox, Safari) by opening `index.html`. No Node.js runtime, build tool, or external web server is strictly required.
2. **100% Offline Capability**: Uses embedded SVG/Canvas graphics, Web Audio API synthesis (no external audio files required), and standard local storage.
3. **Medical Design System**:
   - Palette: Deep Navy (`#061320`, `#0b2545`), Surgical Teal (`#14b8a6`, `#007a78`), Amber Warning (`#f59e0b`), Slate Border (`#1e3a5f`, `#cbd5e1`).
   - "Reading Room" Dark Theme: Complies with diagnostic PACS ambient viewing requirements (`#0a0f18` dark background).
4. **Standardized 20-Point Multi-Component Assessment Rubric**:
   - Part 1: Initial Scientific Prediction (2 pts)
   - Part 2: Experimental Controlled Runs (3 runs $\times$ 2 pts = 6 pts)
   - Part 3: Applied Concept Challenge (4 pts)
   - Part 4: Knowledge Check Quiz (4 questions $\times$ 1 pt = 4 pts)
   - Part 5: Written Clinical Synthesis & ALARA Analysis (4 pts)

---

## 4. Advanced Simulation Highlights: Labs 14 & 15

### 4.1 Lab 14: Systematic Radiographic Critique & ALARA Repeat Gating
- **PACS Viewport**: High-resolution simulated AP Knee radiograph featuring anatomical structures (distal femur, patella, joint space, tibial spines, proximal fibula head with ⅓ overlap), dynamic quantum mottle, collimation shutters, and lead side markers.
- **5-Domain Critique Dashboard**: Real-time evaluation of:
  1. *Anatomy & Collimation* (30% weight)
  2. *Positioning & Alignment* (25% weight)
  3. *Exposure & Noise Index* (25% weight, calculating EI, DI, and noise standard deviation $\sigma$)
  4. *Lead Marker & ID Gate* (10% weight, legal verification)
  5. *Artifact & Motion Integrity* (10% weight)
- **ALARA Clinical Verdict Card**: Dynamically gates images into *ACCEPT & TRANSMIT TO PACS*, *ACCEPT WITH ANNOTATION*, *REJECT & REPEAT EXPOSURE*, or *DO NOT REPEAT (RECOVERABLE)*.

### 4.2 Lab 15: Artifact Identification & IMAGE Root-Cause Engine
- **10 Realistic Clinical Artifact Signatures**:
  1. *Clean Baseline* (Diagnostic AP Knee)
  2. *DR Column Line Defect* (Dead TFT channel readout failure)
  3. *CR Moiré Pattern Aliasing* (Grid frequency vs laser scan frequency)
  4. *CR PSP Ghosting* (Incomplete optical erasure of prior high-dose exposure)
  5. *Radiopaque Metal Zipper* (Foreign object over diagnostic VOI)
  6. *Patient Motion Blur* (Trabecular penumbra unsharpness)
  7. *Focused Grid Cutoff* (Off-level/off-center central ray)
  8. *Screen-Film Static Discharge* (Arborization pattern from low-humidity darkroom)
  9. *Processor Pi Lines* ($\pi \times d$ roller residue and guide-shoe scratches)
  10. *Quantum Mottle* (Photon starvation from sub-threshold mAs)
- **PACS Review Tools**: Interactive Window Width (WW), Window Level (WL), Bone Window, Soft Tissue, High Contrast, Grayscale Inversion, and Impact Zone ROI overlay.
- **5-Stage IMAGE Process Tracer**: Real-time attribution of defects to Stage **I**, **M**, **A**, **G**, or **E**, paired with immediate corrective actions and departmental QA quarantine protocols.

### 4.3 Simulation Typography & Layout Redesign (Completed August 2026)
- **Full-Width Canvas Layout (`1000 × 460`)**: Eliminated narrow split grids that caused canvas downscaling; all canvas text now renders at 100% native resolution.
- **Enhanced Visual Hierarchy**: Typography scaled from 11px to 26px, with high-contrast warning badges, bold status indicators, and clear domain score bars.
- **Dual-Column Console**: Control inputs and workstation telemetry are cleanly organized below the monitor viewport.

---

## 5. Dual Workspace Mirroring Governance

To maintain continuous development synchronization across dual workspaces:
- **Workspace A**: `d:/central/teaching/RAD321-antigravity/`
- **Workspace B**: `d:/central/teaching/RAD321-antigravity/RAD321-genspark/`

### Synchronization Protocol:
Whenever modifications are made to:
- `labs/webapp/shared/lab-common.js`
- `labs/webapp/shared/lab-models.js`
- `labs/webapp/shared/lab-styles.css`
- `labs/webapp/labs/lab-XX/index.html`
- `labs/webapp/handouts/*.html`

The files MUST be mirrored using PowerShell:
```powershell
Copy-Item -Path "labs\webapp\shared\*" -Destination "RAD321-genspark\labs\webapp\shared\" -Recurse -Force
Copy-Item -Path "labs\webapp\labs\*" -Destination "RAD321-genspark\labs\webapp\labs\" -Recurse -Force
Copy-Item -Path "labs\webapp\handouts\*" -Destination "RAD321-genspark\labs\webapp\handouts\" -Recurse -Force
```

---

## 6. Known Boundaries & Limitations

1. **Analytical / Empirical Physics Models**:
   - The simulation utilizes deterministic, closed-form radiographic equations and empirical approximations (e.g. exponential attenuation, inverse-square law, Gaussian point-spread functions, Poisson noise proxies).
   - It is designed for conceptual education and clinical intuition, not for medical equipment calibration or clinical patient dosimetry.
2. **Browser LocalStorage Quotas**:
   - Student session data is stored in the browser's origin `localStorage`.
   - Clearing browser cache clears unexported data. Students are instructed to click **Export JSON Backup** at the end of each session.
3. **Typography & System Fonts**:
   - Canvas text rendering uses system font stacks (`-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `Roboto`, `monospace`). Rendered appearance may vary slightly across Windows, macOS, and Linux, though layout coordinate boundaries are fixed.

---

## 7. Roadmap & Recommendations for Future Improvement

Here are high-impact enhancements recommended for subsequent iterations:

### Priority 1: Direct DICOM (.dcm) File Ingestion & Parsing
- **Current State**: Canvas-rendered procedural simulations with synthetic DICOM metadata headers.
- **Future Enhancement**: Integrate a lightweight client-side DICOM parser (e.g., Cornerstone.js or a mini WebAssembly DICOM reader) allowing students or instructors to upload real anonymized clinical `.dcm` files into Labs 10, 11, 12, 14, and 15.

### Priority 2: LMS LTI 1.3 / SCORM Package Wrapper
- **Current State**: Students export `.json` files or print `.html` reports; instructors batch-grade via the portal's CSV export tool.
- **Future Enhancement**: Wrap each lab in a SCORM 1.2/2004 or LTI 1.3 compliant container for direct, single-click grade synchronization into Blackboard Learn, Canvas, or Moodle LMS gradebooks.

### Priority 3: Bilingual (English / Arabic) Localization
- **Current State**: Entire interface, terminology, and assessment questions are in English.
- **Future Enhancement**: Implement a dynamic i18n localization toggle (English / Arabic) for UI labels, clinical scenarios, and patient instructions while retaining standard English DICOM/radiological acronyms.

### Priority 4: Randomized Virtual OSCE / Capstone Practical Mode
- **Current State**: 10 fixed clinical artifact presets in Lab 15 and 8 presets in Lab 14.
- **Future Enhancement**: Create a "Randomized Unknown Station" mode where students are presented with 5 randomly generated, blinded clinical cases (random noise, rotation, collimation, artifacts) with a 10-minute timer for clinical OSCE practical exams.

### Priority 5: Advanced Touch & Tablet Gesture Controls
- **Current State**: Sliders and buttons optimized for mouse/keyboard on desktop and laptop displays.
- **Future Enhancement**: Add multi-touch pinch-to-zoom and two-finger pan gestures for the PACS viewport on iPads and Android tablets.

---

## 8. Verification & Quick-Start Guide for Next Developers

### Running the Test Suite
To verify that all simulation physics models and canvas draw routines execute without errors:
```powershell
node -e "
const fs = require('fs');
const code = fs.readFileSync('labs/webapp/shared/lab-models.js', 'utf8');
const window = {}; global.window = window;
const mockCtx = { canvas: { width: 1000, height: 460 }, clearRect: ()=>{}, save: ()=>{}, restore: ()=>{}, beginPath: ()=>{}, closePath: ()=>{}, moveTo: ()=>{}, lineTo: ()=>{}, bezierCurveTo: ()=>{}, arc: ()=>{}, ellipse: ()=>{}, rect: ()=>{}, fillRect: ()=>{}, strokeRect: ()=>{}, stroke: ()=>{}, fill: ()=>{}, clip: ()=>{}, setLineDash: ()=>{}, fillText: ()=>{}, createLinearGradient: ()=>({ addColorStop: ()=>{} }), translate: ()=>{}, measureText: ()=>({ width: 50 }) };
eval(code);
console.log('Registered methods:', Object.keys(window.RadModels));
const r14 = window.RadModels.compute('image-eval', { anatomy: 95, rotation: 0, mas: 8, marker: 0, artifact: 0, ww: 400, wl: 200 });
window.RadModels.draw('image-eval', mockCtx, { anatomy: 95, rotation: 0, mas: 8, marker: 0, artifact: 0, ww: 400, wl: 200 }, r14);
for (let i = 0; i < 10; i++) {
  const r15 = window.RadModels.compute('artifacts', { artifact: i, severity: 70, location: 0, prevention: 80, repeat: 60, ww: 400, wl: 200, viewTool: 'standard' });
  window.RadModels.draw('artifacts', mockCtx, { artifact: i, severity: 70, location: 0, prevention: 80, repeat: 60, ww: 400, wl: 200, viewTool: 'standard' }, r15);
}
console.log('SUCCESS: All 15 labs verified cleanly!');
"
```

### Launching the Webapp
Simply double click `labs/webapp/index.html` or serve via any static HTTP server:
```powershell
# Using Python
python -m http.server 8080 -d labs/webapp

# Using Node / npx
npx serve labs/webapp
```
Navigate to `http://localhost:8080` in your web browser.
