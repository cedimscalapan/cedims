# SMART E-VISION User Manual
**Calapan East District Instructional Monitoring System (CEDIMS)**  
Revision 0.2 · 23 October 2026 · Draft for review

**Website:** [Official URL]  
**Support:** [Contact details and hours]  
**Release / document owner:** [Deployed release and responsible office]

SMART E-VISION supports instructional document submission, review remarks, and compliance monitoring. This guide reflects the inspected project code; the deployed system still requires verification. Available records and actions depend on your role, school/district assignment, calendar, and system settings.

## 1. Before you begin

You need an administrator-provided account, a current browser with JavaScript enabled, and internet access for initial sign-in and synchronization. For uploads, prepare a readable **PDF below 4 MB** and retain your original copy. Export Word documents to PDF first. Camera permission is required for in-app QR scanning.

Installation as an app may be offered on supported browsers. Offline functions require information previously saved on the same device.

## 2. Sign in and manage access

**Sign in:** Open the official website, enter your registered email and password, then select **Sign In**. Check that your role and school assignment are correct.

**Forgotten password:** Select **Forgot password?**, enter your registered email, submit the request, and follow the recovery email. Check spam/junk if needed; contact support if recovery fails.

**Change password:** Open **Settings → Change Password**, enter your current password, enter and confirm a new password, then submit. The reviewed screen requires at least six characters; follow your institution's password policy.

**Sign out:** Confirm pending uploads have synchronized, then use the sign-out control in **Settings**. Check that the sign-in or public screen appears.

## 3. Roles and navigation

| Role | Main navigation | Uploads and responsibilities |
|---|---|---|
| Teacher | Tracker, Upload, Archives, Loads, Settings | Upload DLL; track submissions and read remarks |
| Master Teacher | Tracker, Upload, Compliance, Archives, Loads, Settings | Upload DLL/ISP/ISR; review accessible school DLLs |
| School Head | Tracker, Upload, Compliance, Archives, Settings | Upload ISP/ISR; monitor school records and add permitted remarks |
| District Supervisor | Tracker, Compliance, Archives, Settings | Monitor district records and add permitted remarks; no instructional uploads |
| Admin | Compliance, Archives, Settings, Users, Calendar, System Logs | Manage accounts, calendar, settings, and logs; no upload category granted by current rules |

**Scan** is configured for the four operational roles. Some navigation may appear in an additional menu on smaller screens. Admin access is separate from District Supervisor access.

**Review permissions:** Master Teachers, School Heads, and District Supervisors may add DLL remarks within their accessible scope. Master Teacher ISP/ISR documents may be viewed by their owner, the same-school School Head, the same-district District Supervisor, and Admin; supervisory remarks are for School Heads and District Supervisors. School Head ISP/ISR documents may be viewed by their owner, the same-district District Supervisor, and Admin; supervisory remarks are for the District Supervisor. Database permissions and organizational scope also apply.

## 4. Set up teaching loads

DLL submissions by Teachers and Master Teachers require a teaching load.

1. Open **Loads** and select **Add New Load** or **Add teaching load**.
2. Choose your grade and subject from the available options.
3. Select **Add** and check that the load appears.
4. To correct it, use the edit control and select **Update**.

The reviewed screen offers Kinder through Grade 6. Before using **Delete Load**, check the selected item and your school's rules for historical records.

**Result:** The correct teaching load is available for DLL upload.

## 5. Upload a document

1. Open **Upload** and select an allowed document type.
2. Choose a readable **PDF below 4 MB**.
3. Check the scanner's suggested information. Scanner results are suggestions and require your confirmation.
4. For DLL, select and confirm the **teaching load, term, and week**. For ISP/ISR, complete the displayed destination fields.
5. Confirm that the academic period is **Open** and the destination matches the PDF. Read any notice that the slot is already covered.
6. Select **Confirm & Archive**. In **Confirm archive destination**, review the details and select **Confirm & Archive** again. Use **Review again** to correct them.
7. Keep the application open until it reports completion or a queued state.
8. Check **Archives** for the record and destination. If queued, complete synchronization as described in Section 8.

