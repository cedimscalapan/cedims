export const DOCUMENT_LABELS: Record<string, string> = {
  DLL: 'Daily Lesson Plan',
  ISP: 'ISP — Instructional Supervisory Plan',
  ISR: 'ISR — Instructional Supervisory Report',
  Unknown: 'Unknown document'
};

export const DOCUMENT_FULL_NAMES: Record<string, string> = {
  DLL: 'Daily Lesson Plan',
  ISP: 'Instructional Supervisory Plan',
  ISR: 'Instructional Supervisory Report',
  Unknown: 'Unknown document'
};

export function getDocumentLabel(docType: string | null | undefined): string {
  if (!docType) return 'Unknown document';
  return DOCUMENT_LABELS[docType] || docType;
}

export function getDocumentFullName(docType: string | null | undefined): string {
  if (!docType) return 'Unknown document';
  return DOCUMENT_FULL_NAMES[docType] || docType;
}

export function formatDocumentList(docTypes: string[]): string {
  if (docTypes.length === 0) return 'no document types';
  const labels = docTypes.map(getDocumentLabel);
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
}
