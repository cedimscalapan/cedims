# Role-Based Upload & Archive System Implementation

**Status:** In Progress  
**Last Updated:** 2026-09-08  
**Priority:** Critical

---

## Overview

This document outlines the complete implementation of role-based document uploads and management in CEDIMS. Each role has specific upload capabilities, visibility rules, and access controls.

---

## Role Permissions Matrix

### **UPLOAD CAPABILITIES**

| Role | DLL | ISP | ISR | Notes |
|------|-----|-----|-----|-------|
| **Teacher** | ✅ Requires Teaching Load | ❌ | ❌ | Upload own DLLs |
| **Master Teacher** | ✅ Requires Teaching Load | ✅ | ✅ | Upload DLLs + ISP/ISR |
| **School Head** | ❌ | ✅ | ✅ | Upload ISP/ISR only (school-level) |
| **District Supervisor** | ❌ | ❌ | ❌ | **NO UPLOADS** - View/remarks only |

### **DOCUMENT VISIBILITY**

#### **DLL (Daily Lesson Logs)**
- **Uploader Role:** Teacher or Master Teacher
- **Visible To:**
  - Self (uploader)
  - School Head (same school)
  - District Supervisor (same district)
  - Master Teacher (same school)

#### **Master Teacher ISP/ISR**
- **Uploader Role:** Master Teacher
- **Visible To:**
  - Self (uploader)
  - School Head (same school) - Can add remarks
  - District Supervisor (same district) - Can add remarks
- **NOT visible to:** Other teachers, other school heads, other districts

#### **School Head ISP/ISR**
- **Uploader Role:** School Head
- **Visible To:**
  - Self (uploader)
  - District Supervisor (same district) - Can add remarks
- **NOT visible to:** Teachers, Master Teachers, other school heads, other districts

### **REMARKS CAPABILITY**

| Document | Uploader | Can Add Remarks |
|----------|----------|-----------------|
| Master Teacher ISP/ISR | Master Teacher | School Head (same school) + District Supervisor |
| School Head ISP/ISR | School Head | District Supervisor only |
| DLL | Teacher/Master Teacher | School Head + District Supervisor |

---

## Implementation Tasks

### **Phase 1: Backend Permission Checks** ✅ DONE
- [x] Update `documentPermissions.ts` with role-based rules
- [x] Add visibility filters for each role
- [x] Add remarks authorization functions

### **Phase 2: Upload Page Fixes** ⏳ IN PROGRESS
- [ ] Add District Supervisor redirect (no uploads allowed)
- [ ] Fix "No teaching loads" error for non-DLL uploads
- [ ] Implement role-specific upload interfaces:
  - [ ] Teacher: DLL with teaching load picker
  - [ ] Master Teacher: DLL + ISP/ISR (teaching load only for DLL)
  - [ ] School Head: ISP/ISR only (no teaching load needed)
  - [ ] District Supervisor: Show message "Use Documents tab to review submissions"

### **Phase 3: Archive/View Page** ⏳ PENDING
- [ ] Implement role-specific filtering:
  - [ ] Teacher: Only own DLLs + School Head/District Supervisor remarks
  - [ ] Master Teacher: Own DLLs + ISP/ISR + remarks from School Head/Supervisor
  - [ ] School Head: Own ISP/ISR + own school's Master Teacher ISP/ISR + DLLs + Supervisor remarks
  - [ ] District Supervisor: All ISP/ISR from district + DLLs + ability to add remarks

- [ ] Add filtering UI:
  - [ ] Filter by document type
  - [ ] Filter by date range
  - [ ] Filter by teacher/uploader (School Head/Supervisor)
  - [ ] Sort by status, date, uploader name

### **Phase 4: Remarks Interface** ⏳ PENDING
- [ ] Create remarks modal/form:
  - [ ] Text input for remarks
  - [ ] Timestamp tracking
  - [ ] Remarks history view
  - [ ] Delete own remarks functionality
  
- [ ] Add remarks button visibility:
  - [ ] Only show for authorized roles
  - [ ] Button state based on permissions

### **Phase 5: Testing & Verification** ⏳ PENDING
- [ ] Test each role's upload capabilities
- [ ] Test document visibility per role
- [ ] Test remarks functionality
- [ ] Test offline sync with new role-specific logic
- [ ] Verify no errors in console

---

## File Modifications

### **Modified Files**
- `src/lib/utils/documentPermissions.ts` ✅ DONE
  - Updated role checks
  - Added visibility filters
  - Added remarks authorization

### **Files To Modify**
- `src/routes/dashboard/upload/+page.svelte`
  - Add District Supervisor redirect
  - Fix teaching load errors
  - Add role-specific UI logic

- `src/routes/dashboard/archive/+page.svelte`
  - Implement role-based filtering
  - Add remarks interface
  - Update visibility rules

### **New Components To Create**
- `src/lib/components/RemarksModal.svelte`
  - Form for adding remarks
  - Display remarks history

- `src/lib/components/DocumentFilter.svelte`
  - Role-specific filtering UI
  - Sort options

---

