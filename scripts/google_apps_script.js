/**
 * Google Apps Script — Word (.doc/.docx) to PDF conversion Web App.
 *
 * Deploy this as a Web App (Extensions > Apps Script in a Google Sheet/Doc,
 * or script.google.com > New project) and paste the resulting /exec URL
 * into PUBLIC_GOOGLE_SCRIPT_URL in .env.
 *
 * Contract expected by src/lib/utils/googleConvert.ts and
 * src/routes/api/convert/+server.ts:
 *   Request:  POST, Content-Type: text/plain, body JSON { fileName, base64Data }
 *   Response: JSON { success: true, pdfBase64 } or { success: false, error }
 *
 * Requires the "Drive API" advanced service to be enabled in this script
 * (Editor > Services > + > Drive API). Apps Script's Advanced Drive Service
 * is bound to Drive API v3 (v2's Drive.Files.insert() was retired), so this
 * uses the v3 method (Drive.Files.create) and v3 resource field names
 * (name, not title).
 */
function doPost(e) {
    try {
        var body = JSON.parse(e.postData.contents);
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

        return ContentService.createTextOutput(JSON.stringify({
            success: true,
            pdfBase64: pdfBase64
        })).setMimeType(ContentService.MimeType.JSON);

    } catch (err) {
        return ContentService.createTextOutput(JSON.stringify({
            success: false,
            error: err.message
        })).setMimeType(ContentService.MimeType.JSON);
    }
}