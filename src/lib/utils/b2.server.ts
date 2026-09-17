import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

// Validate credentials
if (!env.B2_ENDPOINT || !env.B2_APPLICATION_KEY_ID || !env.B2_APPLICATION_KEY || !env.B2_BUCKET_NAME) {
    console.warn('[b2] Missing Backblaze B2 environment variables. Storage will fail until configured.');
}

const b2 = new S3Client({
    region: 'us-east-005', 
    endpoint: env.B2_ENDPOINT || 'https://s3.us-east-005.backblazeb2.com',
    forcePathStyle: false, // B2 requires virtual-hosted style for consistent CORS preflight resolution
    // B2 doesn't always support S3 checksums in pre-signed URLs
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: {
        accessKeyId: env.B2_APPLICATION_KEY_ID || '',
        secretAccessKey: env.B2_APPLICATION_KEY || '',
    },
});

/**
 * Generate a pre-signed URL for direct browser upload to B2.
 */
export async function getPresignedUploadUrl(key: string, contentType: string, expiresIn = 3600) {
    const command = new PutObjectCommand({
        Bucket: env.B2_BUCKET_NAME,
        Key: key,
        ContentType: contentType,
    });

    return await getSignedUrl(b2, command, { expiresIn });
}

/**
 * Generate a pre-signed URL for direct browser download from B2.
 */
export async function getPresignedDownloadUrl(key: string, expiresIn = 3600) {
    const command = new GetObjectCommand({
        Bucket: env.B2_BUCKET_NAME,
        Key: key,
    });

    return await getSignedUrl(b2, command, { expiresIn });
}

export const bucketName = env.B2_BUCKET_NAME;
