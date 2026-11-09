/** Both the review count and review list use the same saved upload records. */
export function pendingReviewUploads<T extends { id: string; user_id: string }>(
    uploads: T[], reviews: { submission_id: string }[], reviewerId?: string,
): T[] {
    const checked = new Set(reviews.map(review => review.submission_id));
    return uploads.filter(upload => upload.user_id !== reviewerId && !checked.has(upload.id));
}
