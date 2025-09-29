# Epic 2: Investor & Project Management

**Goal:** This epic implements the heart of the CRM functionality. Its objective is to empower staff to create, manage, and maintain detailed records for both the investors and their specific investment projects. The value delivered is a centralized, structured repository of all core business data, replacing the fragmented system of spreadsheets and documents.

---

## Story 2.1: Investor Data Model

*As a* System,
*I want* the database schema for the Investor Profile to be created,
*so that* all necessary information about an investor can be stored in a structured way.

**Acceptance Criteria:**
1.  An `Investor` table/collection is created in the database.
2.  The schema includes fields for key investor details (e.g., Investor Name, Sector, Country of Origin, Company Registration Info, Key Contact Person).
3.  The schema includes a relationship to the `User` model to indicate which Staff member is assigned to this investor.

---

## Story 2.2: Create and View Investor Profiles

*As an* OYSIPA Staff Member,
*I want* to create a new investor profile and view a directory of all investors,
*so that* I can add new entities the agency is engaging with and easily find any investor in the system.

**Acceptance Criteria:**
1.  A main "Investor Directory" page is created that displays a searchable and sortable table of all investors.
2.  The page has a "Register New Investor" button that opens a form for data entry.
3.  Submitting the form successfully creates a new investor record in the database.
4.  Clicking on an investor in the directory navigates to a "Profile Detail" page showing all their information.

---

## Story 2.3: Edit and Assign Investor Profiles

*As an* OYSIPA Staff Member or Portal Administrator,
*I want* to edit the details of an investor and assign them to a staff member,
*so that* I can keep records accurate and ensure clear ownership.

**Acceptance Criteria:**
1.  An "Edit" button on the investor's "Profile Detail" page allows authorized users to update their information.
2.  A Portal Administrator can use a dropdown menu on the investor's profile to assign or re-assign a specific Staff member to that investor.
3.  The assigned staff member's name is clearly visible on the investor's profile.

---

## Story 2.4: Investment Project Data Model

*As a* System,
*I want* the database schema for Investment Projects to be created,
*so that* specific projects can be tracked and associated with their parent investor.

**Acceptance Criteria:**
1.  A `Project` table/collection is created in the database.
2.  The schema includes fields for key project details (e.g., Project Title, Description, Estimated Value, Location, current Lifecycle Stage).
3.  The schema establishes a clear relationship, linking each project to a single investor record.

---

## Story 2.5: Manage Investment Projects

*As an* OYSIPA Staff Member,
*I want* to add, view, and edit investment projects for an investor,
*so that* I can manage the specific ventures and initiatives related to them.

**Acceptance Criteria:**
1.  The investor's "Profile Detail" page has a dedicated section for listing their associated projects.
2.  An "Add New Project" feature is available on this page to create a new project linked to the current investor.
3.  Users can click on a project in the list to view and edit its details on a separate "Project Detail" page.
