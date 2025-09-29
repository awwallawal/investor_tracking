# OYSIPA Investor Tracking System & CRM Product Requirements Document (PRD)

## 1. Goals and Background Context

### Goals

*   Increase operational efficiency by significantly reducing time spent on manual data entry and reporting.
*   Improve data integrity and security with a single, centralized, and auditable record of all investor interactions.
*   Enhance institutional memory by capturing all project knowledge within the system.
*   Strengthen reporting capabilities for leadership to generate comprehensive performance and compliance reports.
*   Achieve high user adoption within one month of launch.
*   Receive positive user feedback and high satisfaction scores.
*   Measure a reduction in time staff spend searching for information.

### Background Context

The Oyo State Investment Promotion Agency (OYSIPA) currently lacks a centralized tool for managing investor relations. Information is fragmented across spreadsheets, documents, and individual knowledge, leading to inefficient operations, a lack of visibility into investor history, and a risk of losing institutional memory. This makes it difficult to track performance and ensure consistent service delivery in line with the agency's framework. This project aims to solve that by creating a single source of truth.

### Change Log

| Date | Version | Description | Author |
| :--- | :--- | :--- | :--- |
| 2025-09-08 | 1.0 | Initial draft | John (PM) |

## 2. Requirements

### Functional

1.  **FR1:** The system must support a three-tier user model: Director-General, Portal Administrator, and Staff.
2.  **FR2:** The system must allow inviting new users and revoking access for existing users.
3.  **FR3:** A Portal Administrator must be able to assign investors and their projects to specific Staff members.
4.  **FR4:** The system must maintain a comprehensive audit trail of all significant actions (e.g., creation, updates, deletion of records).
5.  **FR5:** The system must provide full CRUD (Create, Read, Update, Delete) capabilities for Investor Profiles.
6.  **FR6:** The system must provide full CRUD (Create, Read, Update, Delete) capabilities for Investment Projects.
7.  **FR7:** The system must provide full CRUD (Create, Read, Update, Delete) capabilities for contacts associated with an investor.
8.  **FR8:** Users must be able to update a project's lifecycle status according to the OYSIPA framework.
9.  **FR9:** Users must be able to log all support interactions, categorizing them according to the defined services framework.
10. **FR10:** A personalized dashboard must be available for Staff, showing their assigned projects and upcoming actions.
11. **FR11:** A high-level oversight dashboard must be available for the Director-General, summarizing key metrics and project statuses.

### Non-Functional

1.  **NFR1:** The application must be a mobile-friendly, responsive web application accessible on modern desktops, tablets, and smartphones.
2.  **NFR2:** The system must be fast and responsive, with quick page loads and data retrieval to ensure an efficient user experience.
3.  **NFR3:** The system must enforce strict role-based access control to ensure data security.
4.  **NFR4:** All data must be handled in a manner compliant with relevant government data security standards.
5.  **NFR5:** The MVP, including all specified requirements, must be delivered within the 4-week timeline.
6.  **NFR6 (Reliability):** The system shall be available during standard business hours (9 AM - 5 PM, Monday-Friday). A target uptime of 99.5% during these hours is expected.
7.  **NFR7 (Reliability):** The application database must be backed up automatically on a daily basis, with backups retained for at least 30 days to ensure data recoverability.
8.  **NFR8 (Operations):** All services within the application must produce structured logs (e.g., in JSON format) to a centralized location to facilitate effective monitoring and debugging.
9.  **NFR9 (Operations):** Basic infrastructure and application health monitoring must be in place, tracking metrics such as CPU utilization, memory usage, and application error rates.

## 3. User Interface Design Goals

### Overall UX Vision

The overall user experience should be one of professional efficiency. The design will be clean, data-focused, and intuitive for internal government staff. The interface will prioritize clarity, ease of data entry, and quick access to information, reinforcing a sense of security and reliability.

### Key Interaction Paradigms

*   **Navigation:** A persistent, role-based navigation bar (e.g., a side menu) will provide access to the main sections of the application.
*   **Data Display:** Data-heavy sections like investor and project lists will be presented in sortable and filterable tables.
*   **Data Entry:** All data creation and editing will occur through clean, well-structured forms with clear validation.
*   **Dashboards:** Dashboards will utilize card-based widgets to present key information at a glance.

### Core Screens and Views

*   **Login Screen:** Secure user authentication.
*   **Main Dashboard:** A role-based landing page (Staff view vs. Director-General view).
*   **Investor Directory:** A searchable and filterable list of all investors.
*   **Investor/Project Detail View:** A comprehensive page showing all information for a single investor or project, including logged interactions.
*   **User Management:** An interface for Portal Administrators to invite and manage staff users.
*   **System Audit Log:** A view for administrators to review the audit trail.

