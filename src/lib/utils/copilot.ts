/**
 * Smart Copilot — Contextual Upload Assistant
 * 
 * Lightweight rule-based intelligence engine that provides personalized
 * upload guidance using cached teaching loads + submission history.
 * 
 * Optimization: Compressed JSON model (~10KB), 100% offline-compatible.
 * Local resource cost: 🟢 Low | Offline speed: ✅ Very Fast
 */

import copilotConfig from '../models/copilot_model.json';
import { predictSubject } from './fuzzyClassifier';

// ─── Types ───────────────────────────────────────────────────────────────────

export type SuggestionType = 'missing' | 'recommendation' | 'deadline' | 'duplicate' | 'tip' | 'mismatch';
export type SuggestionPriority = 'high' | 'medium' | 'low';

export interface CopilotSuggestion {
    id: string;
    type: SuggestionType;
    priority: SuggestionPriority;
    title: string;
    message: string;
    icon: string;
    /** Auto-fill action data */
    action?: {
        teachingLoadId?: string;
        weekNumber?: number;
        docType?: string;
        subject?: string;
    };
}

export interface CopilotContext {
    teachingLoads: { id: string; subject: string; grade_level: string }[];
    submissions: {
        teaching_load_id?: string;
        week_number?: number;
        doc_type?: string;
        compliance_status?: string;
        created_at?: string;
    }[];
    currentWeek?: number;
    selectedWeek?: number;
    selectedDocType?: string;
    selectedLoadId?: string;
    calendarDeadlines?: { week_number: number; deadline_date: string }[];
}

interface CopilotConfig {
    version: string;
    rules: {
        missing_threshold: number;
        deadline_warning_days: number;
        doc_types: string[];
        suggestion_limit: number;
        priority_weights: {
            missing: number;
            deadline: number;
            duplicate: number;
            recommendation: number;
            tip: number;
        };
    };
    templates: {
        missing: { title: string; message: string; icon: string };
        deadline: { title: string; message: string; icon: string };
        duplicate: { title: string; message: string; icon: string };
        recommendation: { title: string; message: string; icon: string };
        tip: { title: string; message: string; icon: string };
        mismatch: { title: string; message: string; icon: string };
    };
}

// ─── Engine ──────────────────────────────────────────────────────────────────

const config = copilotConfig as CopilotConfig;

/**
 * Analyze the current upload context and generate prioritized suggestions.
 * Runs entirely offline using cached data.
 */
export function analyzeCopilot(ctx: CopilotContext): CopilotSuggestion[] {
    const suggestions: CopilotSuggestion[] = [];
    let idCounter = 0;

    // 1. Missing Submission Detection
    suggestions.push(...detectMissing(ctx, idCounter));
    idCounter += suggestions.length;

    // 2. Deadline Proximity Warnings
    suggestions.push(...detectDeadlines(ctx, idCounter));
    idCounter = suggestions.length;

    // 3. Duplicate Prevention
    suggestions.push(...detectDuplicates(ctx, idCounter));
    idCounter = suggestions.length;

    // 4. Smart Recommendations
    suggestions.push(...generateRecommendations(ctx, idCounter));
    idCounter = suggestions.length;

    // 5. Mismatch Detection (Naive Bayes)
    suggestions.push(...detectMismatches(ctx, idCounter));
    idCounter = suggestions.length;

    // 6. Tips
    suggestions.push(...generateTips(ctx, idCounter));

    // Sort by priority weight
    const weights = {
        ...config.rules.priority_weights,
        mismatch: 10 // Highest priority
    };
    suggestions.sort((a, b) => {
        const wA = weights[a.type] || 0;
        const wB = weights[b.type] || 0;
        if (wA !== wB) return wB - wA;
        const pMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
        return (pMap[b.priority] || 0) - (pMap[a.priority] || 0);
    });

    return suggestions.slice(0, config.rules.suggestion_limit);
}

// ─── Detection Modules ───────────────────────────────────────────────────────

