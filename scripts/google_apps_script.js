/**
 * Google Apps Script — CEDIMS Web App.
 *
 * Two capabilities in one deployment, dispatched by request payload shape:
 *   1. Word (.doc/.docx) -> PDF conversion (unchanged from before).
 *   2. Compliance report export to a Google Sheet.
 *
 * Deploy this as a Web App (Extensions > Apps Script in a Google Sheet/Doc,
 * or script.google.com > New project) and paste the resulting /exec URL
 * into PUBLIC_GOOGLE_SCRIPT_URL in .env.
 *
 * ── Conversion contract ── (src/lib/utils/googleConvert.ts, /api/convert)
 *   Request:  POST, Content-Type: text/plain, body JSON { fileName, base64Data }
 *   Response: JSON { success: true, pdfBase64 } or { success: false, error }
 *
 * ── Report export contract ──
 *   Request:  POST, Content-Type: text/plain,
 *             body JSON { action: 'export_report', schoolYear?: string }
 *   Response: JSON { success: true, rows: <count> } or { success: false, error }
 *
 * Requires:
 *   - The "Drive API" advanced service (Editor > Services > + > Drive API)
 *     for conversion. Bound to Drive API v3 (v2's Drive.Files.insert() was
 *     retired), so this uses Drive.Files.create() and v3 field names
 *     (name, not title).
 *   - Script Properties (Project Settings > Script Properties) for the
 *     report export:
 *       SUPABASE_URL            = https://<project>.supabase.co
 *       SUPABASE_ANON_KEY       = the same PUBLIC_SUPABASE_ANON_KEY the app
 *                                  itself already ships to browsers — not a
 *                                  secret, safe to store here
 *       REPORT_ACCOUNT_EMAIL    = the dedicated reporting account's email
 *       REPORT_ACCOUNT_PASSWORD = its password — a real secret, only ever
 *                                  entered here, never written into this file
 *       REPORT_SHEET_ID         = the target spreadsheet's ID
 *
 *     The reporting account is a real Supabase user (Authentication > Add
 *     User) with a matching `profiles` row: role = 'District Supervisor',
 *     district_id = NULL, school_id = NULL. Under
 *     get_compliance_report_rows() (supabase/migrations/
 *     20260917_compliance_report_rpc.sql) a District Supervisor with no
 *     district_id sees every district — the same fallthrough
 *     get_analytics_comparison() already uses — so this account only ever
 *     sees what that role is allowed to see under the app's existing RLS
 *     rules. This script never touches the service_role key.
 */
function doPost(e) {
    var body;
    try {
        body = JSON.parse(e.postData.contents);
    } catch (err) {
        return jsonOutput_({ success: false, error: 'Invalid JSON body' });
    }

    if (body.action === 'export_report') {
        try {
            var rowCount = exportComplianceReport(body.schoolYear || null);
            return jsonOutput_({ success: true, rows: rowCount });
        } catch (err) {
            return jsonOutput_({ success: false, error: err.message });
        }
    }

    return convertDocToPdf_(body);
}

function jsonOutput_(obj) {
    return ContentService.createTextOutput(JSON.stringify(obj))
        .setMimeType(ContentService.MimeType.JSON);
}

// ─── Word -> PDF conversion ─────────────────────────────────────────────

