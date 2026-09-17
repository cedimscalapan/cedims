# Analytics, School Monitor & District Monitor Implementation Guide

**Status:** Implemented  
**Last Updated:** 2026-09-08  
**Components:** Analytics Queries, Charts, Monitoring Pages

---

## Overview

Three comprehensive tabs for data analysis and real-time monitoring:

1. **Analytics Tab** - Deep data analysis with charts and k-means clustering
2. **School Monitor Tab** - (Planned) Real-time school performance tracking
3. **District Monitor Tab** - (Planned) District-wide oversight and alerts

---

## Analytics Tab (`/dashboard/analytics`)

### Who Can Access
- ✅ **School Head** - School-specific analytics
- ✅ **District Supervisor** - District-wide analytics
- ❌ **Teacher** - Not available
- ❌ **Master Teacher** - Not available

### Key Metrics (Top 4 Cards)

**School Head View:**
- Overall Compliance: School-wide compliance rate
- Compliant Submissions: Total on-time submissions
- At-Risk Entities: Teachers below 70% compliance
- Teachers: Total teachers in school

**District Supervisor View:**
- Overall Compliance: District-wide compliance rate
- Compliant Submissions: Total compliant in district
- At-Risk Entities: Schools/teachers below 70%
- Entities: Total schools or teachers

### Visualizations

#### 1. **Compliance Trend (Line Chart)**
- **Purpose:** Show compliance trends over time
- **X-Axis:** Weekly periods
- **Y-Axis:** Compliance rate (0-100%)
- **Data:** Historical compliance progression
- **Use Case:** Identify improvement or decline patterns

#### 2. **Compliance Forecast (Line Chart)**
- **Purpose:** Predict future compliance based on trends
- **Periods:** 4 weeks ahead
- **Method:** Linear trend extrapolation
- **Visual:** Dashed line for forecast data
- **Use Case:** Anticipate compliance issues before they occur

#### 3. **Document Type Breakdown (Donut Chart)**
- **Purpose:** Show distribution of DLL vs ISP vs ISR submissions
- **Series:** DLL (blue), ISP (green), ISR (gold)
- **Display:** Percentage and count
- **Use Case:** Understand document mix and balance

#### 4. **Weekly Submission Patterns (Bar Chart)**
- **Purpose:** Identify submission behavior by day
- **Categories:** Days of week (Mon-Sun)
- **Metric:** % of submissions by day
- **Use Case:** Identify peak submission days (likely Thursdays before Friday deadlines)

#### 5. **Performance Distribution (Scatter Plot - K-Means)**
- **Purpose:** Visualize teacher/school performance clustering
- **X-Axis:** Compliance Rate (0-100%)
- **Y-Axis:** Submission Frequency
- **Colors:** Risk levels (Green=Low, Gold=Medium, Red=High, Dark Red=Critical)
- **Clusters:** 
  - **Low Risk (Green):** 85%+ compliance
  - **Medium Risk (Gold):** 70-85% compliance  
  - **High Risk (Red):** 50-70% compliance
  - **Critical (Dark Red):** <50% compliance
- **Use Case:** Identify performance patterns and risk clustering

#### 6. **Performance Rankings (Horizontal Bar Chart)**
- **Purpose:** Rank teachers/schools by compliance
- **Top 15:** Shows top 15 performers
- **Color-Coded:** Green (85%+), Gold (70-85%), Red (<70%)
- **Sortable:** By compliance rate descending
- **Use Case:** Quick visibility into top and bottom performers

### Performance Clustering (K-Means Analysis)

**Three Clusters Generated:**

1. **High Performers Cluster**
   - Compliance rate: 85%+
   - Submission frequency: High
   - Count: Number of entities in this cluster
   - Display: Top 5 examples with names and rates

2. **Average Performers Cluster**
   - Compliance rate: 70-85%
   - Submission frequency: Medium
   - Count: Number of entities
   - Display: Top 5 examples

3. **At-Risk Cluster**
   - Compliance rate: <70%
   - Submission frequency: Variable
   - Count: Number of entities
   - Display: Top 5 examples with priority for intervention

### At-Risk Detail Table

**Columns:**
- Name (Teacher/School)
- Compliance Rate (with progress bar visualization)
- Risk Level (Critical/High/Medium)
- Total Submissions
- Breakdown (Green/Gold/Red - counts of compliant/late/missing)

**Sorting:** By compliance rate (lowest first)
**Pagination:** First 20 items shown
**Purpose:** Identify intervention priorities

### Data Processing Pipeline

```
Raw Submissions
    ↓
Generate Trend (by week)
    ↓
Forecast Future Trend (4 periods)
    ↓
Calculate Performance Metrics (by teacher/school)
    ↓
K-Means Clustering (3 clusters)
    ↓
Identify At-Risk (< 70%)
    ↓
Generate Rankings & Reports
```

### Performance Calculations

**For Each Teacher/School:**
- Compliance Rate = (Compliant / Total) × 100%
- Submission Frequency = Total submissions
- Risk Level = Based on compliance rate thresholds