function detectMissing(ctx: CopilotContext, startId: number): CopilotSuggestion[] {
    const results: CopilotSuggestion[] = [];
    if (!ctx.currentWeek || ctx.teachingLoads.length === 0) return results;

    const docTypes = config.rules.doc_types;

    for (const load of ctx.teachingLoads) {
        for (let week = 1; week <= ctx.currentWeek; week++) {
            for (const docType of docTypes) {
                const exists = ctx.submissions.some(
                    s => s.teaching_load_id === load.id &&
                        s.week_number === week &&
                        s.doc_type === docType
                );

                if (!exists) {
                    results.push({
                        id: `missing_${startId + results.length}`,
                        type: 'missing',
                        priority: week === ctx.currentWeek ? 'high' : 'medium',
                        title: config.templates.missing.title,
                        message: config.templates.missing.message
                            .replace('{subject}', load.subject)
                            .replace('{grade}', load.grade_level)
                            .replace('{week}', String(week))
                            .replace('{docType}', docType),
                        icon: config.templates.missing.icon,
                        action: {
                            teachingLoadId: load.id,
                            weekNumber: week,
                            docType,
                            subject: load.subject
                        }
                    });
                }
            }
        }
    }

    // Only return the most recent missing items to avoid overwhelming
    return results.slice(-6);
}

function detectDeadlines(ctx: CopilotContext, startId: number): CopilotSuggestion[] {
    const results: CopilotSuggestion[] = [];
    if (!ctx.calendarDeadlines) return results;

    const now = new Date();
    const warningDays = config.rules.deadline_warning_days;

    for (const cal of ctx.calendarDeadlines) {
        const deadline = new Date(cal.deadline_date);
        const daysUntil = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

        if (daysUntil >= 0 && daysUntil <= warningDays) {
            const isUrgent = daysUntil <= 1;
            results.push({
                id: `deadline_${startId + results.length}`,
                type: 'deadline',
                priority: isUrgent ? 'high' : 'medium',
                title: config.templates.deadline.title,
                message: config.templates.deadline.message
                    .replace('{week}', String(cal.week_number))
                    .replace('{days}', daysUntil === 0 ? 'today' : `in ${daysUntil} day${daysUntil > 1 ? 's' : ''}`),
                icon: config.templates.deadline.icon,
                action: {
                    weekNumber: cal.week_number
                }
            });
        }
    }

    return results;
}

function detectDuplicates(ctx: CopilotContext, startId: number): CopilotSuggestion[] {
    const results: CopilotSuggestion[] = [];
    if (!ctx.selectedLoadId || !ctx.selectedWeek || !ctx.selectedDocType) return results;

    const existing = ctx.submissions.find(
        s => s.teaching_load_id === ctx.selectedLoadId &&
            s.week_number === ctx.selectedWeek &&
            s.doc_type === ctx.selectedDocType
    );

    if (existing) {
        results.push({
            id: `duplicate_${startId}`,
            type: 'duplicate',
            priority: 'high',
            title: config.templates.duplicate.title,
            message: config.templates.duplicate.message
                .replace('{docType}', ctx.selectedDocType)
                .replace('{week}', String(ctx.selectedWeek)),
            icon: config.templates.duplicate.icon
        });
    }

    return results;
}

function generateRecommendations(ctx: CopilotContext, startId: number): CopilotSuggestion[] {
    const results: CopilotSuggestion[] = [];
    if (ctx.teachingLoads.length === 0 || !ctx.currentWeek) return results;

    // Find the teaching load with the most missing submissions for the current week
    let bestLoad: typeof ctx.teachingLoads[0] | null = null;
    let maxMissing = 0;

    for (const load of ctx.teachingLoads) {
        const currentWeekSubs = ctx.submissions.filter(
            s => s.teaching_load_id === load.id && s.week_number === ctx.currentWeek
        );
        const missing = config.rules.doc_types.length - currentWeekSubs.length;
        if (missing > maxMissing) {
            maxMissing = missing;
            bestLoad = load;
        }
    }

    if (bestLoad && maxMissing > 0) {
        // Find which doc type is missing
        const existingTypes = ctx.submissions
            .filter(s => s.teaching_load_id === bestLoad!.id && s.week_number === ctx.currentWeek)
            .map(s => s.doc_type);
        const missingType = config.rules.doc_types.find(dt => !existingTypes.includes(dt)) || 'DLL';

        results.push({
            id: `rec_${startId}`,
            type: 'recommendation',
            priority: 'medium',
            title: config.templates.recommendation.title,
            message: config.templates.recommendation.message
                .replace('{subject}', bestLoad.subject)
                .replace('{grade}', bestLoad.grade_level)
                .replace('{docType}', missingType),
            icon: config.templates.recommendation.icon,
            action: {
                teachingLoadId: bestLoad.id,
                weekNumber: ctx.currentWeek,
                docType: missingType,
                subject: bestLoad.subject
            }
        });
    }

    return results;
}