function convertDocToPdf_(body) {
    try {
        var fileName = body.fileName;
        var base64Data = body.base64Data;

        if (!fileName || !base64Data) {
            throw new Error('Missing fileName or base64Data');
        }

        var ext = fileName.split('.').pop().toLowerCase();
        var mimeType = ext === 'doc'
            ? 'application/msword'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

        var decodedBytes = Utilities.base64Decode(base64Data);
        var blob = Utilities.newBlob(decodedBytes, mimeType, fileName);

        // Upload and convert to native Google Docs format in one step —
        // this is what lets Google (not LibreOffice) do the DOCX -> PDF rendering.
        // Drive API v3 has no separate "convert" flag like legacy v2 did:
        // setting the target resource's mimeType to a Google-native format
        // while uploading a different-mimetype blob triggers the conversion.
        var resource = {
            name: fileName.replace(/\.(docx|doc)$/i, ''),
            mimeType: 'application/vnd.google-apps.document'
        };
        var docFile = Drive.Files.create(resource, blob);

        // Export the converted Google Doc as PDF.
        var pdfBlob = DriveApp.getFileById(docFile.id).getAs('application/pdf');
        var pdfBase64 = Utilities.base64Encode(pdfBlob.getBytes());

        // Clean up the temporary Google Doc so Drive doesn't fill up with junk.
        DriveApp.getFileById(docFile.id).setTrashed(true);

        return jsonOutput_({ success: true, pdfBase64: pdfBase64 });
    } catch (err) {
        return jsonOutput_({ success: false, error: err.message });
    }
}

// ─── Compliance report export ───────────────────────────────────────────

function getReportingAccessToken_(supabaseUrl, anonKey, email, password) {
    var response = UrlFetchApp.fetch(supabaseUrl + '/auth/v1/token?grant_type=password', {
        method: 'post',
        contentType: 'application/json',
        headers: { apikey: anonKey },
        payload: JSON.stringify({ email: email, password: password }),
        muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
        throw new Error('Reporting account sign-in failed (' + response.getResponseCode() + '): ' + response.getContentText());
    }

    return JSON.parse(response.getContentText()).access_token;
}

function exportComplianceReport(schoolYear) {
    var props = PropertiesService.getScriptProperties();
    var supabaseUrl = props.getProperty('SUPABASE_URL');
    var anonKey = props.getProperty('SUPABASE_ANON_KEY');
    var email = props.getProperty('REPORT_ACCOUNT_EMAIL');
    var password = props.getProperty('REPORT_ACCOUNT_PASSWORD');
    var sheetId = props.getProperty('REPORT_SHEET_ID');

    var missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!anonKey) missing.push('SUPABASE_ANON_KEY');
    if (!email) missing.push('REPORT_ACCOUNT_EMAIL');
    if (!password) missing.push('REPORT_ACCOUNT_PASSWORD');
    if (!sheetId) missing.push('REPORT_SHEET_ID');
    if (missing.length > 0) {
        throw new Error('Missing Script Properties: ' + missing.join(', '));
    }

    var accessToken = getReportingAccessToken_(supabaseUrl, anonKey, email, password);

    var payload = {};
    if (schoolYear) payload.p_school_year = schoolYear;

    var response = UrlFetchApp.fetch(supabaseUrl + '/rest/v1/rpc/get_compliance_report_rows', {
        method: 'post',
        contentType: 'application/json',
        headers: {
            apikey: anonKey,
            Authorization: 'Bearer ' + accessToken
        },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
    });

    if (response.getResponseCode() !== 200) {
        throw new Error('Report RPC failed (' + response.getResponseCode() + '): ' + response.getContentText());
    }

    var rows = JSON.parse(response.getContentText());

    var headers = ['Teacher', 'School', 'District', 'Doc Type', 'Week', 'School Year', 'Status', 'Submitted'];
    var values = rows.map(function (r) {
        return [
            r.teacher_name, r.school_name, r.district_name,
            r.doc_type, r.week_number, r.school_year,
            r.compliance_status, r.submitted_at
        ];
    });

    var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    sheet.clearContents();

    // One batched write for the header row, one for every data row — this
    // is what keeps the export at ~2 Sheets calls regardless of report
    // size, well inside the 300 requests/minute free-tier limit even for a
    // full district's worth of submissions.
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    if (values.length > 0) {
        sheet.getRange(2, 1, values.length, headers.length).setValues(values);
    }

    return values.length;
}

// For a scheduled export: in the Apps Script editor, Triggers (clock icon)
// > Add Trigger > select scheduledComplianceExport > Time-driven > pick a
// schedule (e.g. weekly, the morning after your submission deadline).
function scheduledComplianceExport() {
    exportComplianceReport(null);
}