**Result:** The file is recorded at the confirmed destination or explicitly queued for synchronization. A finished scan alone does not confirm submission.

If offered, **Use selected targets without waiting for scan** allows manual targeting; check every destination field carefully. A closed period requires calendar clarification, not selection of an unrelated week.

**Corrections:** Before submission, correct the fields or replace the selected file. After submission, locate the record in **Archives** and use an authorized correction action or contact the appropriate reviewer/Admin. Do not assume another upload automatically replaces or links to the original.

## 6. Find documents and review remarks

**Find or download a file**

1. Open **Archives** and narrow the list using available search and period filters.
2. Check the owner, filename, document type, and destination.
3. Use the view or download action. If retrieval fails, reconnect and request the file again.

**Read or enter remarks**

1. Open the document's remarks action in **Archives**.
2. Read existing feedback and reviewer details.
3. If authorized, inspect the document, enter your remarks, and use the displayed save action.
4. Reopen the remarks to verify they were saved.

**Result:** You can retrieve the intended file and read or save feedback within your permitted scope.

Use **All files**, **For checking**, and **Checked** where displayed. **Checked** reflects the archive's remarks-based review condition; it does not independently mean approved or submitted on time. Do not assume separate approval, signature, or annotation controls are available.

**Move/delete:** Use these actions only when permitted and displayed. The move interface states that it preserves the file, QR code, uploader, upload time, and remarks; archive corrections may use closed weeks without opening them for new uploads. Before deletion, check the exact record and retention policy. Do not assume deleted records can be recovered.

## 7. Monitor compliance and follow up

1. Open **Tracker** for your summary or **Compliance** for permitted school/district monitoring.
2. Verify the reporting period and school/district scope.
3. Review the labeled indicators and open the underlying records before following up.
4. Check timing classifications separately from review remarks.

| Indicator | Meaning for the user |
|---|---|
| Compliant / on-time | Submission-compliance classification; check the selected period and record |
| Late | Timing classification, separate from review completion |
| Supplementary / extra | Additional submission; verify its destination and intended use |
| For checking / Checked | Archive review condition based on remarks |
| Queued / finishing in background | Work remains pending; confirm synchronized receipt |

Read labels and legends rather than relying on color alone. Official scoring rules and treatment of supplementary documents require system-owner confirmation.

**Role checklist:** Teachers maintain loads, submit DLLs, and read remarks. Master Teachers also submit ISP/ISR and review accessible DLLs. School Heads monitor their school, submit ISP/ISR, and review permitted records. District Supervisors compare schools, inspect records, and add permitted remarks; account/calendar changes go to Admin.

## 8. Work offline and synchronize

**Prepare online:** Sign in and load your teaching loads and open academic periods on the device you will use offline.

**Save offline:** Select your PDF and destination, confirm the period is in the saved list of open entries, select **Save Offline**, and check the queue indicator. If asked to connect once to save the period, reconnect and refresh first.

**Synchronize:** Restore internet access, open the application, allow queued work to finish, and check both the pending count and the record in **Archives**.

**Result:** The record appears after synchronization with no related pending item. A locally queued file is not proof of server receipt. Retain the original PDF and do not clear browser data or switch devices while relying on that queue.

## 9. Verify a QR code

1. Select **Scan**, allow camera access, and scan the code in good lighting.
2. Read the verification result and compare its details with the document.
3. For a failed scan, improve focus or print clarity and retry online.
4. Report persistent mismatches with the document identifier and result.

**Result:** The application displays a matching record or indicates that a match cannot be established. Offline lookup depends on cached information. A record match alone does not prove that all content of a printed document is unchanged.

## 10. Settings and assistance