### Accessibility: WCAG AA

To ensure the application is usable by people with disabilities, we will target compliance with the **Web Content Accessibility Guidelines (WCAG) 2.1 Level AA**.

### Branding

The application will incorporate the official OYSIPA branding (logo, color palette) if a style guide is provided. If not, a clean, professional, and modern design will be created, suitable for a government agency.

### Target Device and Platforms: Web Responsive

The application will be a responsive web app, ensuring a seamless and consistent experience across desktops, tablets, and smartphones.

## 4. Technical Assumptions

### Repository Structure: Monorepo

The project will be developed within a single repository (monorepo). This will simplify dependency management, streamline the build process, and make it easier for the development team to work across the entire codebase during the initial MVP phase.

### Service Architecture: Monolith

For the MVP, a monolithic service architecture is recommended. This approach, where the entire application is built as a single, unified unit, is the fastest and most straightforward way to develop and deploy the required features within the 4-week timeline. It avoids the overhead and complexity of a microservices architecture, which is not necessary for the initial scope.

### Testing Requirements: Unit + Integration

The testing strategy will focus on a combination of Unit and Integration tests. This provides a strong foundation of quality by ensuring individual components work as expected (Unit tests) and that they function correctly when combined (Integration tests). This is a pragmatic approach that balances testing rigor with development velocity for the MVP.

### Additional Technical Assumptions and Requests

*   The technology stack should be based on modern, well-supported, and open-source technologies to ensure long-term maintainability and ease of hiring.
*   The final choice of specific languages and frameworks (e.g., for the frontend, backend, and database) is deferred to the Architect, who will make a recommendation based on these requirements.

## 5. Epic List

1.  **Epic 1: Foundation & Core Platform Setup**
    *   **Goal:** Establish the project's technical foundation, including the user authentication system, role-based permissions, and the basic application structure required for all future feature development.

2.  **Epic 2: Investor & Project Management**
    *   **Goal:** Implement the core functionality for creating, viewing, editing, and managing investor profiles and their associated investment projects.

3.  **Epic 3: Interaction Logging & Lifecycle Tracking**
    *   **Goal:** Enable staff to log all support interactions with investors and to track and update a project's status through the official investment lifecycle stages.

4.  **Epic 4: Dashboards & Reporting Views**
    *   **Goal:** Provide the role-based dashboards that give Staff an actionable view of their assigned work and the Director-General a high-level overview of all agency activities.

## Epic 1: Foundation & Core Platform Setup

**Goal:** This epic focuses on establishing the project's essential technical foundation. The objective is to create a running, secure, and testable application skeleton that includes the complete user model, a functioning authentication system, and a basic application shell with role-based navigation. The value delivered is a stable platform upon which all subsequent features can be built.

---

### Story 1.1: Project Initialization & Health Check

*As a* System Administrator,
*I want* the initial project structure, dependencies, and a basic health check endpoint to be created,
*so that* we have a verifiable, running application skeleton to build upon.

**Acceptance Criteria:**
1.  The project is initialized in a single Git repository (monorepo).
2.  The codebase is structured with separate directories for frontend and backend code.
3.  The backend service can be started and exposes a `/health` endpoint that returns a `200 OK` status.
4.  The frontend application can be started and displays a simple placeholder page (e.g., "Welcome to OYSIPA Investor Tracker").

---

### Story 1.2: User Model & Database Setup

*As a* System,
*I want* the database schema for the User model to be defined and created,
*so that* user information can be securely persisted for authentication and authorization.

**Acceptance Criteria:**
1.  A connection to the database is successfully configured and established.
2.  A `User` table/collection is created in the database with fields for at least: ID, name, email, password (hashed), and role (`Director-General`, `Portal Administrator`, `Staff`).
3.  A script or seeding process is created to initialize the database with the first Director-General user account.

---

### Story 1.3: User Authentication

*As an* OYSIPA User,
*I want* to log in to the application securely with my email and password,
*so that* I can access the system's features.

**Acceptance Criteria:**
1.  A login page exists with fields for email and password.
2.  Users are successfully authenticated against the credentials stored in the database.
3.  A secure session or token is generated upon successful login.
4.  Users are shown a clear error message if authentication fails.
5.  A "Logout" button exists and successfully terminates the user's session.

---

### Story 1.4: Basic Application Shell & Role-Based Routing

*As an* OYSIPA User,
*I want* to see the main application layout and a navigation menu that is specific to my role,
*so that* I can only access the sections and features I am authorized to use.

