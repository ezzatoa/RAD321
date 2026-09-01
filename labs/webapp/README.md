# RAD 321 — Interactive Radiation Protection & Quality Assurance WebApp

> **Department of Diagnostic Radiology Technology**  
> **College of Applied Medical Sciences · Taibah University**

An interactive, responsive single-page web application (SPA) and progressive web app (PWA) hosting 15 virtual physics simulation laboratories, interactive formula scratchpads, student submission portals, teacher grading drawers, and an administrative control panel.

---

## 🌟 Modules & Features

- **15 Virtual Simulation Laboratories**:
  - Lab 01: Characteristic & Bremsstrahlung X-Ray Spectra Analysis
  - Lab 02: Beam Attenuation & Half-Value Layer (HVL) Determination
  - Lab 03: Inverse Square Law & Distance Radiation Protection
  - Lab 04: Tube Potential (kVp) Accuracy & Reproducibility QC
  - Lab 05: Exposure Time Accuracy & Linearity QC
  - Lab 06: Tube Output Linearity (mGy/mAs) & Reproducibility
  - Lab 07: Collimator Alignment & Beam Congruence (Penny Test)
  - Lab 08: Focal Spot Size Measurement (Slit Camera & Star Test Pattern)
  - Lab 09: Radiation Protection Barrier Shielding Design
  - Lab 10: Scatter Radiation Survey & Isodose Mapping
  - Lab 11: Diagnostic Reference Levels (DRLs) & Patient Dose (ESD/KAP)
  - Lab 12: Film-Screen Sensitometry & H&D Curve Analysis
  - Lab 13: Digital Radiography QC (Flat-Field, Uniformity, SNR/CNR, Ghosting)
  - Lab 14: Personnel Dosimetry Monitoring & ALARA Compliance
  - Lab 15: Comprehensive Radiation Safety Audit & Regulatory Compliance

- **Role-Based Modes**:
  - **Student Mode**: Conduct simulations, check formulas, submit laboratory reports, and view feedback.
  - **Teacher Mode**: Section management, submission grading, manual rubric grading, AI grading feedback, and announcement broadcasting.
  - **Admin Mode**: User CRUD, approval queue, SMTP settings, Gemini AI configuration, and outbox logs.

- **Offline & PWA Ready**: Service worker (`sw.js`) and web app manifest (`manifest.json`) for seamless offline laboratory execution.

---

## 📂 Structure

```text
webapp/
├── index.html                  # Single Page Application entrypoint
├── app-portal.js               # Main frontend portal controller & RBAC logic
├── manifest.json               # PWA configuration
├── sw.js                       # Service Worker for offline asset caching
├── handouts/                   # Student & Teacher laboratory handouts (Labs 01 - 15)
├── labs/                       # 15 interactive laboratory simulation engines
│   ├── lab-01/ ... lab-15/
├── shared/                     # Common physics simulation algorithms, math models & themes
│   ├── assets/img/             # High-resolution anatomical & equipment diagrams
│   ├── lab-common.js           # Plotting, calculation, and UI utilities
│   ├── lab-models.js           # Physical & mathematical simulation models
│   └── lab-styles.css          # Medical UI theme and responsive stylesheet
└── static/                     # Legacy stylesheets and shared CSS
```
