/** Return to the nearest teacher list in the same school, preserving its filters. */
export function returnToTeacherList<T extends { school: string; selectedTeacher: string | null; page: number }>(current: T, history: T[]) {
    for (let index = history.length - 1; index >= 0; index--) {
        const previous = history[index];
        if (previous.school === current.school && previous.selectedTeacher === null) {
            return { state: { ...previous }, history: history.slice(0, index) };
        }
    }
    return { state: { ...current, selectedTeacher: null, page: 1 }, history: [...history] };
}
