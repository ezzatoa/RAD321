# RAD 321: Radiation Protection & Quality Assurance Courseware

> **Department of Diagnostic Radiology Technology**  
> **College of Applied Medical Sciences · Taibah University**

A high-fidelity, interactive, three-tier web application and simulation laboratory suite designed for local department VPS deployment.

---

## 🌟 Key Features

### 1. Three Role-Based Access Modes
- **Student Mode (`student`)**:
  - Interactive digital simulation suites for all 15 course laboratories.
  - In-browser physics controls (kVp, mAs, SID, beam filtering, geometry, collimation).
  - Formula check scratchpads, CSV/dataset export, real-time live data plots.
  - Final laboratory report submission portal with multi-file attachment uploads (PDF, DOCX, XLSX, images).
  - Progress dashboard and individualized grading history with feedback.
- **Teacher Mode (`teacher`)**:
  - Section-based cohort management (Male Section 1, Female Section 2, etc.).
  - Submission inspector with manual rubric scoring and **Gemini AI automated grading**.
  - Section-wide announcement broadcasting with optional automated email delivery.
  - Real-time student progress tracking and CSV report export.
- **Admin Mode (`admin`)**:
  - Self-registration approval queue with 1-click token activation.
  - Complete User Directory management (Create, Edit profile/status/role/section/password, and Cascade Delete).
  - Live Gemini AI and SMTP configuration with built-in test utilities.
  - Offline-resilient Outbox Email Queue and comprehensive Audit Logging.

### 2. 15 Interactive Laboratory Modules
1. **Lab 01**: Characteristic & Bremsstrahlung X-Ray Spectra Analysis
2. **Lab 02**: Beam Attenuation & Half-Value Layer (HVL) Determination
3. **Lab 03**: Inverse Square Law & Distance Radiation Protection
4. **Lab 04**: Tube Potential (kVp) Accuracy & Reproducibility QC
5. **Lab 05**: Exposure Time Accuracy & Linearity QC
6. **Lab 06**: Tube Output Linearity (mGy/mAs) & Reproducibility
7. **Lab 07**: Collimator Alignment & Beam Congruence (Penny Test)
8. **Lab 08**: Focal Spot Size Measurement (Slit Camera & Star Test Pattern)
9. **Lab 09**: Radiation Protection Barrier Shielding Design
10. **Lab 10**: Scatter Radiation Survey & Isodose Mapping
11. **Lab 11**: Diagnostic Reference Levels (DRLs) & Patient Dose (ESD/KAP)
12. **Lab 12**: Film-Screen Sensitometry & H&D Curve Analysis
13. **Lab 13**: Digital Radiography QC (Flat-Field, Uniformity, SNR/CNR, Ghosting)
14. **Lab 14**: Personnel Dosimetry Monitoring & ALARA Compliance
15. **Lab 15**: Comprehensive Radiation Safety Audit & Regulatory Compliance

---

## 🚀 Getting Started & Local VPS Deployment

### Prerequisites
- **Node.js** v18+ (tested on Node v20/v24)
- **npm** v9+

### Installation & Launch

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd RAD321-antigravity
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Initialize the SQLite Database & Seed Data**:
   ```bash
   node server/db/seed.js
   ```

4. **Start the Web Application Server**:
   ```bash
   npm start
   ```
   *The application will be accessible at: `http://localhost:8080`*

---

## 🔐 Default Administrative Credentials

| Role | Email | Password |
| :--- | :--- | :--- |
| **Administrator** | `ezzatoa@gmail.com` | `Admin@123456` |
| **Teacher (Male Cohort)** | `teacher.male@taibahu.edu.sa` | `Teacher@123456` |
| **Teacher (Female Cohort)** | `teacher.female@taibahu.edu.sa` | `Teacher@123456` |
| **Student** | `student.male@student.taibahu.edu.sa` | `Student@123456` |

---

## 📁 Repository Structure

```text
RAD321/
├── labs/
│   ├── lab01/ ... lab15/       # 15 interactive physics simulation labs
│   └── webapp/                 # Unified 3-tier SPA portal (Student, Teacher, Admin)
├── server/
│   ├── db/                     # SQLite schema and seeding scripts
│   ├── middleware/             # JWT auth and RBAC authorization
│   ├── routes/                 # Auth, Student, Teacher, Admin, and Lab APIs
│   ├── services/               # Gemini AI Grading, Email/Outbox, Report Generator
│   ├── uploads/                # Student submission file attachments
│   └── server.js               # Express application entrypoint
├── references/                 # Academic references, NCRP/IAEA/Aapm QA standards
├── package.json
└── README.md
```

---

## 📄 License & Course Attribution
Developed for the **Department of Diagnostic Radiology Technology**, College of Applied Medical Sciences, Taibah University.
