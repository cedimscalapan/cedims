import { env } from '$env/dynamic/public';

/**
 * Global Configuration
 * Centralizes environment variables and constants.
 */
export const config = {
    // Falls back from PUBLIC_APP_URL to the browser's origin, then to the production URL for server-side contexts.
    APP_URL: env.PUBLIC_APP_URL ||
        (typeof window !== 'undefined' ? window.location.origin : 'https://v0-s-evision.vercel.app'),
    HF_API_TOKEN: env.PUBLIC_HF_API_TOKEN || '',
    HF_MODEL_URL: env.PUBLIC_HF_MODEL_URL || 'https://router.huggingface.co/hf-inference/models/csebuetnlp/mT5_multilingual_XLSum',
    GOOGLE_SCRIPT_URL: (env as any).PUBLIC_GOOGLE_SCRIPT_URL || ''
};
