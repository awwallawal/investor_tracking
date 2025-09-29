# Coding Standards

This document outlines the coding standards and best practices to be followed for all development in the OYSIPA Investor Tracking System project. Adherence to these standards is crucial for maintaining code quality, readability, and long-term maintainability.

## General Principles

1.  **Readability is Paramount**: Write code that is easy for other developers to read and understand. Add comments only for complex logic that isn't self-evident.
2.  **Consistency**: Strive for consistency in naming, formatting, and architectural patterns throughout the codebase.
3.  **DRY (Don't Repeat Yourself)**: Abstract reusable logic into functions, components, or services. Avoid duplicating code.

---

## JavaScript (General)

-   **Naming Conventions**:
    -   Variables and functions: `camelCase` (e.g., `let investorData`, `function getInvestors()`).
    -   Constants: `UPPER_SNAKE_CASE` for global or hard-coded constants (e.g., `const API_VERSION = 'v1'`).
    -   Classes and React Components: `PascalCase` (e.g., `class InvestorService`, `function UserManagementPage()`).
-   **Variable Declaration**: Use `const` by default. Use `let` only for variables that need to be reassigned. Avoid using `var`.
-   **Modularity**: The backend uses **CommonJS** (`require`, `module.exports`). The frontend uses **ES Modules** (`import`, `export`). Do not mix these systems.

---

## Frontend (React)

-   **Component Structure**: Each component should be in its own `.jsx` file, named in `PascalCase`.
-   **State Management**: For simple, local state, use React's built-in `useState` hook. For global or complex state shared across components, use **Zustand** as defined in the architecture.
-   **Styling**: All styling **must** be done using the **Material-UI `sx` prop**. Do not use inline `style` attributes or external `.css` files for component-specific styles. Global styles (like font imports) are an exception and belong in `index.css`.
-   **Component Naming**: Name component files to match the component they export (e.g., `Header.jsx` should export `Header`).
-   **Props**: Use clear and descriptive names for props. Destructure props at the top of the component for readability.

---

## Backend (Node.js / Express)

-   **Asynchronous Operations**: All asynchronous operations (e.g., database calls) **must** use `async/await`. Avoid using `.then()` chains or callbacks for async logic.
-   **Error Handling**: Use `try...catch` blocks for all `await` calls. API routes should have a consistent error response format, for example:
    ```json
    { "msg": "A descriptive error message" }
    ```
-   **Environment Variables**: All configuration variables, secrets, and keys **must** be stored in the `.env` file and accessed via `process.env`. Do not hard-code these values.
-   **Route Definitions**: Keep route definitions clean and focused. They should primarily handle request/response logic and delegate complex business logic to service-layer functions (to be created in `src/services`).

---

## Testing

-   **File Naming**: Test files should be named `[filename].test.js` (e.g., `Investor.test.js`).
-   **Test Structure**: Use `describe` blocks to group related tests for a specific component or function. Use `it` blocks for individual test cases with descriptive names (e.g., `it('should fail if required fields are missing')`).
-   **Backend**: Use **Jest** for running tests. Model tests should verify schema validation and business logic. API tests should use **Supertest** to test endpoint responses.
-   **Frontend**: Use **Vitest** with **React Testing Library (RTL)**. Tests should focus on user behavior and component functionality, not implementation details. Query elements as a user would (e.g., by role, text, label) to create robust tests.
