# 3. Tech Stack

## 3.1. Technology Stack Table

| Category | Technology | Version | Purpose | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| Frontend Language | JavaScript (ES6+) | Latest | Core language for React | User-specified. Modern JavaScript provides robust features for development. |
| Frontend Framework | React | ~18.2.0 | Building the user interface | User-specified. The leading library for building modern UIs. |
| UI Component Library| Material-UI (MUI) | ~5.15.0 | Pre-built, accessible UI components | Speeds up development and ensures a consistent, professional look. |
| CSS Styling | MUI `sx` prop | N/A | Component-level styling | User-specified. Keeps styles co-located with components and leverages the MUI theme. |
| State Management | Zustand | ~4.5.0 | Simple, scalable state management | Lightweight and minimal boilerplate compared to Redux for this project's scale. |
| Backend Language | JavaScript (ES6+) | Latest | Core language for Node.js | User-specified. Consistent language across the full stack. |
| Backend Framework | Express.js | ~4.18.2 | API routing and middleware | Minimal, fast, and the de-facto standard for Node.js APIs. |
| API Style | REST | N/A | Standard for web APIs | Well-understood, stateless, and framework-agnostic. |
| Database | MongoDB | 7.0+ | Primary data storage | User-specified. A flexible NoSQL database suitable for evolving requirements. |
| Database ODM | Mongoose | ~8.2.0 | MongoDB object modeling | Provides schema validation and simplifies interaction with MongoDB from JavaScript. |
| File Storage | Cloudinary | N/A | Storing uploaded documents | User-specified. A robust, managed service for file uploads, transformations, and delivery. |
| Authentication | JSON Web Tokens (JWT)| ~9.0.2 | Securely transmitting information | Standard, stateless method for authenticating API requests. |
| Frontend Testing | Vitest + RTL | Latest | Unit & Component Testing | Modern, fast testing framework integrated with Vite. React Testing Library encourages good practices. |
| Backend Testing | Jest + Supertest | ~29.x.x | Unit & API Endpoint Testing | Jest is a comprehensive testing framework. Supertest simplifies HTTP assertions. |
| Build Tool | Vite | ~5.1.0 | Frontend dev server and bundler | Extremely fast development server and optimized production builds. |
| CI/CD | GitHub Actions | N/A | Automated testing and deployment | Natively integrated with GitHub, excellent for setting up separate FE/BE deployment pipelines. |
| Monitoring | Vercel/Render Dashboards| N/A | Basic health and usage monitoring | Provides essential monitoring out-of-the-box for the MVP without extra setup. |
| Logging | Vercel/Render Runtimes| N/A | Capturing application logs | Provides essential logging out-of-the-box for the MVP. |
