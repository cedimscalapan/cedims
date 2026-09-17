export type PipelinePhase = 'transcoding' | 'compressing' | 'analyzing' | 'hashing' | 'stamping' | 'uploading' | 'done' | 'error';

export interface PipelineEvent {
    phase: PipelinePhase;
    progress: number;
    message: string;
    result?: PipelineResult;
    metadata?: any;
    error?: string;
}

export interface PipelineResult {
    fileHash: string;
    filePath: string;
    fileSize: number;
    fileName: string;
}

export interface PipelineOptions {
    userId: string;
    docType?: string;
    weekNumber?: number;
    schoolYear?: string;
    subject?: string;
    calendarId?: string;
    teachingLoadId?: string;
    enforceOcr?: boolean;
    submissionWindowDays?: number;
    preDetectedMetadata?: any;
    rawText?: string;
    /**
     * Live byte-level progress for the transfer step. The pipeline is an async
     * generator, so it can't yield from inside an XHR progress callback — this
     * reports sub-phase progress directly to the caller instead, which is what
     * lets the bar move during the minutes-long transfer on a slow connection
     * rather than appearing frozen.
     */
    onTransferProgress?: (loaded: number, total: number) => void;
}