# Project Brief: OYSIPA Investor Tracking System & CRM

## 1. Executive Summary

This project will create an internal, mobile-friendly web application for the Oyo State Investment Promotion Agency (OYSIPA) to serve as a comprehensive Investor Tracking System and CRM. The primary problem it solves is the lack of a centralized system to manage investor data, track interactions, and build institutional memory. The target users are the internal staff of OYSIPA, including the Director-General, Portal Administrators, and general Staff. The key value proposition is to provide a single, secure source of truth for investor and project information, enabling streamlined tracking of all support activities in line with the agency's official services framework.

## 2. Problem Statement

Currently, the Oyo State Investment Promotion Agency (OYSIPA) lacks a centralized and systematic tool for managing investor relations and tracking project lifecycles. Critical information is likely fragmented across various documents, spreadsheets, and the institutional knowledge of individual staff members. This fragmentation leads to several pain points: a lack of visibility into the full history of investor interactions, a risk of losing crucial institutional memory when personnel changes occur, and potential inconsistencies in service delivery.

The impact of this is reduced operational efficiency and difficulty in generating comprehensive reports to demonstrate the agency's performance and compliance with its services framework. Existing generic CRM or database solutions are insufficient as they are not tailored to the unique stages of investment promotion or the specific requirements of the OYSIPA services framework. The urgent 4-week timeline for this project underscores the critical need to implement a robust, secure, and auditable system that will professionalize the agency's core operations and enhance its ability to attract and retain investment for the state.

## 3. Proposed Solution

The proposed solution is a custom-built, internal web application designed specifically for OYSIPA's needs, serving as a unified Investor Tracking System and CRM. The application will be secure, mobile-friendly, and responsive for use on any platform.

The key differentiator is that this system will be purpose-built around OYSIPA's official Investor Services Framework and the defined investment lifecycle stages. Unlike a generic CRM, its data structure and workflows will be tailored to the agency's exact operational processes. This bespoke approach, which includes a role-based access model (DG, Portal Administrator, Staff), investor assignment capabilities, and a full audit trail, will ensure it meets the specific security and operational needs of a government agency.

The high-level vision is to empower the OYSIPA team with a single source of truth, enabling more efficient and proactive investor engagement, preserving institutional memory, and providing leadership with a clear, 360-degree view of all investment promotion activities.

## 4. Target Users

### Primary User Segment: OYSIPA Staff

**Profile:** Staff members of the Oyo State Investment Promotion Agency who are responsible for the day-to-day execution of investment promotion, facilitation, and aftercare services.

**Current Workflow:** These users currently rely on a combination of emails, personal notes, and spreadsheets to manage their assigned investors and projects. This manual process makes it challenging to maintain a complete history of interactions and to collaborate effectively on large projects.

**Needs and Goals:** Their primary need is a single, clear view of their assigned projects, including the current status, a full history of interactions, and the next required action for each. Their goal is to spend less time on manual tracking and reporting, and more time providing high-quality, consistent support to investors, ultimately helping them move projects successfully through the investment lifecycle.

### Secondary User Segment: Portal Administrator

**Profile:** A trusted staff member appointed by the Director-General to manage the operational aspects of the application.

**Current Workflow:** This is a new role necessitated by the creation of the system. There is no direct current equivalent.

**Needs and Goals:** This user needs simple but powerful tools to manage the system's user base, including inviting new staff members and revoking access when necessary. A key part of their workflow will be assigning investors and their projects to specific staff members to ensure clear ownership. Their primary goal is to ensure the smooth and secure operation of the platform, maintain data integrity, and facilitate an efficient distribution of work.

### User Segment: Director-General (DG)

**Profile:** The executive head of the Oyo State Investment Promotion Agency (OYSIPA).

**Current Workflow:** The DG currently relies on manually compiled reports and updates from various staff members, which can be time-consuming to gather and may not provide a complete, real-time picture of the agency's operations.

**Needs and Goals:** The DG needs a high-level, 360-degree dashboard view of all investment activities, key performance indicators, and project statuses. They need to be able to quickly understand the overall pipeline and the agency's performance without delving into the day-to-day operational details. Their goal is to use the system for strategic oversight, informed decision-making, and reporting to external government stakeholders. They also require the top-level administrative ability to manage the system's Portal Administrators.

## 5. Goals & Success Metrics

**Business Objectives**
*   To increase operational efficiency by significantly reducing the time staff spend on manual data entry and reporting.
*   To improve data integrity and security by creating a single, centralized, and auditable record of all investor interactions.
*   To enhance institutional memory by ensuring all project knowledge is captured within the system, preventing data loss due to staff turnover.
*   To strengthen reporting capabilities, allowing leadership to generate comprehensive performance and compliance reports quickly.

**User Success Metrics**
*   High adoption rate, with all relevant staff actively using the system for their daily investor tracking tasks within one month of launch.
*   Positive user feedback, indicated by high satisfaction scores in staff surveys.
*   A measurable reduction in the time staff spend searching for information and compiling manual reports.

