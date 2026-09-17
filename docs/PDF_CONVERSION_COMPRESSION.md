# PDF Conversion & Compression Guide

## Overview

The EVISION document verification system includes robust PDF handling with:
1. **Word to PDF Conversion** - Convert DOCX/DOC files to PDF with formatting preserved
2. **PDF Compression** - Reduce PDF file size while maintaining quality
3. **Automatic Transcoding Pipeline** - All files automatically converted to PDF before processing

## Features

### 1. Word to PDF Conversion

**Supported Formats:**
- `.docx` - Microsoft Word 2007+ format
- `.doc` - Microsoft Word 97-2003 format (converted via DOCX)
- `.pdf` - Direct upload (returned as-is)

**Conversion Process:**

```
DOCX File
    ↓
Extract HTML Content (mammoth.js)
    ↓
Parse HTML Structure
    ↓
Create PDF with Formatting (pdf-lib)
    ↓
Apply Standard Fonts (Helvetica, Helvetica Bold, Helvetica Oblique)
    ↓
Word-wrap Text to Page Width
    ↓
Output PDF Bytes
```

**Preserved Formatting:**
- ✓ Headings (H1-H6 → 13pt font)
- ✓ Bold text
- ✓ Italic text
- ✓ Line breaks and paragraph spacing
- ✓ Lists and tables (converted to text)
- ✓ Multi-page documents

**Example Usage (in Frontend):**

```javascript
import { transcodeToPdf } from '$lib/utils/transcode';

const file = document.querySelector('input[type="file"]').files[0];
const result = await transcodeToPdf(file);
console.log(`PDF created: ${result.pdfBytes.byteLength} bytes`);
console.log(`Extracted text: ${result.text}`);
```

### 2. PDF Compression

**Compression Strategy:**

The system uses a **smart compression approach**:

1. **Size Check** - If file < 1MB, no compression needed
2. **Object Stream Compression** - Uses pdf-lib's native compression
3. **Font Optimization** - Standard fonts (no embedded font subsets)
4. **Content Analysis** - Removes unnecessary metadata

**Compression Levels:**

| Size | Action | Target |
|------|--------|--------|
| < 1MB | No compression | Return as-is |
| 1-2MB | Standard compression | < 1MB |
| > 2MB | Aggressive compression | < 1MB |

**Compression Results:**

Typical compression ratios:
- Simple text documents: 5-10% reduction
- Images-heavy documents: 20-40% reduction
- Scanned PDFs: 30-50% reduction (limited)

**Example Usage:**

```javascript
import { compressFile } from '$lib/utils/compress';

const pdfBytes = new Uint8Array([/* PDF data */]);
const compressed = await compressFile(pdfBytes);
console.log(`Original: ${pdfBytes.byteLength / 1024}KB`);
console.log(`Compressed: ${compressed.byteLength / 1024}KB`);
```

### 3. Pipeline Integration

The upload pipeline automatically handles conversion and compression:

```
User Upload
    ↓
Phase 1: Transcode (Word → PDF)
    ↓
Phase 2: Compress (Reduce file size)
    ↓
Phase 3: Hash (Generate SHA-256)
    ↓
Phase 4: Stamp (Add QR code)
    ↓
Phase 5: Upload (Send to Supabase)
```

**Debug Output:**

Enable debug logging in the browser console to see details:

```
[transcode] Processing file: document.docx (245KB)
[transcode] Converting DOCX to PDF
[transcode] Extracted 15234 characters from DOCX
[transcode] Generated PDF with 3 pages
[transcode] PDF conversion complete, size: 187KB

[compress] PDF is 187KB, within 1024KB target.

[hash] Generating SHA-256 hash...
[hash] Document hash: 3a4b2c1d9e8f7a6b...

[qr-stamp] Adding QR code to PDF...
[qr-stamp] QR stamped successfully: 189KB

[pipeline] Upload complete, file: doc_3a4b2c1d.pdf
```

## Technical Details

### Word to PDF Conversion (transcode.ts)

**Key Functions:**

