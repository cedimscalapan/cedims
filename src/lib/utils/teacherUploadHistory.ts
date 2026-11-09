export function uploadedDocumentsOldestFirst<T extends { id: string; file_path?: string | null; created_at?: string | null }>(items: T[]): T[] {
    const timestamp = (item: T) => Date.parse(item.created_at || '') || 0;
    return items.filter(item => !!item.file_path)
        .sort((a, b) => timestamp(a) - timestamp(b) || a.id.localeCompare(b.id));
}
