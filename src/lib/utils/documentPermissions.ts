/**
 * CEDIMS Document Permissions System
 * ===================================
 *
 * UPLOAD PERMISSIONS:
 * - Teacher: DLL only (with teaching load)
 * - Master Teacher: DLL (with teaching load) + ISP/ISR
 * - School Head: ISP/ISR only
 * - District Supervisor: NONE (view/remarks only)
 *
 * ISP/ISR VISIBILITY:
 * - Master Teacher ISP/ISR:
 *   * Visible to: Self, District Supervisor (same district), School Head (same school)
 *   * Remarks by: School Head, District Supervisor
 *
 * - School Head ISP/ISR:
 *   * Visible to: Self, District Supervisor (same district)
 *   * Remarks by: District Supervisor only
 *
 * - DLL: Visible to all (existing rules)
 */

export function getAllowedUploadDocTypes(role: string): string[] {
  switch (role) {
    case 'Teacher':
      return ['DLL'];
    case 'Master Teacher':
      return ['DLL', 'ISP', 'ISR'];
    case 'School Head':
      return ['ISP', 'ISR'];
    case 'District Supervisor':
      return []; // District Supervisors do NOT upload
    default:
      return [];
  }
}

export function canUploadDocument(role: string, docType: string): boolean {
  return getAllowedUploadDocTypes(role).includes(docType);
}

export function requiresTeachingLoadSelection(role: string, docType: string): boolean {
  return (role === 'Teacher' || role === 'Master Teacher') && docType === 'DLL';
}

export function canViewArchivedDocument(role: string, docType: string): boolean {
  // DLL documents: visible to all roles who can access archive
  if (docType === 'DLL') {
    return role === 'Teacher' || role === 'Master Teacher' || role === 'School Head' || role === 'District Supervisor';
  }

  // ISP/ISR: special rules via canViewUploadedISPISR
  return false;
}

export function canAddRemarkToISPISR(
  role: string,
  docUploadedByRole: string,
  documentType: string
): boolean {
  // Master Teacher ISP/ISR: School Head and District Supervisor can add remarks
  if (docUploadedByRole === 'Master Teacher' && (documentType === 'ISP' || documentType === 'ISR')) {
    return role === 'School Head' || role === 'District Supervisor';
  }

  // School Head ISP/ISR: Only District Supervisor can add remarks
  if (docUploadedByRole === 'School Head' && (documentType === 'ISP' || documentType === 'ISR')) {
    return role === 'District Supervisor';
  }

  return false;
}

export function canAddReviewRemarks(role: string): boolean {
  // Master Teachers review DLLs alongside their School Head — that is the
  // instructional-supervision part of the role — so they can leave remarks
  // too. Scope is enforced by what each role can see rather than here: the
  // archive query restricts both Master Teacher and School Head to their own
  // school (profiles.school_id), so this only ever grants remarks on
  // documents from their own school.
  return role === 'Master Teacher' || role === 'School Head' || role === 'District Supervisor';
}

export function getUploadGuidance(role: string): string {
  switch (role) {
    case 'Teacher':
      return 'Teachers may upload Daily Lesson Logs (DLL) only.';
    case 'Master Teacher':
      return 'Master Teachers may upload Daily Lesson Logs (DLL), Individual School Plans (ISP), and Individual School Reports (ISR).';
    case 'School Head':
      return 'School Heads may upload Individual School Plans (ISP) and Individual School Reports (ISR) only.';
    case 'District Supervisor':
      return 'District Supervisors can view and manage ISP/ISR documents, but do not upload. Use the Archives tab to review submissions.';
    default:
      return 'Please sign in to continue.';
  }
}

/**
 * Check if a user can view an uploaded ISP/ISR document based on roles and location (school/district).
 *
 * VISIBILITY RULES:
 * - Master Teacher ISP/ISR:
 *   * Self (uploader)
 *   * District Supervisor (same district)
 *   * School Head (same school)
 *
 * - School Head ISP/ISR:
 *   * Self (uploader)
 *   * District Supervisor (same district)
 *
 * - District Supervisor can always view all ISP/ISR in their district
 */
export function canViewUploadedISPISR(
  currentUserRole: string,
  currentUserId: string,
  documentUploaderId: string,
  uploaderRole: string,
  documentType: string,
  currentUserSchoolId: string | null,
  uploaderSchoolId: string | null,
  currentUserDistrictId: string | null,
  uploaderDistrictId: string | null
): boolean {
  // Not ISP/ISR, use regular rules
  if (documentType !== 'ISP' && documentType !== 'ISR') {
    return canViewArchivedDocument(currentUserRole, documentType);
  }

  // Current user is the uploader (can always view own documents)
  if (currentUserId === documentUploaderId) {
    return true;
  }

  // Master Teacher ISP/ISR visibility
  if (uploaderRole === 'Master Teacher') {
    // District Supervisor from same district can view
    if (currentUserRole === 'District Supervisor' && currentUserDistrictId === uploaderDistrictId) {
      return true;
    }
    // School Head from same school can view
    if (currentUserRole === 'School Head' && currentUserSchoolId === uploaderSchoolId) {
      return true;
    }
  }

  // School Head ISP/ISR visibility
  if (uploaderRole === 'School Head') {
    // District Supervisor from same district can view
    if (currentUserRole === 'District Supervisor' && currentUserDistrictId === uploaderDistrictId) {
      return true;
    }
  }

  return false;
}

/**
 * Get documents visible to a specific user based on their role and location.
 * Used for filtering queries in the backend.
 */
export function getVisibleDocumentFilter(
  role: string,
  userId: string,
  schoolId: string | null,
  districtId: string | null
): { filterType: string; params: any } {
  if (role === 'Teacher') {
    return {
      filterType: 'teacher_dll',
      params: { userId }
    };
  }

  if (role === 'Master Teacher') {
    return {
      filterType: 'master_teacher',
      params: { userId, schoolId, districtId }
    };
  }

  if (role === 'School Head') {
    return {
      filterType: 'school_head',
      params: { userId, schoolId, districtId }
    };
  }

  if (role === 'District Supervisor') {
    return {
      filterType: 'district_supervisor',
      params: { districtId }
    };
  }

  return {
    filterType: 'none',
    params: {}
  };
}