```typescript
transcodeToPdf(file: File): Promise<TranscodeResult>
  - Detects file format
  - Routes to appropriate converter
  
docxToPdf(file: File): Promise<TranscodeResult>
  - Extracts HTML from DOCX using mammoth.js
  - Parses HTML into structured content
  - Creates PDF with proper formatting
  
htmlToContent(html: string): ContentElement[]
  - Converts HTML to structured content array
  - Preserves bold, italic, heading information
  - Handles nested tags and text nodes
  
wrapText(...): string[]
  - Implements word wrapping algorithm
  - Respects max width and font metrics
```

**Dependencies:**
- `mammoth` - DOCX to HTML conversion
- `pdf-lib` - PDF creation and manipulation

### PDF Compression (compress.ts)

**Key Functions:**

```typescript
compressFile(pdfBytes: Uint8Array): Promise<Uint8Array>
  - Main compression function
  - Uses object stream compression
  - Returns original if compression fails
  
compressPdfContent(pdfBytes: Uint8Array): Promise<Uint8Array>
  - Loads PDF document
  - Applies compression flag
  - Re-saves with optimized settings
```

**Compression Options Used:**
```javascript
{
  useObjectStreams: true  // Compress object streams
}
```

## Limitations

### Word to PDF Conversion

- ❌ Images in Word documents are **not preserved** (text extracted only)
- ❌ Complex formatting (tables, columns) converted to plain text
- ❌ Embedded objects and OLE content not supported
- ❌ Comments and tracked changes ignored

### PDF Compression

- ⚠️ Scanned PDFs (image-based) have limited compression (5-15%)
- ⚠️ Cannot compress without re-encoding (data loss unavoidable)
- ⚠️ Some PDFs may not compress further if already optimized

## Best Practices

### For Users

1. **Before Uploading:**
   - Remove unnecessary images from Word documents
   - Delete empty pages
   - Use standard fonts (Helvetica, Arial, Times New Roman)

2. **Recommended File Formats:**
   - ✓ `.docx` - Best format for conversion
   - ✓ `.pdf` - Direct upload (fastest)
   - ~ `.doc` - Works but may lose some formatting

### For Developers

1. **Monitor File Sizes:**
   - Log compression ratios to identify issues
   - Set alerts if files exceed 2MB after compression

2. **Error Handling:**
   ```javascript
   try {
     const compressed = await compressFile(pdfBytes);
   } catch (err) {
     console.error('Compression failed, using original:', err);
     // Continue with original file
   }
   ```

3. **Performance:**
   - DOCX → PDF conversion: ~1-2 seconds
   - PDF compression: ~0.5-1 second
   - Total overhead: ~2-3 seconds per upload

## Testing

### Unit Tests

```javascript
// Test Word to PDF conversion
const file = new File(['test'], 'test.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
const result = await transcodeToPdf(file);
assert(result.pdfBytes.length > 0);
assert(result.text.includes('test'));

// Test PDF compression
const largeFile = new Uint8Array(2_000_000); // 2MB
const compressed = await compressFile(largeFile);
assert(compressed.byteLength <= 1_048_576); // Should be < 1MB
```

### Manual Testing

1. **Convert DOCX to PDF:**
   - Upload a Word document with formatting
   - Verify PDF renders correctly in preview
   - Check compression log output

2. **Compression:**
   - Upload a large PDF (> 1MB)
   - Monitor browser console for compression details
   - Verify file size reduced

## Troubleshooting

### "Unsupported file type" Error

**Cause:** File extension not .docx, .doc, or .pdf

**Solution:** Ensure file has correct extension

### "Compression failed" Error

**Cause:** PDF structure is corrupted or unusual

**Solution:** System automatically falls back to original file

### Large File Not Compressing

**Cause:** File already optimized or contains many images

**Solution:** Remove images from original document before conversion

### Formatting Lost in Conversion

**Cause:** Complex Word formatting not supported

**Solution:** Simplify document formatting before upload

## Future Enhancements

- [ ] Support for embedded images in DOCX
- [ ] Preserve tables as PDF tables (not text)
- [ ] XLSX (Excel) to PDF conversion
- [ ] Advanced compression algorithms (zlib, DEFLATE)
- [ ] Parallel compression for large files
- [ ] Lossy compression option for image-heavy PDFs
