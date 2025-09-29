# Source Tree and Project Structure

This document outlines the project structure for the OYSIPA Investor Tracking System. It follows a poly-repo approach, with a separate repository and source tree for the backend and frontend.

## High-Level Structure

The project is divided into two primary directories, representing two separate codebases:

-   `oysipa-backend/`: A Node.js/Express application that serves as the REST API.
-   `oysipa-frontend/`: A React (Vite) application that serves as the user interface.

---

## Backend Source Tree (`oysipa-backend/src`)

The backend follows a standard structure for an Express.js application, separating concerns into distinct directories.

```
oysipa-backend/
└── src/
    ├── api/         # API routes and controllers
    ├── config/      # Configuration files (e.g., database connection)
    ├── middleware/  # Custom Express middleware (e.g., auth)
    ├── models/      # Mongoose data models (e.g., User.js, Investor.js)
    ├── services/    # Business logic and service layers (currently empty)
    └── index.js     # Main application entry point
```

### Directory Purpose

-   **`src/api/`**: Contains all the route definitions for the API. Each file should correspond to a specific resource (e.g., `auth.js`, `users.js`). These files define the API endpoints and map them to controller logic.
-   **`src/config/`**: Holds configuration files. `database.js` is a key file here, managing the connection to MongoDB.
-   **`src/middleware/`**: For Express middleware functions. This is where request processing logic, such as authentication checks (`auth.js`) or role-based authorization (`authorize.js`), should reside.
-   **`src/models/`**: Defines the Mongoose schemas for all database collections. Each file represents a single data model.
-   **`src/services/`**: Intended for abstracting business logic away from the API controllers. (Note: This directory is currently a placeholder and should be populated as the application grows in complexity).
-   **`src/index.js`**: The main entry point for the backend server. It initializes the Express app, connects to the database, applies middleware, and starts the server.

---

## Frontend Source Tree (`oysipa-frontend/src`)

The frontend follows a standard structure for a React application, organizing files by their function or type.

```
oysipa-frontend/
└── src/
    ├── assets/      # Static assets (images, svgs, etc.)
    ├── components/  # Reusable, shared React components
    ├── pages/       # Top-level page components for each route
    ├── App.jsx      # Main application component with routing
    ├── main.jsx     # Application entry point (renders App)
    └── index.css    # Global styles and font imports
```

### Directory Purpose

-   **`src/assets/`**: For static files like images, icons, and logos that are imported directly into components.
-   **`src/components/`**: Contains reusable React components that are shared across multiple pages (e.g., `Header.jsx`, `Sidebar.jsx`, `LogoutButton.jsx`). These components should be self-contained and not tied to a specific page.
-   **`src/pages/`**: Holds the main component for each application route (e.g., `LoginPage.jsx`, `Dashboard.jsx`). These components represent entire pages and are responsible for composing the layout from smaller, shared components.
-   **`src/App.jsx`**: The root component of the application. It is responsible for setting up the global `ThemeProvider` and the main `BrowserRouter` for routing.
-   **`src/main.jsx`**: The final entry point for the React application. Its sole purpose is to render the `App` component into the DOM.
-   **`src/index.css`**: Used for global styles and importing external assets like fonts. Direct styling here should be minimal, in favor of the MUI theme object.