In **Settings → Personal Details**, update your name or profile photo, save, and check the success message. Ask Admin to correct role, school, or district assignments.

Use notification controls under **System Experience** where available. Browser permission does not guarantee email delivery or continuous background alerts.

Where displayed, use the walkthrough, chatbot, voice, or help controls for guidance. Confirm consequential advice against the actual record and school instructions; availability must be checked in the deployed release.

## 11. Administrator tasks

| Task | Steps and confirmation |
|---|---|
| Create an account | Open **Users**, check for duplicates, open the create-user action, enter required name/email/password/role/school/district fields, submit, and verify the list entry. Provide access through an approved private process; do not assume automatic welcome email delivery. |
| Update assignments | Open the account's role/assignment action, verify current details, edit and save, then confirm the result. Role changes affect access. |
| Change system options | Open Admin **Settings**, review upload/review options, save only intended changes, and confirm the outcome. |
| Manage periods | Open **Calendar**, check term/week/dates/deadline/open state, save, and confirm the affected period. Coordinate changes with schools. |
| Investigate events | Open **System Logs** and inspect available entries. Do not assume complete coverage, immutability, or export support without verification. |

## 12. Troubleshooting

| Problem | First action |
|---|---|
| Cannot sign in | Check email and connection; try password recovery. Contact support if it persists. |
| File rejected | Export as PDF and reduce it below 4 MB while preserving readability. |
| Upload action unavailable | Check role, required load/term/week, and whether processing is already running. |
| Period closed/unavailable | Confirm the intended period and ask Admin to check the calendar. |
| Wrong scan result | Correct and explicitly confirm the target fields before submission. |
| File stays queued | Reconnect, open the application, check queue errors and Archives. Escalate persistent failures. |
| Submission missing | Check filters, destination, account scope, and pending synchronization. |
| Download fails | Reconnect and request a fresh download through the application. |
| Cannot edit remarks | Check reviewer permission, document owner/type, and organizational scope. |
| QR lookup fails | Rescan clearly and retry online; report a persistent mismatch. |

**Common questions:** DOCX uploads must first be exported to PDF. Checked and on-time are separate conditions. Keep the application open through processing and verify queued work after reconnection. Offline use does not override closed-period restrictions.

## 13. Privacy and support

Use your own account, share files only with authorized recipients, and anonymize demonstration/support screenshots. Follow institutional retention rules and retain source documents. Ask the system owner about backups, restoration, privacy requests, and permitted sharing.

For support, provide your role, page, date/time and timezone, term/week, document identifier, exact error, and steps to reproduce. Never send passwords or unnecessary personal information.

## 14. Quick reference and publication checks

**Terms:** CEDIMS = Calapan East District Instructional Monitoring System; ISP = Instructional Supervisory Plan; ISR = Instructional Supervisory Report; OCR = automatic text extraction; PWA = installable web app; queue = work waiting for synchronization. DLL is currently displayed as **Daily Lesson Plan**; its official acronym expansion needs confirmation.

**Before finishing:** Check the correct account, PDF, document type, teaching load where required, open period, final destination, synchronized Archives record, and later remarks.

**Before publication, the system owner must:**

- Supply the official URL, deployed release, document owner, and support contacts.
- Confirm document terminology, browser/device requirements, deadlines/timezone, scoring, and correction/retention policies.
- Test sign-in/recovery, all role permissions, uploads, open/closed periods, offline sync, review remarks, QR lookup, and Admin actions on the deployed release.
- Verify optional assistance, notifications, analytics, and export features before documenting them as available.
- Add anonymized screenshots of sign-in/navigation, loads/upload confirmation, Archives/remarks, compliance, offline queue, QR verification, and Admin screens if needed.
- Approve the guide for release.

*Source basis: inspected local navigation, permissions, authentication, upload, loads, Archives, Compliance, Settings, Admin, and verification code. Older manuals were used as background. Live deployment acceptance testing has not been performed for this draft.*