**Clustering Algorithm:**
- Input: Compliance rate & submission frequency (normalized)
- Output: 3 clusters (Low/Medium/High risk)
- Method: K-means with distance-based assignment

---

## School Monitor Tab (`/dashboard/monitor/school`)

### Who Can Access
- ✅ **School Head** - Own school
- ✅ **District Supervisor** - All schools in district
- ❌ **Teacher** - Not available
- ❌ **Master Teacher** - Not available

### Real-Time Metrics

**Live Status Cards:**
- Current Compliance Rate (updates every 30s)
- Submissions This Week
- Overdue Count (live)
- On-Track Count

**Alert System:**
- Critical Alerts (missing deadlines, >5 days overdue)
- High Alerts (2-5 days overdue)
- Medium Alerts (1-2 days late)
- Auto-refresh on new submissions

### Teacher Submission Status Grid

**Display:**
- All teachers in school
- Current status (On Track / At Risk / Critical)
- Submissions this week
- Latest submission date
- Compliance rate

**Features:**
- Click for detailed view
- Color-coded status indicators
- Real-time updates

### Upcoming Deadlines

**Next 5 Weeks:**
- Week number
- Deadline date/time
- Days remaining
- Expected submissions count
- Overdue status

### Pending Submissions Queue

**Real-Time Pipeline:**
- Submissions awaiting processing
- File size
- Time submitted
- Status (Processing / Queued / Failed)
- Retry button for failures

### Quick Actions

- View submission details
- Add remarks/feedback
- Download/export report
- Filter by status
- Search by teacher name

---

## District Monitor Tab (`/dashboard/monitor/district`)

### Who Can Access
- ✅ **District Supervisor** - Full access
- ❌ **School Head** - Not available
- ❌ **Teacher** - Not available
- ❌ **Master Teacher** - Not available

### District-Wide Metrics

**Real-Time Dashboard:**
- District Compliance Rate (overall %)
- Total Submissions (this period)
- Schools On-Track (count)
- Schools At-Risk (count)
- Critical Alerts (count)
- Teachers Overdue (count)

### School Comparison Table

**Columns:**
- School Name
- Compliance Rate (%)
- Submissions This Week
- Overdue Count
- At-Risk Teachers
- Status (On-Track / Warning / Critical)

**Sorting:** By compliance rate or alert count
**Filtering:** By status, district
**Quick Actions:** View school details, zoom in

### Alert & Notification Center

**Alert Types:**

1. **Critical Alerts** (Immediate action needed)
   - 0 submissions 5+ days overdue
   - Teacher > 1 week late
   - School compliance < 50%

2. **High Priority** (Action needed today)
   - Submissions 3-5 days overdue
   - Multiple teachers overdue
   - School compliance 50-70%

3. **Medium Priority** (Monitor)
   - Submissions 1-2 days overdue
   - School compliance 70-85%

4. **Info** (FYI)
   - New submissions received
   - School compliance improved

**Features:**
- Real-time notifications
- Dismissible alerts
- Alert history
- Bulk actions

### Performance Heatmap

**Grid View:**
- Rows: Schools
- Columns: Weeks
- Colors: Compliance rate (Green to Red gradient)
- Hover: Detailed statistics

**Purpose:** Quick visual of performance patterns over time

### Compliance Timeline

**By Week:**
- Week number
- District compliance rate
- Top 3 best schools
- Top 3 worst schools
- Trend direction (↑ improving / → stable / ↓ declining)

### Alerts & Incidents Log

**Chronological List:**
- Alert date/time
- Type (Critical/High/Medium/Info)
- School affected
- Teacher affected
- Status (Open / Acknowledged / Resolved)
- Assignee (supervisor)

**Features:**
- Filter by type, school, status
- Acknowledge/resolve
- Add notes
- Assign to team member
- Export log

---

## Chart Components

### LineChart Component
- **Use:** Trends over time
- **Features:**
  - Multiple series support
  - Grid lines and labels
  - Legend
  - Hover tooltips
  - Responsive scaling
- **Data Points:** Period, rate, optional forecasted flag
- **Customization:** Height, colors, series selection

### BarChart Component
- **Use:** Category comparison
- **Features:**
  - Horizontal bars
  - Scrollable for many items
  - Color-coded by category
  - Value labels
  - Responsive height
- **Data Points:** Label, value, color
- **Customization:** Max value, show/hide values

### DonutChart Component
- **Use:** Proportion/breakdown
- **Features:**
  - Inner & outer radius adjustable
  - Legend with percentages
  - Hover effects
  - Slice labels
  - Total display
- **Data Points:** Label, value, color
- **Customization:** Radius sizes

### ScatterPlot Component
- **Use:** K-means clustering visualization
- **Features:**
  - X/Y axes with scales
  - Color-coded by risk level
  - Quadrant labels
  - Cluster summary stats
  - Responsive sizing
- **Data Points:** Name, compliance_rate, submission_frequency, risk_level
- **Customization:** Width, height

---

## Data Queries

### School Head Analytics
```typescript
getSchoolHeadAnalytics(schoolId, districtId)
Returns: {
  complianceTrend: [],
  teacherPerformance: [],
  weeklyBreakdown: [],
  docTypeStats: [],
  atRiskTeachers: []
}
```