## Key Code Changes Needed

### **Upload Page Changes**

```typescript
// At the beginning of +page.svelte
$effect(() => {
    if ($profile) {
        // District Supervisors cannot upload
        if ($profile.role === 'District Supervisor') {
            // Redirect to archive/documents or show message
            goto('/dashboard/archive');
            addToast('info', 'District Supervisors use the Documents tab. Navigate there to review and add remarks to submissions.');
            return;
        }
        
        // Only fetch teaching loads for roles that need them
        if ($profile.role === 'Teacher' || $profile.role === 'Master Teacher') {
            // Fetch teaching loads
        } else if ($profile.role === 'School Head') {
            // Skip teaching load fetch - not needed for ISP/ISR
            teachingLoads = [];
        }
    }
});
```

### **Archive Page Changes**

```typescript
// Implement role-based filtering
function getVisibleDocuments(documents: Document[], role: string, userId: string, schoolId: string, districtId: string) {
    return documents.filter(doc => {
        // Use canViewUploadedISPISR from documentPermissions
        return canViewUploadedISPISR(
            role, userId, doc.uploaderId, doc.uploaderRole, doc.type,
            schoolId, doc.uploaderSchoolId, districtId, doc.uploaderDistrictId
        );
    });
}
```

---

## Database Query Examples

### **Get documents visible to School Head**

```sql
SELECT * FROM submissions
WHERE 
  -- Own ISP/ISR
  (user_id = $1 AND (doc_type = 'ISP' OR doc_type = 'ISR'))
  -- School's DLLs
  OR (school_id = $2 AND doc_type = 'DLL')
  -- School's Master Teachers' ISP/ISR
  OR (
    school_id = $2 
    AND (doc_type = 'ISP' OR doc_type = 'ISR')
    AND uploaded_by_role = 'Master Teacher'
  )
ORDER BY created_at DESC;
```

### **Get documents visible to District Supervisor**

```sql
SELECT * FROM submissions
WHERE 
  district_id = $1  -- All documents in their district
ORDER BY created_at DESC;
```

---

## UI Text Templates

### **For District Supervisor Upload Attempt**
```
"District Supervisors do not upload documents. 

To review submissions and add remarks:
- Go to the Documents tab
- View ISP/ISR from School Heads and Master Teachers
- Add remarks directly from the document view

Manage submissions for your entire district."
```

### **For School Head Upload (ISP/ISR)**
```
"Upload School Plan Documents

Individual School Plan (ISP)
Review and approve instructional strategies for your school.

Individual School Report (ISR)
Document school performance and improvements."
```

### **For Master Teacher Upload (ISP/ISR)**
```
"Upload Instructional Plans

Individual School Plan (ISP)
Share your teaching strategies and curriculum planning.

Individual School Report (ISR)
Report on instruction delivery and student outcomes."
```

---

## Testing Checklist

- [ ] **Teacher Role**
  - [ ] Can upload DLL (with teaching load)
  - [ ] Cannot upload ISP/ISR
  - [ ] Sees "No teaching loads" error only for DLL
  - [ ] Cannot see other teachers' documents
  - [ ] Can see remarks from School Head/Supervisor

- [ ] **Master Teacher Role**
  - [ ] Can upload DLL (with teaching load)
  - [ ] Can upload ISP/ISR (without teaching load)
  - [ ] Can see own ISP/ISR
  - [ ] Can see School Head's ISP/ISR (same school)
  - [ ] Can see remarks from School Head/Supervisor
  - [ ] Can see own school's DLLs
  - [ ] Cannot see other school Master Teachers' ISP/ISR

- [ ] **School Head Role**
  - [ ] Can upload ISP/ISR (no teaching load requirement)
  - [ ] Cannot upload DLL
  - [ ] Can see own ISP/ISR
  - [ ] Can see own school's Master Teacher ISP/ISR
  - [ ] Can see own school's DLLs
  - [ ] Can add remarks to Master Teacher ISP/ISR
  - [ ] Can see District Supervisor remarks
  - [ ] Cannot see other school's documents

- [ ] **District Supervisor Role**
  - [ ] Cannot upload anything (shown message)
  - [ ] Can see all ISP/ISR in district
  - [ ] Can see all DLLs in district
  - [ ] Can add remarks to any ISP/ISR
  - [ ] Can filter by school
  - [ ] Can filter by uploader (teacher/school head)
  - [ ] No "No teaching loads" error shown

---

## Status Tracking

| Task | Status | Assigned To | Due |
|------|--------|-------------|-----|
| Permission system | ✅ DONE | Claude | Done |
| Upload page fixes | ⏳ IN PROGRESS | Claude | Today |
| Archive filtering | ⏳ PENDING | Claude | Today |
| Remarks interface | ⏳ PENDING | Claude | Today |
| Testing | ⏳ PENDING | User | After impl |

---

## Notes

- All changes maintain backward compatibility with existing DLL uploads
- Offline sync works with new role-based system
- Server-side filtering should be implemented via database queries, not frontend filtering alone
- Consider adding audit logging for remarks for compliance

