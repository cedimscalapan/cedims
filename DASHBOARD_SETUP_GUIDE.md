# Dashboard Setup & Access Guide

## Quick Start

### Accessing the Dashboards
All roles access the same dashboard page with role-specific content:
```
URL: /dashboard/overview
```

The dashboard automatically detects your role and displays relevant data.

---

## What Each Role Sees

### 🏫 Teacher Dashboard
**Access:** `/dashboard/overview` (when logged in as Teacher)

**Key Sections:**
1. **Quick Stats** (4 cards)
   - Compliant Submissions
   - Late Submissions  
   - Missing Submissions
   - Compliance Rate (%)

2. **My Teaching Loads**
   - All active subjects and grade levels
   - Quick reference grid

3. **Upcoming Deadlines**
   - Next 5 weeks
   - Deadline dates
   - Week numbers

4. **Remarks from Supervisors**
   - Feedback on your submissions
   - Status badges (needs-check, approved, returned)
   - Reviewer name and comments

5. **My Recent Submissions**
   - Table of all DLL submissions
   - Sortable by: File Name, Type, Status, Date
   - Searchable
   - 10 items per page

---

### 👨‍🏫 Master Teacher Dashboard
**Access:** `/dashboard/overview` (when logged in as Master Teacher)

**Key Sections:**
1. **Quick Stats** (4 cards)
   - School compliance metrics
   - Your personal metrics
   - District compliance status

2. **School DLL Submission Status**
   - All teachers ranked by compliance rate
   - Shows: Compliant, Late, Missing counts
   - Progress bar visualization
   - Top 10 teachers displayed
   - Sortable by compliance rate

3. **My ISP/ISR Documents**
   - Your uploaded ISP/ISR files
   - Remarks from School Head and Supervisor
   - Sortable and searchable table
   - Status indicators

4. **School Teachers Overview**
   - Grid view of all school staff
   - Teachers and Master Teachers
   - Role badges
   - Up to 12 staff displayed

---

### 🏛️ School Head Dashboard
**Access:** `/dashboard/overview` (when logged in as School Head)

**Key Sections:**
1. **Quick Stats** (4 cards)
   - School-wide compliance metrics
   - Your ISP/ISR status
   - Staff performance overview

2. **School Staff**
   - All teachers and master teachers
   - Role indicators
   - Click for individual performance

3. **School DLL Submissions**
   - All teacher submissions in your school
   - Shows uploader, status, date
   - Sortable by all columns
   - Searchable
   - 10 items per page

4. **Master Teachers' ISP/ISR Documents**
   - All Master Teachers' uploaded plans
   - Shows remarks you've added
   - Sortable and searchable
   - Status tracking
   - 10 items per page

5. **My ISP/ISR Documents**
   - Your uploaded ISP/ISR files
   - Remarks from District Supervisor
   - Compliance status

---

### 📊 District Supervisor Dashboard
**Access:** `/dashboard/overview` (when logged in as District Supervisor)

**Key Sections:**
1. **Quick Stats** (4 cards)
   - District-wide compliance rate
   - Total submissions overview
   - At-risk items count
   - Performance trend

2. **School Compliance Metrics**
   - All schools ranked by compliance
   - Shows: Total, Compliant, Late, Missing
   - Progress bar for each school
   - % compliance rate
   - Sortable by rate (highest first)

3. **ISP/ISR Submissions (All Schools)**
   - All ISP/ISR from Master Teachers and School Heads
   - Shows school, uploader, status, date
   - Remarks you've added are visible
   - Sortable and searchable
   - 15 items per page
   - 200 most recent submissions

4. **Recent Submissions (All Types)**
   - DLL, ISP, ISR from entire district
   - Shows all submission types together
   - Sorted by most recent first
   - Searchable by file name
   - 15 items per page

---

## Features Overview

### 📊 Sorting
- Click column headers to sort
- Arrows indicate sort direction (↑ ascending, ↓ descending)
- Default: most recent first
- Available columns: File Name, Type, Status, Date, Compliance Rate

### 🔍 Searching
- Type in the search box to filter submissions
- Searches file names in real-time
- Case-insensitive
- Clears as you type
- Resets pagination to page 1

### 📄 Pagination
- Shows "Showing X-Y of Z files"
- Previous/Next buttons
- Page indicator (Page X / Y)
- Configurable items per page (10-15)
- Disabled when not needed

### 📍 Status Indicators
- **Green badge:** Compliant (on-time)
- **Gold/Orange badge:** Late (after deadline)
- **Red badge:** Missing (not submitted)
- **Blue badge:** Document type (DLL/ISP/ISR)

### 📈 Compliance Rate Visualization
- Progress bar showing percentage
- Numeric percentage displayed
- Green fill based on compliance rate
- Visual comparison across rows

---

