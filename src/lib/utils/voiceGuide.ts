/**
 * Voice-Guided Accessibility Utility (Web Speech API)
 * Innovative Feature: Phase 4.3 implementation.
 * "Grandparent UX" — provides spoken feedback for key actions without external dependencies.
 */

/**
 * Spoken feedback for UI actions. 
 * Respects user toggle preference stored in localStorage.
 */
export function speak(text: string, force = false) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // Check user preference (default: off)
    const enabled = localStorage.getItem('voice_guidance') === 'true';
    if (!enabled && !force) return;

    // Cancel any existing speech to avoid overlap
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95; // Slightly slower for better clarity in official environments
    utterance.pitch = 1;
    utterance.volume = 1;

    // Auto-detect language or default to English
    utterance.lang = 'en-US';

    window.speechSynthesis.speak(utterance);
}

/**
 * Toggle the voice guidance system.
 */
export function toggleVoiceGuidance(): boolean {
    if (typeof localStorage === 'undefined') return false;

    const current = localStorage.getItem('voice_guidance') === 'true';
    const newState = !current;
    localStorage.setItem('voice_guidance', newState.toString());

    if (newState) {
        speak("Voice guidance is now enabled. I will assist you with system actions.", true);
    } else {
        speak("Voice guidance disabled.", true);
    }

    return newState;
}

/**
 * Check if voice guidance is active.
 */
export function isVoiceEnabled(): boolean {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem('voice_guidance') === 'true';
}

/**
 * Convenience helper for common system events.
 */
export const VoicePrompts = {
    UPLOAD_START: "Uploading document. Please wait while we process and verify.",
    UPLOAD_COMPLETE: "Upload successful. Your document has been archived and verified.",
    VERIFIED: "Document authentic. Verification complete.",
    ERROR: "An error occurred. Please check your connection and try again.",
    LOGIN_WELCOME: (name: string) => `Welcome back ${name}. Your dashboard is ready.`
};