function generateTips(ctx: CopilotContext, startId: number): CopilotSuggestion[] {
    const results: CopilotSuggestion[] = [];

    // Compliance streak tip
    if (ctx.submissions.length >= 3) {
        const recentSubs = [...ctx.submissions]
            .sort((a, b) => (b.week_number || 0) - (a.week_number || 0))
            .slice(0, 5);

        const allCompliant = recentSubs.every(s =>
            !s.compliance_status ||
            s.compliance_status === 'compliant' ||
            s.compliance_status === 'on-time'
        );

        if (allCompliant && recentSubs.length >= 3) {
            results.push({
                id: `tip_${startId}`,
                type: 'tip',
                priority: 'low',
                title: config.templates.tip.title,
                message: `You're on a ${recentSubs.length}-submission compliance streak! Keep it up.`,
                icon: config.templates.tip.icon
            });
        }
    }

    // Low submission count tip
    if (ctx.teachingLoads.length > 0 && ctx.submissions.length === 0) {
        results.push({
            id: `tip_${startId + 1}`,
            type: 'tip',
            priority: 'medium',
            title: 'Get Started',
            message: 'Upload your first document to begin building your compliance record.',
            icon: ''
        });
    }

    return results;
}

/**
 * Predict the best teaching load match based on OCR text using Naive Bayes.
 */
export function predictLoad(ocrText: string, teachingLoads: any[]): string | null {
    if (!ocrText || teachingLoads.length === 0) return null;

    const prediction = predictSubject(ocrText);
    if (!prediction.value || prediction.confidence < 40) return null;

    // Match prediction (e.g., "Mathematics") to teaching loads
    const match = teachingLoads.find(l =>
        l.subject.toLowerCase().includes(prediction.value!.toLowerCase()) ||
        prediction.value!.toLowerCase().includes(l.subject.toLowerCase())
    );

    return match ? match.id : null;
}

/**
 * Detect if the currently selected teaching load mismatches the document content.
 */
function detectMismatches(ctx: CopilotContext, startId: number): CopilotSuggestion[] {
    const results: CopilotSuggestion[] = [];
    if (!ctx.selectedLoadId || !ctx.teachingLoads.length) return results;

    // We only detect mismatches if metadata is available (mocking this with ocrText if it was in ctx)
    // For now, this will be called from the UI when OCR results are available.
    return results;
}

/**
 * Core validation logic for mismatch detection.
 */
export function validateSelection(selectedLoadId: string, ocrText: string, teachingLoads: any[]): CopilotSuggestion | null {
    const selectedLoad = teachingLoads.find(l => l.id === selectedLoadId);
    if (!selectedLoad || !ocrText) return null;

    const prediction = predictSubject(ocrText);
    if (!prediction.value || prediction.confidence < 60) return null;

    const isMatch = selectedLoad.subject.toLowerCase().includes(prediction.value.toLowerCase()) ||
        prediction.value.toLowerCase().includes(selectedLoad.subject.toLowerCase());

    if (!isMatch) {
        return {
            id: `mismatch_${Date.now()}`,
            type: 'mismatch',
            priority: 'high',
            title: 'Content Mismatch Detected',
            message: `This document looks like **${prediction.value}**, but you've selected **${selectedLoad.subject}**. Please verify.`,
            icon: '',
            action: {
                subject: prediction.value
            }
        };
    }

    return null;
}

/**
 * Get the appropriate color class for a suggestion type.
 */
export function getSuggestionColor(type: SuggestionType): { bg: string; text: string; border: string } {
    switch (type) {
        case 'missing': return { bg: 'bg-gov-red/5', text: 'text-gov-red', border: 'border-gov-red/15' };
        case 'deadline': return { bg: 'bg-gov-gold/5', text: 'text-gov-gold-dark', border: 'border-gov-gold/15' };
        case 'duplicate': return { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' };
        case 'recommendation': return { bg: 'bg-gov-blue/5', text: 'text-gov-blue', border: 'border-gov-blue/15' };
        case 'tip': return { bg: 'bg-gov-green/5', text: 'text-gov-green', border: 'border-gov-green/15' };
        case 'mismatch': return { bg: 'bg-gov-red/10', text: 'text-gov-red', border: 'border-gov-red/30' };
    }
}