## Data Refresh & Real-Time

### Auto-Refresh
- Dashboard checks for new submissions every few seconds
- Changes appear automatically
- Debounced to prevent excessive updates

### Manual Refresh
- F5 or Cmd+R to refresh the page
- Dashboard reloads all data

### What Triggers Updates
- New submissions uploaded
- Status changes (compliant → late)
- New remarks added
- Calendar changes

---

## Performance Tips

### For Teachers
- Dashboard loads in ~2-3 seconds
- Search filters instantly
- Pagination prevents slowness

### For Master Teachers
- School stats may take 3-5 seconds to load
- Sorting large school is fast (client-side)
- Lots of teachers? Use search to narrow down

### For School Heads
- School submissions load quickly
- Multiple tables may take 2-3 seconds total
- Search across teachers to find specific submissions

### For District Supervisors
- Most data-heavy dashboard
- Initial load may take 3-5 seconds
- School compliance table shows 30-50 schools
- Pagination recommended for large datasets
- Sorting is fast (client-side)

---

## Troubleshooting

### Dashboard Shows "Loading..."
**Fix:** Wait 3-5 seconds, then refresh the page

### Data Looks Stale
**Fix:** Press F5 to refresh, or wait for auto-refresh (30 seconds)

### Search Not Working
**Fix:** Make sure you're typing in the search box (cursor should be visible)

### Can't Sort a Column
**Fix:** Only certain columns are sortable (File Name, Type, Status, Date, Rate)

### "No submissions found"
**Fix:** You may not have any submissions yet, or search filter is too strict

### Wrong Role Displayed
**Fix:** Log out and log back in, or refresh the page (F5)

---

## Database Requirements

### Tables Needed
- `submissions` - Upload records
- `profiles` - User profiles (with role, school_id, district_id)
- `schools` - School information
- `teaching_loads` - Teacher workloads
- `academic_calendar` - Weeks and deadlines
- `dll_reviews` - Remarks and feedback

### Recommended Indexes
```sql
CREATE INDEX idx_submissions_user_id ON submissions(user_id);
CREATE INDEX idx_submissions_doc_type ON submissions(doc_type);
CREATE INDEX idx_submissions_compliance_status ON submissions(compliance_status);
CREATE INDEX idx_profiles_school_id ON profiles(school_id);
CREATE INDEX idx_profiles_district_id ON profiles(district_id);
```

---

## Customization Options

### Change Items Per Page
Edit `SubmissionTable.svelte`:
```typescript
itemsPerPage={10}  // Change to 15, 20, etc.
```

### Change Default Sort
Edit `+page.svelte`:
```typescript
let sortField = $state('created_at');  // Change to 'file_name', 'doc_type', etc.
let sortDir = $state<'asc' | 'desc'>('desc');  // Change to 'asc'
```

### Change Card Colors
Edit `DashboardCards.svelte` to modify variant colors:
```typescript
variantClasses = {
    success: 'bg-gov-green/10 border-gov-green/20 text-gov-green',
    // Modify colors as needed
}
```

### Add New Metrics
Edit `dashboardQueries.ts` to add new data fetching functions

---

## Upcoming Features

### Coming Soon
- 📈 Compliance trend charts
- 🎯 Advanced filtering (by type, date, status)
- 🔔 Real-time compliance alerts
- 📊 Weekly performance reports
- 📥 Export to Excel

### Planned
- 🌐 Mobile-optimized views
- ⌨️ Keyboard shortcuts
- 🎨 Customizable dashboards
- 📧 Email digest reports

---

## Support & Maintenance

### Monitoring
- Dashboard loads in < 5 seconds
- Queries execute in < 2 seconds  
- No errors in browser console

### Common Issues
- Large datasets slow the page → Reduce items per page
- Too many API calls → Check query optimization
- Real-time updates not working → Check Supabase connection

### Logs Location
- Browser console: F12 → Console tab
- Server logs: Check deployment platform logs
- Database logs: Check Supabase query logs

---

## Version History

**v1.0** - Initial release (2026-09-08)
- Teacher, Master Teacher, School Head, District Supervisor dashboards
- Sorting, searching, pagination
- Real-time updates
- Status indicators
- Compliance visualization

---

## Next Steps

1. **Test Each Role's Dashboard**
   - Log in as each role
   - Verify data accuracy
   - Test sorting, searching, pagination

2. **Optimize Performance**
   - Monitor query times
   - Check database indexes
   - Profile with large datasets

3. **Add Visualizations**
   - Implement trend charts
   - Add comparison charts
   - Create compliance graphs

4. **Deploy to Production**
   - Test on staging first
   - Monitor performance
   - Gather user feedback

---

## Questions?

Refer to: `ROLE_SPECIFIC_DASHBOARDS.md` for complete technical documentation
