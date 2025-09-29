# Epic 1: Foundation & Core Platform Setup

**Goal:** This epic focuses on establishing the project's essential technical foundation. The objective is to create a running, secure, and testable application skeleton that includes the complete user model, a functioning authentication system, and a basic application shell with role-based navigation. The value delivered is a stable platform upon which all subsequent features can be built.

---

## Story 1.1: Project Initialization & Health Check

*As a* System Administrator,
*I want* the initial project structure, dependencies, and a basic health check endpoint to be created,
*so that* we have a verifiable, running application skeleton to build upon.

**Acceptance Criteria:**
1.  The project is initialized in a single Git repository (monorepo).
2.  The codebase is structured with separate directories for frontend and backend code.
3.  The backend service can be started and exposes a `/health` endpoint that returns a `200 OK` status.
4.  The frontend application can be started and displays a simple placeholder page (e.g., "Welcome to OYSIPA Investor Tracker").

---

## Story 1.2: User Model & Database Setup

*As a* System,
*I want* the database schema for the User model to be defined and created,
*so that* user information can be securely persisted for authentication and authorization.

**Acceptance Criteria:**
1.  A connection to the database is successfully configured and established.
2.  A `User` table/collection is created in the database with fields for at least: ID, name, email, password (hashed), and role (`Director-General`, `Portal Administrator`, `Staff`).
3.  A script or seeding process is created to initialize the database with the first Director-General user account.

---

## Story 1.3: User Authentication

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

## Story 1.4: Basic Application Shell & Role-Based Routing

*As an* OYSIPA User,
*I want* to see the main application layout and a navigation menu that is specific to my role,
*so that* I can only access the sections and features I am authorized to use.

**Acceptance Criteria:**
1.  Once logged in, a consistent application shell (e.g., with a header and side navigation bar) is displayed.
2.  The navigation menu dynamically displays links based on the user's role (e.g., a `Portal Administrator` sees a "User Management" link, while a `Staff` user does not).
3.  Users are prevented from accessing unauthorized pages by navigating directly to a URL.

---

## Story 1.5: User Management Interface

*As a* Portal Administrator,
*I want* to invite new users and revoke access for existing users,
*so that* I can manage the system's user base in accordance with staff changes.

**Acceptance Criteria:**
1.  A "User Management" page is available only to Portal Administrators and the Director-General.
2.  The page displays a list of all current users, their roles, and their status (e.g., Active/Invited/Revoked).
3.  An "Invite User" feature allows an admin to send a registration link to a new user's email address.
4.  A "Revoke Access" feature allows an admin to deactivate a user's account, preventing them from logging in.
