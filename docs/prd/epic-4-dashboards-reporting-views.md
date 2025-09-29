# Epic 4: Dashboards & Reporting Views

**Goal:** This epic is focused on data presentation and usability. The objective is to provide the primary user roles—Staff and the Director-General—with tailored dashboards that give them immediate, actionable insights into their work and the agency's performance. The value is in transforming the raw data we've captured into a clear, digestible, and role-appropriate format, which is the primary way users will experience the benefits of the system.

---

## Story 4.1: Staff Dashboard View

*As an* OYSIPA Staff Member,
*I want* to see a personalized dashboard of all projects assigned to me when I log in,
*so that* I can get an immediate overview of my workload and priorities.

**Acceptance Criteria:**
1.  The default landing page after a Staff member logs in is their personal dashboard.
2.  The dashboard displays a list or a series of cards representing all investment projects currently assigned to that user.
3.  Each item in the list shows key summary information (e.g., Investor Name, Project Title, Current Lifecycle Stage).
4.  Each item is a direct link to that project's "Project Detail" page.

---

## Story 4.2: Director-General (DG) KPI Dashboard

*As the* Director-General,
*I want* to see a high-level dashboard with key performance indicators (KPIs) for the entire agency,
*so that* I can have a quick, strategic overview of all investment promotion activities.

**Acceptance Criteria:**
1.  The default landing page after the Director-General logs in is the high-level oversight dashboard.
2.  The dashboard displays several KPI widgets, including at a minimum:
    *   A count of the total number of investors.
    *   A count of the total number of active projects.
    *   A chart or summary showing the number of projects in each lifecycle stage.
    *   A count of total support interactions logged across the agency in the last 30 days.

---

## Story 4.3: DG Dashboard Drill-Down

*As the* Director-General,
*I want* to be able to click on elements of my dashboard to see the underlying data,
*so that* I can investigate interesting metrics without having to manually search for the information.

**Acceptance Criteria:**
1.  The KPI widgets on the DG dashboard are interactive.
2.  For example, clicking on a segment of the "projects by lifecycle stage" chart navigates to a pre-filtered list showing all the projects currently in that stage.
3.  Clicking on the "total investors" widget navigates to the full Investor Directory.
