import { json, error } from '@sveltejs/kit';
import { Buffer } from 'buffer';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '$env/dynamic/private';
import { supabase } from '$lib/utils/supabase';

const b2 = new S3Client({
    region: 'us-east-005',
    endpoint: env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
    forcePathStyle: false,
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
        accessKeyId: env.B2_APPLICATION_KEY_ID || '',
        secretAccessKey: env.B2_APPLICATION_KEY || '',
    },
});

export async function POST({ request }) {
    // 1. Authenticate with Supabase
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) throw error(401, 'Unauthorized');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
        console.error('[upload-api] Auth error:', authError);
        throw error(401, 'Unauthorized');
    }

    // 2. Parse FormData
    const formData = await request.formData();
    const file = formData.get('file');
    const key = formData.get('key');

    if (!file || !(file instanceof Blob)) throw error(400, 'Missing or invalid file');
    if (!key || typeof key !== 'string') throw error(400, 'Missing key');

    // Check size limit (Vercel Serverless Function limit is 4.5MB, we use 4.4MB to be safe)
    const MAX_SIZE = 4.4 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
        throw error(413, 'File exceeds the 4.2MB limit for server-side uploads. Please compress your PDF.');
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const command = new PutObjectCommand({
            Bucket: env.B2_BUCKET_NAME,
            Key: key,
            Body: buffer,
            ContentType: file.type || 'application/pdf',
        });

        await b2.send(command);
        console.log(`[upload-api] Successfully proxied upload for: ${key}`);
        
        return json({ success: true, key });
    } catch (err: any) {
        console.error('[upload-api] B2 Upload Error:', err);
        throw error(500, `Failed to proxy upload to cloud storage: ${err.message}`);
    }
}
