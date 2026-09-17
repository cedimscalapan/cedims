# Smart E-VISION / CEDIMS — Complete User Manual
**Calapan East District Instructional Monitoring System**
*Version 2.0 — July 2026*

---

## Table of Contents
1. [System Overview](#1-system-overview)
2. [Getting Started](#2-getting-started)
3. [User Roles & Permissions](#3-user-roles--permissions)
4. [Teacher Guide](#4-teacher-guide)
5. [Master Teacher Guide](#5-master-teacher-guide)
6. [School Head Guide](#6-school-head-guide)
7. [District Supervisor Guide](#7-district-supervisor-guide)
8. [Document Upload Pipeline](#8-document-upload-pipeline)
9. [AI Document Processing (OCR)](#9-ai-document-processing-ocr)
10. [QR Code Verification System](#10-qr-code-verification-system)
11. [Review & Feedback System](#11-review--feedback-system)
12. [Offline Mode](#12-offline-mode)
13. [Chatbot Assistant](#13-chatbot-assistant)
14. [Voice Guide](#14-voice-guide)
15. [Dashboard & Analytics](#15-dashboard--analytics)
16. [Academic Calendar & Deadlines](#16-academic-calendar--deadlines)
17. [Archive & Document Management](#17-archive--document-management)
18. [Settings & Preferences](#18-settings--preferences)
19. [Notifications System](#19-notifications-system)
20. [Admin Panel](#20-admin-panel)
21. [Troubleshooting & FAQ](#21-troubleshooting--faq)

---

## 1. System Overview

### What is Smart E-VISION?
Smart E-VISION (CEDIMS — Calapan East District Instructional Monitoring System) is a **web-based document management and compliance monitoring platform** designed for the Department of Education (DepEd) in the Philippines. It enables teachers to submit instructional documents (DLL, ISP, ISR), reviewers to provide feedback, and administrators to monitor compliance across schools and districts.

### Key Capabilities
- **AI-Powered Document Processing**: Automatic OCR extraction of metadata (week number, subject, grade, teacher name, school) from uploaded documents
- **Offline-First Architecture**: Continue working without internet; automatic sync when connection is restored
- **QR Code Verification**: Every submitted document receives a tamper-proof QR code for instant authenticity verification
- **Real-Time Compliance Monitoring**: Heatmaps, charts, and color-coded compliance tracking
- **Role-Based Access**: Four distinct user roles with granular permissions
- **Progressive Web App (PWA)**: Installable on desktop and mobile devices for native-like experience

### Technology Stack
- **Frontend**: SvelteKit 5 (SPA mode), TailwindCSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage, Realtime subscriptions)
- **Storage**: Backblaze B2 (S3-compatible object storage)
- **Client-Side AI**: Tesseract.js (OCR), custom char-n-gram classifiers
- **Offline Storage**: IndexedDB (via idb-keyval library)

---

## 2. Getting Started

### 2.1 Accessing the System
1. Open a modern web browser (Chrome, Edge, Firefox, or Safari)
2. Navigate to the Smart E-VISION URL provided by your administrator
3. The system will load as a **Progressive Web App (PWA)**
4. You will be prompted to **install the app** for offline access — recommended for regular use

### 2.2 Logging In
1. Click the **Sign In** button on the welcome screen
2. Enter your **DepEd email address** (yourname@deped.gov.ph)
3. Enter your **password** (provided by your system administrator)
4. Click **Sign In**
5. Upon successful login, you will be redirected to your **role-specific dashboard**

### 2.3 First-Time Login
- If this is your first login, use the temporary password provided by your administrator
- You will be prompted to **change your password** immediately
- Set a strong password (minimum 8 characters, including letters and numbers)

### 2.4 Password Reset
1. On the login screen, click **Forgot Password?**
2. Enter your registered email address
3. Check your inbox for a password reset link (check spam folder if not visible)
4. Click the link and enter your new password

### 2.5 Installing as an App (PWA)
**Desktop:**
- Chrome/Edge: Click the install icon (+) in the address bar
- Follow the prompts to install

**Mobile:**
- Android Chrome: Tap the menu (three dots) → "Add to Home screen"
- iOS Safari: Tap the Share button → "Add to Home Screen"

---

## 3. User Roles & Permissions

| Feature | Teacher | Master Teacher | School Head | District Supervisor |
|---------|---------|---------------|-------------|---------------------|
| Upload DLL | ✓ | ✓ | ✗ | ✗ |
| Upload ISP | ✗ | ✓ | ✓ | ✗ |
| Upload ISR | ✗ | ✓ | ✓ | ✗ |
| Archive Own Docs | ✓ | ✓ | ✓ | ✗ |
| Review Documents | ✗ | ✓ | ✓ | ✓ |
| School Dashboard | Own Only | Own School | Own School | All Schools |
| District Dashboard | ✗ | ✗ | ✗ | ✓ |
| Manage Calendar | ✗ | ✗ | ✗ | ✓ |
| Generate Reports | ✗ | ✗ | Own School | District-wide |
| Admin Panel | ✗ | ✗ | ✗ | Limited |

### 3.1 Document Type Definitions
- **DLL (Daily Lesson Log)**: Daily instructional plan submitted weekly by Teachers
- **ISP (Individual School Plan/Program)**: School-level instructional plans submitted by Master Teachers and School Heads
- **ISR (Individual School Report)**: School performance reports submitted by Master Teachers and School Heads

### 3.2 Academic Calendar Structure
- **3 Terms** per school year
- **10 weeks** per term
- Submissions are tracked per **week** within each term
- Deadlines are set by District Supervisors through the Calendar

---

## 4. Teacher Guide

### 4.1 Teacher Dashboard
After logging in, you will see your **personal dashboard** showing:

**Summary Cards (Top Row):**
- **Total Submissions**: Number of documents you have uploaded this term
- **Pending Reviews**: Documents awaiting feedback from Master Teachers
- **Compliance Rate**: Percentage of on-time submissions (color-coded)
- **Approved Documents**: Count of documents that passed review

**Recent Activity (Middle Section):**
- Chronological list of your recent uploads with status
- Quick links to view or download each document

**Compliance Calendar (Bottom Section):**
- Monthly heatmap showing submission status per week
- Green = Submitted on time
- Yellow = Submitted late
- Red = Missing
- Gray = Future weeks (not yet due)

### 4.2 Uploading a Document

#### Step-by-Step Upload Process
1. Navigate to **Upload** from the sidebar or click **Upload Document** on your dashboard
2. **Select Teaching Load**: Choose your subject and grade level from your assigned teaching loads
3. **Select Document Type**: Choose DLL, ISP, or ISR (note: Teachers can only upload DLLs)
4. **Select Week Number**: Choose the academic week this document applies to
5. **Choose File**: Click to browse or drag-and-drop your document
   - Supported formats: **PDF, DOC, DOCX**
   - Maximum file size: **20 MB**
6. **AI Pre-Processing** (automatic):
   - The system reads your document and extracts metadata using OCR
   - Reviews extracted data: Week Number, Subject, Grade Level, Teacher Name, School
   - You can **edit any field** if the AI misread it
7. Click **Start Upload Pipeline** to begin processing

#### Upload Progress
The pipeline processes your document in 6 phases:
1. **Transcoding** — DOC/DOCX files are converted to PDF
2. **Compression** — File size is optimized (target: ~300 KB)
3. **OCR Analysis** — Document is scanned for metadata extraction
4. **Hashing** — A unique SHA-256 fingerprint is created
5. **QR Stamping** — A verification QR code is embedded on the last page
6. **Uploading** — Final PDF is uploaded to secure storage

Each phase shows real-time progress. Do not close the browser during upload.

### 4.3 My Archive
1. Navigate to **Archive** in the sidebar
2. View your documents organized in a **folder structure**: Year → Term → Week
3. Each document shows:
   - Filename
   - Document type (DLL/ISP/ISR)
   - Upload date
   - Review status (Pending/Approved/Needs Revision)
   - QR verification status
4. **Actions**:
   - **View**: Open the document in browser
   - **Download**: Save a verified copy with QR stamp
   - **Delete**: Remove document (only if not yet reviewed)

### 4.4 Review Feedback
1. When a Master Teacher reviews your document, you receive a notification
2. Navigate to the document in your Archive
3. Click **View Review** to see feedback
4. If status is **Needs Revision**:
   - Read the reviewer's comments
   - Make necessary corrections to your document
   - Re-upload the revised version
   - The revision will be linked to the original for tracking

### 4.5 Document Status Types
| Status | Meaning |
|--------|---------|
| **Pending** | Uploaded, waiting for review |
| **Under Review** | A Master Teacher is currently evaluating |
| **Approved** | Document passed review |
| **Needs Revision** | Changes requested by reviewer |
| **Archived** | Final approved version stored long-term |

---

## 5. Master Teacher Guide

### 5.1 Master Teacher Dashboard
Your dashboard provides **school-level oversight**:

- **School Summary**: Compliance rate for your entire school
- **Pending Reviews**: Documents awaiting your review
- **Teacher Performance**: Individual teacher submission rates
- **Weekly Compliance**: Heatmap showing which teachers have submitted for each week

### 5.2 Reviewing Documents
1. Navigate to **Review** in the sidebar
2. You will see a list of documents pending review (sorted by urgency)
3. Click any document to open the **Review Interface**:

**Review Interface Features:**
- **Document Viewer**: Side-by-side document preview with annotation tools
- **Metadata Panel**: Shows AI-extracted data (Week, Subject, Grade, Teacher, School)
- **Compliance Checklist**:
  - Correct document type for the selected week
  - Proper format and structure
  - Complete information
  - Correct subject and grade level
- **Feedback Box**: Type your comments and suggestions
- **Decision Buttons**:
  - **Approve**: Document passes review
  - **Request Revision**: Document needs changes (teacher is notified)
- **Annotate PDF**: Draw bounding boxes, highlight text, add sticky notes directly on the document

### 5.3 Document Annotations
1. While reviewing, click **Annotate** to enable annotation mode
2. Use the toolbar to:
   - **Highlight**: Select text to highlight
   - **Rectangle**: Draw attention to a specific area
   - **Text Note**: Add a sticky note with your comment
   - **Signature**: Add your digital signature
3. Annotations are saved and shared with the teacher
4. Teachers can view annotations but cannot modify them

### 5.4 School Analytics
Navigate to **Analytics** in the sidebar to view:
- **Submission Trends**: Bar charts showing submission volume per week
- **Compliance Rate**: Percentage of on-time submissions per teacher
- **Document Quality**: Breakdown of approved vs. revised documents
- **Performance Insights**: AI-generated suggestions for improving compliance

---

## 6. School Head Guide

### 6.1 School Head Dashboard
Your dashboard focuses on **school-wide management**:

- **Overall Compliance**: School-wide submission rate with color indicator
- **Teacher Roster**: List of all teachers with their individual compliance scores
- **Upcoming Deadlines**: Calendar of submission due dates
- **Recent Reviews**: Summary of recent review outcomes

### 6.2 Monitoring Teachers
1. Navigate to **Monitoring** → **School View**
2. View a **Teacher Compliance Matrix**:
   - Rows: Teacher names
   - Columns: Academic weeks
   - Cells: Color-coded status (green/yellow/red/gray)
3. Click any cell to see details about that teacher's submission for that week
4. **Export** the compliance matrix as PDF or CSV for reporting

### 6.3 Compliance Reports
1. Navigate to **Analytics**
2. Select the **Term** and **Week** range
3. Click **Generate Report**
4. Options:
   - **PDF Report**: Formatted document with charts and summaries
   - **CSV Export**: Raw data for spreadsheet analysis
5. Reports include:
   - School name and reporting period
   - Teacher-by-teacher submission status
   - Overall compliance percentage
   - Missing document summary

### 6.4 Teacher Management
1. Navigate to **Teachers** section
2. View all teachers assigned to your school
3. Actions:
   - **View Profile**: See teacher details and submission history
   - **Contact**: Send in-app notification to a teacher
   - **Assign Teaching Load**: Set subject and grade assignments

---

## 7. District Supervisor Guide

### 7.1 District Supervisor Dashboard
Your dashboard provides **district-wide visibility**:

- **District Compliance**: Aggregate compliance across all schools
- **School Rankings**: Schools sorted by compliance rate
- **District Heatmap**: Color-coded map of school performance
- **System-wide Stats**: Total users, documents, reviews

### 7.2 District Monitoring
1. Navigate to **Monitoring** → **District View**
2. View a **School Compliance Matrix**:
   - Rows: School names
   - Columns: Teachers (grouped by school)
   - Expand any school to see individual teacher compliance
3. **Filter by**: School, Term, Week, Document Type
4. **Download**: Export district-wide reports

### 7.3 Managing the Academic Calendar
1. Navigate to **Calendar** in the sidebar
2. View the current **Term calendar** with weeks and deadlines
3. **Set Deadlines**:
   - Click on any week to edit its deadline date
   - Set different deadlines for DLL, ISP, and ISR
   - Set grace periods (late submission windows)
4. **Manage Terms**:
   - Create new terms (Term 1, 2, 3)
   - Set term start and end dates
   - Activate/deactivate terms
5. **Bulk Set**: Apply the same deadline pattern to all schools or selected schools

### 7.4 Generating Official Reports
1. Navigate to **Analytics** → **Reports**
2. Select report type:
   - **District Compliance Report**: All schools summary
   - **Per-School Report**: Detailed report for one school
   - **Comparative Report**: Side-by-side school comparison
3. Configure:
   - Time period (Term, specific weeks, or custom range)
   - Schools to include
   - Document types
4. Click **Generate** to produce PDF
5. Reports are **hash-chained** for audit integrity

### 7.5 QR Verification (Mobile)
1. Open the installed PWA on your mobile device
2. Navigate to **Verify** in the sidebar
3. Point your camera at a **printed document's QR code**
4. The system will:
   - Scan the QR code
   - Look up the document's SHA-256 hash
   - Display verification result: **Authentic** or **Tampered**
   - Show document metadata (upload date, teacher, subject, week)
   - Show review status and reviewer notes
5. You can also **manually enter a verification code**

---

## 8. Document Upload Pipeline

The upload pipeline is the core of Smart E-VISION. It processes every document through 6 sequential phases:

### Phase 1: Transcoding
- **Input**: DOC/DOCX file
- **Process**: Converts to PDF format
- **Method**: Server-side conversion (via API proxy); falls back to Google Apps Script if server is unavailable
- **Output**: PDF file
- **Duration**: ~3-10 seconds depending on file size

### Phase 2: Compression
- **Input**: PDF (original or transcoded)
- **Process**: Compresses images within the PDF to reduce file size
- **Target**: ~300 KB final size
- **Method**: Browser-based image compression (client-side, no server load)
- **Duration**: ~2-15 seconds

### Phase 3: OCR Analysis
- **Input**: Compressed PDF
- **Process**: Extracts text content using Tesseract.js (runs entirely in your browser)
- **Extracted Fields**:
  - Document Type (DLL/ISP/ISR)
  - Week Number
  - Subject
  - Grade Level
  - Teacher Name
  - School Name
  - Date
- **Confidence Score**: The system shows how confident it is about each extracted field
- **Duration**: ~5-30 seconds depending on document length and complexity

### Phase 4: Hashing
- **Input**: The final document content
- **Process**: Computes a SHA-256 cryptographic hash
- **Purpose**: Creates a unique fingerprint. Any change to the document will produce a different hash, ensuring tamper detection
- **Duration**: <1 second

### Phase 5: QR Stamp
- **Input**: Original PDF + SHA-256 hash
- **Process**: Generates a QR code containing the verification URL ('/verify/{hash}')
- **Placement**: Last page of the PDF, bottom-right corner
- **Output**: QR-stamped PDF
- **Duration**: ~1-3 seconds

### Phase 6: Upload
- **Input**: QR-stamped PDF
- **Process**: Uploads to Backblaze B2 storage via Supabase Storage
- **Records**: Creates a submission record in the database with all metadata
- **Duration**: ~3-30 seconds depending on file size and connection speed

### Hybrid Upload Mode
If the internet connection is unstable:
- The system automatically detects connection quality during upload
- If Phase 6 stalls, the document is **saved to local IndexedDB** as a pending upload
- A notification appears: "Connection lost — document saved for later upload"
- The document will be **automatically queued for sync** when connectivity is restored
- You can also manually trigger sync from the Settings page

---

## 9. AI Document Processing (OCR)

### 9.1 How OCR Works
Smart E-VISION uses **Tesseract.js**, a JavaScript-based OCR engine that runs entirely in your browser — no data is sent to external servers.

1. The PDF is first **converted to images** (page by page)
2. Each page image is processed through Tesseract.js
3. Extracted text is analyzed by **classifier models**

### 9.2 Metadata Extraction Fields
| Field | Method | Example |
|-------|--------|---------|
| Document Type | Classifier model | \"DLL\" |
| Week Number | Regex pattern matching | \"Week 3\" |
| Subject | Classifier model | \"Mathematics\" |
| Grade Level | Regex pattern matching | \"Grade 7\" |
| Teacher Name | Name pattern detection | \"Juan Dela Cruz\" |
| School Name | Regex + lookup | \"Calapan Central School\" |
| Date | Date format detection | \"2026-06-15\" |

### 9.3 Editing OCR Results
After OCR processing completes:
1. Review the extracted information in the pre-upload form
2. If any field is incorrect, click the **Edit** button
3. Correct the information manually
4. The corrected data is used for submission

### 9.4 Accuracy Tips
- **Use clear, typed documents** (handwritten text has lower accuracy)
- **Ensure good scan quality**: Minimum 200 DPI, clean backgrounds
- **Standard format**: Use the official DepEd DLL/ISP/ISR templates
- **Machine-printed text** extracts at ~90%+ accuracy
- **Handwritten entries** may require manual correction

---

## 10. QR Code Verification System

### 10.1 Purpose
Every document uploaded to Smart E-VISION receives a unique QR code containing a **SHA-256 hash** of the document. This creates a **tamper-proof verification chain**:
- Anyone can verify document authenticity
- Any modification to the document after upload is detectable
- The verification link is: '{your-domain}/verify/{hash}'

### 10.2 Verifying a Document

**Online Verification:**
1. Navigate to the **Verify** page (no login required for pure verification)
2. Enter the document's verification code (hash) manually, or
3. Use the QR scanner (mobile) to scan the QR code on the printed document
4. The system will display:
   - **Authentic** (green checkmark): Document is genuine and unmodified
   - **Tampered/Suspicious** (red warning): Document does not match original hash
   - Document metadata: teacher name, subject, grade, week, upload date
   - Review status and reviewer feedback

**Offline Verification:**
- Previously verified documents are cached in IndexedDB
- If offline, the system checks the local cache first
- Shows cached verification data with a note indicating it was last verified on a specific date

### 10.3 Verification Details Page
The '/verify/{hash}' page displays:
- Document status: **Authentic** / **Not Found** / **Tampered**
- Filename
- Teacher who submitted
- Subject and Grade Level
- Week and Term
- School
- Upload date and time
- SHA-256 hash (partial display for comparison)
- Review status and reviewer comments
- **View Document** button (opens document in browser, requires signed URL)
- **Download Original** button

### 10.4 QR Code Design
- The QR code contains the URL: '{base-url}/verify/{hash}'
- It is placed on the **last page** of the PDF (bottom-right corner)
- Printed on a white background with sufficient contrast for reliable scanning

---

## 11. Review & Feedback System

### 11.1 Review Workflow
1. **Teacher uploads** a document → Status: **Pending**
2. **Master Teacher** reviews → Status: **Under Review**
3. Review outcome:
   - **Approve** → Status: **Approved**. Teacher and School Head are notified
   - **Request Revision** → Status: **Needs Revision**. Teacher is notified with comments
4. If revision requested:
   - Teacher **re-uploads** the corrected document
   - New version is **linked to the original** for tracking history
   - Goes back to **Pending** for re-review

### 11.2 Review Interface
The review page ('/review') provides:
- **Document Preview**: View the full document in the browser
- **Annotation Tools**: Highlight, comment, draw rectangles on the document
- **Checklist**: Structured evaluation fields with pass/fail toggles
- **Feedback Box**: Free-form text for detailed comments
- **Decision Buttons**: Approve / Request Revision
- **Revision History**: View previous versions and feedback

### 11.3 Review Notifications
- Teachers receive **real-time notifications** when their document is reviewed
- School Heads receive **summary notifications** of review outcomes
- Notifications appear in the **bell icon** in the top navigation bar
- Unread notifications are shown with a badge count
- Click a notification to navigate directly to the relevant document
- Notifications persist in IndexedDB and sync when online

---

## 12. Offline Mode

### 12.1 Overview
Smart E-VISION is designed as an **offline-first application**. You can continue working even without an internet connection. The system uses **IndexedDB** (a browser-based database) to store data locally.

### 12.2 What Works Offline
| Feature | Offline Availability |
|---------|---------------------|
| Dashboard (cached data) | ✓ (last synced data) |
| Upload (via sync queue) | ✓ (queued for later) |
| Archive (cached documents) | ✓ (previously viewed) |
| Document viewing (cached) | ✓ (previously opened) |
| Verification (cached hashes) | ✓ (previously checked) |
| Notifications (cached) | ✓ (last synced) |
| Settings | ✓ |
| Chatbot (limited) | ✓ (static responses) |
| Live queries | ✗ |
| New document review | ✗ |
| Calendar editing | ✗ |

### 12.3 Offline Upload Queue
When you upload a document offline:
1. The upload pipeline processes locally (all phases run in-browser)
2. The final document and metadata are saved to the **Offline Sync Queue** in IndexedDB
3. A badge shows the number of pending uploads
4. When connectivity is restored:
   - **Automatic sync**: The system processes the queue automatically
   - **Manual sync**: Go to Settings → Sync → \"Sync Now\"
5. Each queued upload shows its status: Queued → Syncing → Complete/Failed

### 12.4 Offline Document Cache
- Documents you view online are cached locally for offline access
- Cached documents are stored with expiration (configurable in Settings)
- You can mark documents for **persistent offline storage** (pin icon)

### 12.5 Offline Dashboard
- The dashboard uses cached data for instant rendering (no loading spinners)
- A banner shows: \"You are offline — showing last synced data\"
- Data freshness is indicated (e.g., \"Last updated: 2 hours ago\")

---

## 13. Chatbot Assistant

### 13.1 Accessing the Chatbot
- Look for the **chat bubble icon** in the bottom-right corner of any page
- Click to open the chat window
- Type your question in the input box

### 13.2 What the Chatbot Can Do
The chatbot can answer questions across **8 categories**:

| Intent | Examples |
|--------|----------|
| **Deadline** | \"When is the deadline for DLL submission?\" |
| **Upload** | \"How do I upload a document?\" |
| **Compliance** | \"What is my compliance rate?\" |
| **Account** | \"How do I reset my password?\" |
| **Offline** | \"How does offline mode work?\" |
| **Feature** | \"What is the QR code for?\" |
| **Greeting** | \"Hello\", \"Hi\" |
| **DLL Search** | \"Show me DLLs for Grade 7 Math\" |

### 13.3 Intelligent Search
The chatbot can:
- Search the **official documentation** (technical manuals, user guide)
- Query the **database** for live data (your submission counts, deadlines, etc.)
- Search **DLL document content** across all uploaded documents
- Provide context-aware answers based on your user role

### 13.4 DLL Content Search
1. Ask: \"Find DLLs about photosynthesis\"
2. The chatbot searches the OCR-extracted text of all DLLs
3. Returns links to relevant documents with excerpt snippets
4. Click a result to open the document directly

### 13.5 Offline Chatbot
- The chatbot has a **static response mode** for common questions when offline
- Pre-cached responses cover frequently asked questions
- Advanced queries (database lookups, document search) are unavailable offline

---

## 14. Voice Guide

### 14.1 What is Voice Guide?
The Voice Guide is an **accessibility feature** that reads on-screen content aloud using the Web Speech API. It helps visually impaired users and those who prefer auditory navigation.

### 14.2 Enabling Voice Guide
1. Navigate to **Settings** → **Accessibility**
2. Toggle **Voice Guide** on
3. The system will begin narrating the current page content
4. Setting is saved in your browser (persists across sessions)

### 14.3 How It Works
- When Voice Guide is enabled, the system announces:
  - Page titles and section headings
  - Navigation options
  - Important status changes
  - Upload progress updates
  - Review feedback summaries
- The voice respects your browser's language settings (Filipino/English)
- You can adjust speech rate in Settings

### 14.4 Disabling Voice Guide
- Click the **Voice Guide** toggle in the top navigation bar (quick toggle)
- Or go to Settings → Accessibility → toggle off
- The voice stops immediately

---

## 15. Dashboard & Analytics

### 15.1 My Dashboard
Each user role has a tailored dashboard:

**Teacher Dashboard Components:**
- **Submission Summary**: Counts (total, pending, approved, needs revision)
- **Recent Activity**: Latest submissions with status badges
- **Compliance Calendar**: Week-by-week color-coded heatmap
- **Quick Actions**: Upload button, View Archive button

**Master Teacher & School Head Dashboard Components:**
- **School Overview**: Overall compliance percentage with trend arrow
- **Teacher List**: Individual submission rates
- **Pending Review Queue**: Documents needing attention
- **Weekly Chart**: Bar graph of submissions over time

**District Supervisor Dashboard Components:**
- **District Summary**: Aggregate metrics across all schools
- **School Rankings**: Ordered by compliance rate
- **System Stats**: Total users, documents, reviews
- **Recent Activity**: Latest uploads and reviews across district

### 15.2 Analytics Page ('/analytics')
The analytics dashboard provides deeper insights:

- **Compliance Over Time**: Line chart showing compliance rate across weeks
- **Teacher Performance**: Bar chart comparing teachers
- **Document Type Breakdown**: Pie chart of DLL vs ISP vs ISR submissions
- **Submission Trends**: Daily/weekly upload volume
- **Geographic View**: Map-based visualization (District Supervisor only)

### 15.3 Predictive Analytics
The system uses **linear regression** to predict compliance trends:
- Forecasts future compliance rates based on historical data
- Identifies teachers at risk of falling behind
- Shows estimated compliance for the next 2-3 weeks
- Flags potential issues before they become problems

### 15.4 Pattern Detection
AI-powered pattern analysis detects:
- **Late submission patterns**: Teachers who consistently submit after deadlines
- **Improvement trends**: Teachers showing positive change
- **Quality patterns**: Teachers whose documents frequently need revision
- **Anomaly alerts**: Sudden changes in submission behavior

### 15.5 Cluster Analysis
The system groups teachers into **behavioral clusters**:
- **Cluster A**: Consistent, on-time submitters (high compliance)
- **Cluster B**: Near-deadline submitters (moderate compliance)
- **Cluster C**: Frequently late or missing (low compliance)
- This helps supervisors target interventions effectively

---

## 16. Academic Calendar & Deadlines

### 16.1 Calendar Page ('/calendar')
The calendar provides a visual overview of the academic year:

- **Term Selection**: Switch between Terms 1, 2, and 3
- **Month View**: Traditional calendar layout
- **Week View**: List of academic weeks with deadlines
- **Deadline Markers**: Colored dots for DLL/ISP/ISR deadlines

### 16.2 Deadline Management (District Supervisor Only)
1. Navigate to **Calendar**
2. Click a specific date or week
3. In the popup, set:
   - **DLL Deadline**: Date and time for DLL submissions
   - **ISP Deadline**: Date and time for ISP submissions
   - **ISR Deadline**: Date and time for ISR submissions
4. Save changes
5. Teachers and School Heads see updated deadlines in real-time

### 16.3 Term Management (District Supervisor Only)
1. Click **Manage Terms** button
2. For each term:
   - Set **Start Date** and **End Date**
   - Set **Number of Weeks** (default: 10)
   - Activate/Deactivate term
3. Changes are reflected across all dashboards

### 16.4 Late Submission Handling
- Documents submitted after the deadline are marked with a **late flag**
- Late submissions are still accepted but highlighted in dashboards
- Grace periods can be configured in Calendar settings
- Late documents affect compliance score differently than missing documents

---

## 17. Archive & Document Management

### 17.1 Archive Page ('/archive')
The archive provides organized access to all documents:

**Folder Structure:**
`
Archive/
  School Year 2025-2026/
    Term 1/
      Week 1/
      Week 2/
      ...
    Term 2/
    Term 3/
`

**Views:**
- **Folder View**: Navigation-based browsing
- **List View**: Flat list with sortable columns
- **Search**: Full-text search across document metadata and content

### 17.2 Document Actions
For each document in the archive:

| Action | Availability |
|--------|-------------|
| **View** | All roles (own documents) |
| **Download** | All roles (own documents) |
| **Share** | All roles (generates shareable link) |
| **Delete** | Owner (if status is Pending) |
| **Archive** | Role-dependent (see permissions) |
| **View QR** | All roles |
| **View Review** | Owner and reviewers |

### 17.3 Document Archiving
- Approved documents can be moved to **long-term archive**
- Archived documents are read-only
- Archiving preserves the document with all metadata, hash, and QR code
- Only users with archive permission can perform this action

### 17.4 Search Functionality
- **Basic Search**: Search by filename, teacher name, subject, school
- **Advanced Filters**: Filter by document type, week, term, status, date range
- **Content Search**: Search inside document text (OCR-extracted content)

---

## 18. Settings & Preferences

### 18.1 Accessing Settings
Navigate to **Settings** in the sidebar (gear icon).

### 18.2 Profile Settings
- **Display Name**: Change how your name appears in the system
- **Email**: View your registered email (cannot be changed here — contact admin)
- **School**: View your assigned school
- **Role**: View your system role (cannot be changed here — contact admin)

### 18.3 Theme Settings
- **Light Mode**: Default bright theme
- **Dark Mode**: Dark theme for reduced eye strain
- **Auto**: Follows your system/browser theme preference
- Theme preference is saved in your browser and persists across sessions

### 18.4 Notifications Settings
- **Email Notifications**: Toggle email alerts for upload confirmation, review received, deadline reminders, system announcements
- **In-App Notifications**: Toggle browser notifications
- **Push Notifications**: Enable/disable push notifications (when installed as PWA)

### 18.5 Sync Settings
- **Auto Sync**: Toggle automatic background sync
- **Sync Now**: Manually trigger sync of offline queue
- **Pending Items**: View count of items waiting to sync
- **Sync Log**: View history of sync operations

### 18.6 Accessibility Settings
- **Voice Guide**: Toggle text-to-speech on/off
- **Speech Rate**: Adjust speed of voice narration
- **Font Size**: Increase/decrease font size system-wide

### 18.7 Account Settings
- **Change Password**: Update your login password
- **Session Management**: View active sessions and log out of other devices

---

## 19. Notifications System

### 19.1 Types of Notifications
| Notification | Trigger | Recipients |
|-------------|---------|------------|
| **Upload Confirmed** | Document uploaded successfully | Uploader |
| **Review Completed** | Review decision submitted | Document owner |
| **Revision Requested** | Reviewer requests changes | Document owner |
| **Deadline Reminder** | 24/48/72 hours before deadline | All affected users |
| **Missed Submission** | Deadline passed without submission | Teacher + School Head |
| **Sync Complete** | Offline queue synced | User who queued |
| **System Announcement** | Admin broadcast | All users |

### 19.2 Viewing Notifications
1. Click the **bell icon** in the top-right navigation bar
2. A dropdown shows recent notifications
3. Click **View All** to open the full notifications page
4. Unread notifications have a **blue dot** indicator
5. Click any notification to navigate to the relevant item

### 19.3 Notification Preferences
Configure which notifications you receive in **Settings** → **Notifications**.

### 19.4 Offline Notifications
- Recent notifications are cached in IndexedDB
- When you come online, the system syncs with the server
- Push notifications are supported when the PWA is installed

---

## 20. Admin Panel

### 20.1 User Management
1. Navigate to **Admin** → **Users**
2. View all registered users in a table with search and filters
3. **Create User**:
   - Click **Create User**
   - Fill in: Full Name, Email, Role (Teacher/Master Teacher/School Head/District Supervisor), School
   - System sends a welcome email with setup instructions
4. **Edit User**: Change name, role, school assignment
5. **Deactivate/Activate**: Disable or enable user accounts
6. **Reset Password**: Send password reset link to user's email

### 20.2 School Management
1. Navigate to **Admin** → **Schools**
2. View list of all schools
3. **Add School**: Name, District, Address
4. **Edit School**: Update school information
5. **Merge Schools**: Combine duplicate school records

### 20.3 System Settings
1. Navigate to **Admin** → **Settings**
2. Configure global system parameters:
   - **Max Upload Size**
   - **Allowed File Types**
   - **Default Deadline Rules**
   - **Term Configuration** (number of weeks, dates)
   - **Notification Defaults**

### 20.4 Audit Logs
1. Navigate to **Admin** → **Audit Logs**
2. View an immutable, hash-chained log of all system actions:
   - User logins/logouts
   - Document uploads
   - Reviews and approvals
   - Setting changes
   - User management actions
3. **Verify Log Integrity**: System can validate the hash chain to ensure logs are not tampered with
4. **Export**: Download audit logs as CSV

---

## 21. Troubleshooting & FAQ

### 21.1 Common Issues

**Q: I can't log in. What should I do?**
A: Check that you are using your full DepEd email. Click \"Forgot Password\" to reset. If the problem persists, contact your school administrator.

**Q: My upload keeps failing.**
A: Check:
- File size is under 20 MB
- File format is PDF, DOC, or DOCX
- You have a stable internet connection
- If the issue persists, the offline queue will save your upload automatically

**Q: The OCR extracted wrong information from my document.**
A: You can manually edit all extracted fields before uploading. Simply click the Edit button next to any field and correct the information.

**Q: How do I know if my document was reviewed?**
A: You will receive an in-app notification (bell icon) and optionally an email. You can also check the document status in your Archive.

**Q: I uploaded a document but it disappeared.**
A: Check:
- Your internet may have disconnected during upload; check the Offline Sync Queue
- The document may have failed processing; check Archive for error status
- Contact support if you cannot find it

**Q: The QR code on my printed document won't scan.**
A: Ensure:
- The QR code is printed clearly (not smudged or distorted)
- You have good lighting
- Your camera is focused on the QR code
- You can also enter the verification code manually on the Verify page

**Q: Can I use Smart E-VISION on my phone?**
A: Yes! The system is fully responsive and works on mobile browsers. For the best experience, install the PWA:
- Android: Chrome menu → \"Add to Home screen\"
- iOS: Safari Share → \"Add to Home Screen\"

**Q: What happens if I close my browser during upload?**
A: The upload pipeline runs in the current browser tab. If closed:
- If Phase 6 (Upload) had not started: The upload is not saved, you need to restart
- If Phase 6 failed due to connection: The document is saved to the offline queue
- Always wait for the \"Upload Complete\" confirmation before closing

### 21.2 Browser Compatibility
| Browser | Supported | Notes |
|---------|-----------|-------|
| Google Chrome | ✓ | Best experience |
| Microsoft Edge | ✓ | Fully supported |
| Mozilla Firefox | ✓ | Some PWA features limited |
| Safari (macOS) | ✓ | Offline mode may have limitations |
| Safari (iOS) | ✓ | Add to Home Screen for best PWA |
| Chrome (Android) | ✓ | Full PWA support |

### 21.3 System Requirements
- **Modern browser** (Chrome 90+, Edge 90+, Firefox 90+, Safari 15+)
- **Internet connection** (for first load and sync; offline mode available)
- **JavaScript enabled**
- **Recommended**: Install as PWA for offline support

### 21.4 Contact Support
- For technical issues, contact your **School ICT Coordinator**
- For system-wide issues, contact the **District ICT Unit**
- For account issues, contact your **School Head** or **District Supervisor**

---

## Appendix A: Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| Ctrl + U | Go to Upload page |
| Ctrl + D | Go to Dashboard |
| Ctrl + A | Go to Archive |
| Ctrl + K | Focus search bar |
| Ctrl + / | Open/Close chatbot |
| Escape | Close modal / Cancel |

## Appendix B: Status Color Reference

| Color | Meaning |
|-------|---------|
| Green | Submitted / Approved / On track |
| Yellow | Late submission / Needs attention |
| Red | Missing / Failed / Needs revision |
| Gray | Not yet due / Future week |
| Blue | Under review / Processing |

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **CEDIMS** | Calapan East District Instructional Monitoring System |
| **DLL** | Daily Lesson Log |
| **ISP** | Individual School Plan/Program |
| **ISR** | Individual School Report |
| **DepEd** | Department of Education (Philippines) |
| **PWA** | Progressive Web App |
| **OCR** | Optical Character Recognition |
| **SHA-256** | Secure Hash Algorithm (256-bit), used for document fingerprinting |
| **RLS** | Row Level Security (Supabase database security) |
| **IndexedDB** | Browser-based database for offline storage |
| **Term** | One of three academic periods in a school year (10 weeks each) |

---

*End of User Manual*

*Smart E-VISION / CEDIMS — Calapan East District Instructional Monitoring System*
*Built with SvelteKit, Supabase, and love for Philippine public education.*