**Key Performance Indicators (KPIs)**
*   **Daily/Weekly Active Users:** To measure system adoption and engagement.
*   **Number of Interaction Logs:** To track the volume of support being provided.
*   **Frequency of Project Status Updates:** To ensure projects are being actively managed.

## 6. MVP Scope

**Core Features (Must-Haves for MVP)**

*   **User & Permissions System:** A three-tier user model (Director-General, Portal Administrator, Staff) with an invite/revoke system, assignment capabilities, and a full audit trail.
*   **Investor & Project Management:** Full capabilities to create, view, and edit Investor Profiles and Investment Projects with all the detailed fields we defined.
*   **Contact Management:** Full capabilities to create, view, and edit contact information for investor representatives.
*   **Lifecycle & Interaction Tracking:** The ability to update a project's lifecycle status and to log all support interactions according to the detailed, four-category services framework.
*   **Dashboards:** A personalized dashboard for Staff to view their assigned projects and next actions, and a high-level oversight dashboard for the Director-General.

**Out of Scope for MVP**

To ensure focus on the core features within the timeline, the following will be considered for future phases and are not part of the initial 4-week MVP:
*   Advanced analytics and predictive forecasting.
*   A public-facing portal for investors to log in directly.
*   Bulk data import/export from spreadsheets.
*   Direct integration with other external government software systems.

**MVP Success Criteria**

The MVP will be considered a success when all the 'Core Features' listed above are delivered and fully functional, enabling the OYSIPA team to perform all their essential investor tracking, management, and logging activities exclusively within the new system.

## 7. Post-MVP Vision

**Phase 2 Features**
After the successful launch and adoption of the MVP, the next logical steps would be to introduce features that enhance efficiency and intelligence, such as:
*   **Bulk Data Management:** Tools to import and export data from spreadsheets, which would be especially useful for initial data migration.
*   **Advanced Analytics:** Dashboards with more advanced analytics and visualizations to help leadership identify trends and opportunities.

**Long-term Vision**
In the long term, the system could evolve from an internal tracking tool into the central intelligence hub for all investment promotion activities in Oyo State. It could potentially integrate with other government systems to create a seamless flow of data and provide even deeper insights for strategic planning.

**Expansion Opportunities**
A major future expansion could be the development of a secure, public-facing portal. This would allow investors to log in directly to track the status of their applications and interact with the agency, creating a more transparent and collaborative investment environment.

## 8. Technical Considerations

**Platform Requirements**
*   **Target Platform:** A modern web application.
*   **Accessibility:** The application must be mobile-friendly and responsive, providing a seamless experience on desktops, tablets, and smartphones. It should support all modern, evergreen web browsers.
*   **Performance:** The system must be fast and responsive for daily use, with quick page loads and data retrieval to ensure staff efficiency.

**Technology Preferences**
*   The specific technology stack (e.g., for the frontend, backend, and database) will be determined during the detailed architecture phase of the project.

**Architecture Considerations**
*   **Security & Compliance:** Security is paramount. The system will be built with robust security measures, including strict role-based access control as we've defined. A comprehensive audit trail of all actions taken within the system is a core requirement. All data must be handled in a manner compliant with government data security standards.
*   **Integrations:** No external system integrations are required for the MVP.

## 9. Constraints & Assumptions

**Constraints**
*   **Timeline:** The primary constraint is the firm 4-week deadline for the delivery of the MVP, as this is an urgent government request.
*   **Budget:** The project budget is yet to be defined and will be discussed separately.
*   **Resources:** The specific personnel and team size allocated to this project are yet to be determined.

**Key Assumptions**
*   It is assumed that the full MVP scope, with all features identified as 'must-haves', is achievable within the 4-week timeline. The feasibility will be confirmed in the architecture and planning phase.
*   It is assumed that key OYSIPA stakeholders will be available for prompt feedback and decisions throughout the project to prevent delays.
*   It is assumed that all necessary content (e.g., final text for dropdowns, existing investor data for migration) will be provided by OYSIPA when required.

## 10. Risks & Open Questions

**Key Risks**
*   **Timeline Risk:** The 4-week timeline is very ambitious for an application with this many 'must-have' features. Any delay in feedback or decisions could jeopardize the delivery date.
*   **Scope Creep:** There is a risk that new requirements or features may be requested during development, which the current timeline cannot accommodate. The defined MVP scope must be strictly adhered to.

**Open Questions**
*   What is the final budget for this project?
*   Who will be the designated point of contact and Portal Administrator from OYSIPA during the project?
*   Is there any existing investor data that will need to be migrated into the new system, and what format is it in?
*   Are there any specific, pre-existing government IT or data security policies that must be followed?

## 11. Next Steps

**Immediate Actions**
1.  Finalize and formally approve this Project Brief.
2.  Define the project budget.
3.  Assign the key points of contact from OYSIPA who will work with the development team.
4.  Proceed to the next stage of the project: creating the detailed Product Requirements Document (PRD).

**Handoff to Product Manager**
This Project Brief provides the full context for the Investor Tracking System. It will now be handed off to the Product Manager, who will work with you to create the detailed PRD, section by section, using this brief as their guide.