### District Supervisor Analytics
```typescript
getDistrictSupervisorAnalytics(districtId)
Returns: {
  complianceTrend: [],
  schoolPerformance: [],
  teacherDistribution: [],
  weeklyBreakdown: [],
  docTypeStats: [],
  alerts: []
}
```

### Analytics Processing Functions
- `generateComplianceTrend()` - Weekly/monthly trends
- `getPerformanceDistribution()` - Per entity metrics
- `kMeansClusterPerformance()` - 3-way clustering
- `getDocumentTypeAnalysis()` - Doc type breakdown
- `getAtRiskEntities()` - Below threshold filter
- `forecastCompliance()` - Future predictions
- `getWeeklyPatterns()` - Day-of-week analysis
- `getComparisonMetrics()` - Best/average/worst

---

## Data Handling & Performance

### Query Optimization
- Parallel fetching with Promise.all()
- Specific field selection
- Limited result sets (300-1000 records)
- Indexed queries on school_id, district_id

### Visualization Efficiency
- SVG-based charts (lightweight)
- Client-side data processing
- Lazy loading for large datasets
- Debounced updates

### Real-Time Updates
- WebSocket subscriptions to submissions
- 500ms debounce on refresh
- Selective reload of affected data
- Toast notifications for alerts

---

## Use Cases & Best Practices

### School Head Use Cases
1. **Weekly Performance Review**
   - Check analytics
   - Identify at-risk teachers
   - Plan interventions

2. **Teacher Feedback**
   - Use performance rankings
   - Understand patterns (K-means)
   - Set compliance goals

3. **Resource Planning**
   - Identify high performers for mentoring
   - Allocate support to at-risk teachers

### District Supervisor Use Cases
1. **Strategic Oversight**
   - Compare school performance
   - Identify system-wide trends
   - Benchmark best practices

2. **Compliance Monitoring**
   - Track district compliance rate
   - Alert on critical issues
   - Follow up on at-risk schools

3. **Resource Allocation**
   - Support lowest-performing schools
   - Scale best practices from top schools
   - Plan professional development

---

## K-Means Clustering Explained

### Why K-Means?
- Simple, efficient algorithm
- Separates data into natural groups
- Identifies high/average/at-risk automatically
- Scales well with large datasets

### How It Works
1. **Normalize Data:** Compliance rate and frequency (0-1 scale)
2. **Initialize Centroids:** 3 cluster centers (low/medium/high)
3. **Assign Points:** Each entity to nearest centroid
4. **Calculate Distance:** Using Euclidean distance
5. **Output Clusters:** 3 groups with statistics

### Interpretation
- **High Risk (Red):** Low compliance, may need intervention
- **Average (Gold):** Moderate performance, monitor
- **Low Risk (Green):** Strong compliance, model for others

---

## Future Enhancements

### Phase 1 (Current)
- ✅ Compliance trends
- ✅ K-means clustering
- ✅ At-risk identification
- ✅ Performance rankings

### Phase 2 (Planned)
- [ ] School Monitor dashboard
- [ ] Real-time alert system
- [ ] Submission queue tracking
- [ ] Teacher status grid

### Phase 3 (Planned)
- [ ] District Monitor dashboard
- [ ] Multi-school comparison
- [ ] Incident tracking
- [ ] Alerts & notifications

### Phase 4 (Planned)
- [ ] Predictive compliance modeling
- [ ] Anomaly detection
- [ ] Recommendation engine
- [ ] Automated alerts

---

## Testing Checklist

### Analytics Tab
- [ ] School Head sees school-only data
- [ ] District Supervisor sees all district data
- [ ] Charts render with data
- [ ] K-means clustering produces 3 groups
- [ ] At-risk list is accurate
- [ ] Forecasting shows future trend
- [ ] Sorting/filtering work
- [ ] Responsive on mobile

### Monitor Tabs
- [ ] Real-time updates work
- [ ] Alerts trigger correctly
- [ ] Notifications show
- [ ] Status indicators accurate
- [ ] Search/filter functional
- [ ] Performance acceptable with 100s records

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Analytics load | < 3 seconds |
| Chart render | < 500ms |
| K-means clustering | < 200ms |
| Real-time update | < 1 second |
| Alert notification | Real-time |
| Search filter | < 150ms |

---

## Architecture

```
Analytics Page
├── Data Fetching (parallel queries)
├── Data Processing
│   ├── Trend generation
│   ├── K-means clustering
│   ├── At-risk identification
│   └── Forecast calculation
├── Chart Components
│   ├── LineChart
│   ├── BarChart
│   ├── DonutChart
│   └── ScatterPlot
└── Dashboard Assembly

Monitor Pages
├── Real-Time Data Stream
├── Alert System
├── Status Grid
├── Queue Display
└── Action Controls
```

---

## Notes

- All charts use SVG for performance
- K-means uses normalized Euclidean distance
- Forecasting uses linear trend extrapolation
- At-risk threshold is configurable (default 70%)
- Real-time updates debounced to prevent flicker
- All timestamps in user's local timezone
- Data cached offline for monitor tabs
