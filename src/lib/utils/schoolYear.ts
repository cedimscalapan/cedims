export function getCurrentSchoolYear(): string {
    const now = new Date();
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();

    // Philippine school year runs June to May.
    // June–December: current year → next year. January–May: previous year → current year.
    const startYear = month >= 6 ? year : year - 1;
    return `${startYear}-${startYear + 1}`;
}