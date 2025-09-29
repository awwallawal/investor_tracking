# Epic 3: Interaction Logging & Lifecycle Tracking

**Goal:** This epic delivers the core "tracking" functionality of the system, which is a primary goal of the project. The objective is to provide staff with the tools to log every support interaction and to update a project's status within the official investment lifecycle. This delivers the value of creating a complete, auditable history of all activities, which is essential for institutional memory and reporting.

---

## Story 3.1: Interaction Log Data Model

*As a* System,
*I want* the database schema for the Interaction Log to be created,
*so that* a historical record of all support activities for a project can be stored.

**Acceptance Criteria:**
1.  An `InteractionLog` table/collection is created in the database.
2.  The schema includes fields for: a description of the interaction, the date it occurred, and the category of service provided (based on the OYSIPA framework).
3.  The schema links each log entry to a specific Investment Project and the Staff member who created it.

---

## Story 3.2: Log a Support Interaction

*As an* OYSIPA Staff Member,
*I want* to log a new support interaction for an investment project,
*so that* I can maintain a complete and auditable history of all assistance provided.

**Acceptance Criteria:**
1.  On the "Project Detail" page, a form is available to "Log a New Interaction".
2.  The form includes a multi-line text box for the interaction details and a dropdown to select the service category.
3.  Submitting the form successfully creates a new, timestamped interaction log associated with the current project and user.

---

## Story 3.3: View Project Interaction History

*As an* OYSIPA User,
*I want* to view the complete, time-ordered history of all logged interactions for a project,
*so that* I can quickly understand the full context and history of support provided.

**Acceptance Criteria:**
1.  On the "Project Detail" page, a section displays all interaction logs for that project.
2.  The logs are displayed in reverse chronological order (newest first).
3.  Each entry clearly shows the interaction description, date, service category, and the name of the staff member who logged it.

---

## Story 3.4: Update Project Lifecycle Stage

*As an* OYSIPA Staff Member,
*I want* to update the lifecycle stage of an investment project,
*so that* its status accurately reflects its current position in the official investment pipeline.

**Acceptance Criteria:**
1.  The "Project Detail" page clearly displays the project's current lifecycle stage.
2.  An "Update Stage" button or dropdown allows the user to select a new stage from a predefined list (matching the OYSIPA framework).
3.  Changing the stage updates the project's record in the database.
4.  A system-generated entry is automatically added to the interaction log, noting the stage change, the date, and the user who made the change.

---

## Story 3.5: Attach Document to Interaction Log

*As a* Staff Member,
*I want* to upload a document when I log an interaction,
*so that* I can attach supporting evidence like a scanned letter.

**Acceptance Criteria:**
1.  The "Log a New Interaction" form includes a file input field.
2.  The user can select a file (e.g., PDF, DOCX, JPG).
3.  Upon form submission, the file is securely uploaded to the designated file storage (Cloudinary).
4.  The URL of the uploaded file is saved with the interaction log record.
5.  The interaction log display shows a link to view or download the attached document.