**Acceptance Criteria:**
1.  Once logged in, a consistent application shell (e.g., with a header and side navigation bar) is displayed.
2.  The navigation menu dynamically displays links based on the user's role (e.g., a `Portal Administrator` sees a "User Management" link, while a `Staff` user does not).
3.  Users are prevented from accessing unauthorized pages by navigating directly to a URL.

---

### Story 1.5: User Management Interface

*As a* Portal Administrator,
*I want* to invite new users and revoke access for existing users,
*so that* I can manage the system's user base in accordance with staff changes.

**Acceptance Criteria:**
1.  A "User Management" page is available only to Portal Administrators and the Director-General.
2.  The page displays a list of all current users, their roles, and their status (e.g., Active/Invited/Revoked).
3.  An "Invite User" feature allows an admin to send a registration link to a new user's email address.
4.  A "Revoke Access" feature allows an admin to deactivate a user's account, preventing them from logging in.

## Epic 2: Investor & Project Management

**Goal:** This epic implements the heart of the CRM functionality. Its objective is to empower staff to create, manage, and maintain detailed records for both the investors and their specific investment projects. The value delivered is a centralized, structured repository of all core business data, replacing the fragmented system of spreadsheets and documents.

---

### Story 2.1: Investor Data Model

*As a* System,
*I want* the database schema for the Investor Profile to be created,
*so that* all necessary information about an investor can be stored in a structured way.

**Acceptance Criteria:**
1.  An `Investor` table/collection is created in the database.
2.  The schema includes fields for key investor details (e.g., Investor Name, Sector, Country of Origin, Company Registration Info, Key Contact Person).
3.  The schema includes a relationship to the `User` model to indicate which Staff member is assigned to this investor.

---

### Story 2.2: Create and View Investor Profiles

*As an* OYSIPA Staff Member,
*I want* to create a new investor profile and view a directory of all investors,
*so that* I can add new entities the agency is engaging with and easily find any investor in the system.

**Acceptance Criteria:**
1.  A main "Investor Directory" page is created that displays a searchable and sortable table of all investors.
2.  The page has a "Register New Investor" button that opens a form for data entry.
3.  Submitting the form successfully creates a new investor record in the database.
4.  Clicking on an investor in the directory navigates to a "Profile Detail" page showing all their information.

---

### Story 2.3: Edit and Assign Investor Profiles

*As an* OYSIPA Staff Member or Portal Administrator,
*I want* to edit the details of an investor and assign them to a staff member,
*so that* I can keep records accurate and ensure clear ownership.

**Acceptance Criteria:**
1.  An "Edit" button on the investor's "Profile Detail" page allows authorized users to update their information.
2.  A Portal Administrator can use a dropdown menu on the investor's profile to assign or re-assign a specific Staff member to that investor.
3.  The assigned staff member's name is clearly visible on the investor's profile.

---

### Story 2.4: Investment Project Data Model

*As a* System,
*I want* the database schema for Investment Projects to be created,
*so that* specific projects can be tracked and associated with their parent investor.

**Acceptance Criteria:**
1.  A `Project` table/collection is created in the database.
2.  The schema includes fields for key project details (e.g., Project Title, Description, Estimated Value, Location, current Lifecycle Stage).
3.  The schema establishes a clear relationship, linking each project to a single investor record.

---

### Story 2.5: Manage Investment Projects

*As an* OYSIPA Staff Member,
*I want* to add, view, and edit investment projects for an investor,
*so that* I can manage the specific ventures and initiatives related to them.

**Acceptance Criteria:**
1.  The investor's "Profile Detail" page has a dedicated section for listing their associated projects.
2.  An "Add New Project" feature is available on this page to create a new project linked to the current investor.
3.  Users can click on a project in the list to view and edit its details on a separate "Project Detail" page.

## Epic 3: Interaction Logging & Lifecycle Tracking

**Goal:** This epic delivers the core "tracking" functionality of the system, which is a primary goal of the project. The objective is to provide staff with the tools to log every support interaction and to update a project's status within the official investment lifecycle. This delivers the value of creating a complete, auditable history of all activities, which is essential for institutional memory and reporting.

---

### Story 3.1: Interaction Log Data Model

*As a* System,
*I want* the database schema for the Interaction Log to be created,
*so that* a historical record of all support activities for a project can be stored.

**Acceptance Criteria:**
1.  An `InteractionLog` table/collection is created in the database.
2.  The schema includes fields for: a description of the interaction, the date it occurred, and the category of service provided (based on the OYSIPA framework).
3.  The schema links each log entry to a specific Investment Project and the Staff member who created it.

---

### Story 3.2: Log a Support Interaction

