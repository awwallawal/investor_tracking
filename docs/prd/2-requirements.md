# 2. Requirements

## Functional

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

## Non-Functional

1.  **NFR1:** The application must be a mobile-friendly, responsive web application accessible on modern desktops, tablets, and smartphones.
2.  **NFR2:** The system must be fast and responsive, with quick page loads and data retrieval to ensure an efficient user experience.
3.  **NFR3:** The system must enforce strict role-based access control to ensure data security.
4.  **NFR4:** All data must be handled in a manner compliant with relevant government data security standards.
5.  **NFR5:** The MVP, including all specified requirements, must be delivered within the 4-week timeline.
6.  **NFR6 (Reliability):** The system shall be available during standard business hours (9 AM - 5 PM, Monday-Friday). A target uptime of 99.5% during these hours is expected.
7.  **NFR7 (Reliability):** The application database must be backed up automatically on a daily basis, with backups retained for at least 30 days to ensure data recoverability.
8.  **NFR8 (Operations):** All services within the application must produce structured logs (e.g., in JSON format) to a centralized location to facilitate effective monitoring and debugging.
9.  **NFR9 (Operations):** Basic infrastructure and application health monitoring must be in place, tracking metrics such as CPU utilization, memory usage, and application error rates.
