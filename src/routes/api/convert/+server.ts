import { json, error } from '@sveltejs/kit';
import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, mkdtempSync, readFileSync, rmdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import { supabase } from '$lib/utils/supabase';

async function findLibreOffice(): Promise<string | null> {
    const candidates = ['soffice', 'libreoffice', 'soffice.exe', 'libreoffice.exe'];
    for (const cmd of candidates) {
        try {
            execSync(`${cmd} --version`, { stdio: 'pipe', timeout: 5000 });
            return cmd;
        } catch { }
    }
    return null;
}

export async function POST({ request }) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw error(401, 'Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw error(401, 'Unauthorized');

    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) throw error(400, 'Missing or invalid file');

    const f = file as File;
    const ext = f.name?.split('.').pop()?.toLowerCase();
    if (!ext || !['doc', 'docx'].includes(ext)) {
        throw error(400, 'Only .doc and .docx files are supported');
    }

    const lo = await findLibreOffice();

    if (lo) {
        const tmpDir = mkdtempSync(join(tmpdir(), 'cedims-convert-'));
        const inputPath = join(tmpDir, `input.${ext}`);
        const outputPath = join(tmpDir, 'input.pdf');

        try {
            const buffer = Buffer.from(await file.arrayBuffer());
            writeFileSync(inputPath, buffer);
            execSync(`"${lo}" --headless --convert-to pdf "${inputPath}" --outdir "${tmpDir}"`, {
                stdio: 'pipe',
                timeout: 60000
            });
            const pdfBytes = readFileSync(outputPath);
            return new Response(pdfBytes, {
                headers: {
                    'Content-Type': 'application/pdf',
                    'Content-Disposition': `attachment; filename="${f.name.replace(/\.\w+$/, '.pdf')}"`
                }
            });
        } catch (err: any) {
            throw error(500, `LibreOffice conversion failed: ${err.message}`);
        } finally {
            try { unlinkSync(inputPath); } catch { }
            try { unlinkSync(outputPath); } catch { }
            try { rmdirSync(tmpDir); } catch { }
        }
    }

    const GAS_URL = publicEnv.PUBLIC_GOOGLE_SCRIPT_URL;
    if (!GAS_URL) {
        throw error(500, 'No conversion engine available. Install LibreOffice on the server or deploy a Google Apps Script and set PUBLIC_GOOGLE_SCRIPT_URL.');
    }

    try {
        const base64Data = Buffer.from(await file.arrayBuffer()).toString('base64');
        const response = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ fileName: f.name, base64Data })
        });
        if (!response.ok) throw new Error(response.statusText);
        const result = await response.json();
        if (!result.success) throw new Error(result.error);
        const pdfBytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
        return new Response(pdfBytes, {
            headers: { 'Content-Type': 'application/pdf' }
        });
    } catch (err: any) {
        throw error(500, `All conversion engines failed: ${err.message}`);
    }
}