*As an* OYSIPA Staff Member,
*I want* to log a new support interaction for an investment project,
*so that* I can maintain a complete and auditable history of all assistance provided.

**Acceptance Criteria:**
1.  On the "Project Detail" page, a form is available to "Log a New Interaction".
2.  The form includes a multi-line text box for the interaction details and a dropdown to select the service category.
3.  Submitting the form successfully creates a new, timestamped interaction log associated with the current project and user.

---

### Story 3.3: View Project Interaction History

*As an* OYSIPA User,
*I want* to view the complete, time-ordered history of all logged interactions for a project,
*so that* I can quickly understand the full context and history of support provided.

**Acceptance Criteria:**
1.  On the "Project Detail" page, a section displays all interaction logs for that project.
2.  The logs are displayed in reverse chronological order (newest first).
3.  Each entry clearly shows the interaction description, date, service category, and the name of the staff member who logged it.

---

### Story 3.4: Update Project Lifecycle Stage

*As an* OYSIPA Staff Member,
*I want* to update the lifecycle stage of an investment project,
*so that* its status accurately reflects its current position in the official investment pipeline.

**Acceptance Criteria:**
1.  The "Project Detail" page clearly displays the project's current lifecycle stage.
2.  An "Update Stage" button or dropdown allows the user to select a new stage from a predefined list (matching the OYSIPA framework).
3.  Changing the stage updates the project's record in the database.
4.  A system-generated entry is automatically added to the interaction log, noting the stage change, the date, and the user who made the change.

---

### Story 3.5: Attach Document to Interaction Log

*As a* Staff Member,
*I want* to upload a document when I log an interaction,
*so that* I can attach supporting evidence like a scanned letter.

**Acceptance Criteria:**
1.  The "Log a New Interaction" form includes a file input field.
2.  The user can select a file (e.g., PDF, DOCX, JPG).
3.  Upon form submission, the file is securely uploaded to the designated file storage (Cloudinary).
4.  The URL of the uploaded file is saved with the interaction log record.
5.  The interaction log display shows a link to view or download the attached document.

## Epic 4: Dashboards & Reporting Views

**Goal:** This epic is focused on data presentation and usability. The objective is to provide the primary user roles—Staff and the Director-General—with tailored dashboards that give them immediate, actionable insights into their work and the agency's performance. The value is in transforming the raw data we've captured into a clear, digestible, and role-appropriate format, which is the primary way users will experience the benefits of the system.

---

### Story 4.1: Staff Dashboard View

*As an* OYSIPA Staff Member,
*I want* to see a personalized dashboard of all projects assigned to me when I log in,
*so that* I can get an immediate overview of my workload and priorities.

**Acceptance Criteria:**
1.  The default landing page after a Staff member logs in is their personal dashboard.
2.  The dashboard displays a list or a series of cards representing all investment projects currently assigned to that user.
3.  Each item in the list shows key summary information (e.g., Investor Name, Project Title, Current Lifecycle Stage).
4.  Each item is a direct link to that project's "Project Detail" page.

---

### Story 4.2: Director-General (DG) KPI Dashboard

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

### Story 4.3: DG Dashboard Drill-Down

*As the* Director-General,
*I want* to be able to click on elements of my dashboard to see the underlying data,
*so that* I can investigate interesting metrics without having to manually search for the information.

**Acceptance Criteria:**
1.  The KPI widgets on the DG dashboard are interactive.
2.  For example, clicking on a segment of the "projects by lifecycle stage" chart navigates to a pre-filtered list showing all the projects currently in that stage.
3.  Clicking on the "total investors" widget navigates to the full Investor Directory.

## Epic 5: System Administration

**Goal:** To provide administrators with the tools to manage core system settings and configurations.

---

### Story 5.1: Manage Lifecycle Stages

*As a* Portal Administrator,
*I want* to create, view, edit, and re-order the system's lifecycle stages,
*so that* I can customize the investment pipeline to our agency's evolving process.

**Acceptance Criteria:**
1.  A new "Admin Settings" area is available to Portal Administrators.
2.  Within this area, a "Lifecycle Stages" page provides full CRUD functionality for the stages.
3.  The interface allows changing the order of the stages.
4.  The updated stages and their order are immediately reflected in the dropdown on the "Project Detail" page.

---

### Story 5.2: Send Periodic Investor Emails

*As a* Staff Member,
*I want* to send periodic emails to investors,
*so that* I can maintain engagement and provide updates.

**Acceptance Criteria:**
1. An admin interface exists to create and manage a library of email templates.
2. A feature exists on the investor page to select a template and send it to the investor's primary contact.
3. A record of the email being sent is automatically added to the investor's interaction log.
