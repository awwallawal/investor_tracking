# OYSIPA Investor Tracking System

A full-stack web application designed to manage and track investor information and their associated projects.

## Tech Stack

**Frontend:**
*   React
*   Vite
*   Material-UI (for styling)
*   Zustand (for state management)
*   React Router

**Backend:**
*   Node.js
*   Express.js
*   MongoDB (with Mongoose)
*   JWT (for authentication)

## Project Structure

This project follows a poly-repo approach, with two separate directories for the frontend and backend:

*   `oysipa-frontend/`: The React client application.
*   `oysipa-backend/`: The Node.js/Express REST API.

## Getting Started

Follow these instructions to get a copy of the project up and running on your local machine for development and testing purposes.

### Prerequisites

*   Node.js (v18 or newer recommended)
*   npm
*   MongoDB (a local instance or a cloud-hosted one like MongoDB Atlas)

### Installation

1.  **Clone the repository:**
    ```sh
    git clone <repository-url>
    cd investor_tracking_system
    ```

2.  **Install backend dependencies:**
    ```sh
    cd oysipa-backend
    npm install
    ```

3.  **Install frontend dependencies:**
    ```sh
    cd ../oysipa-frontend
    npm install
    ```

### Environment Variables

This project requires environment variables to be set up for both the backend and the root directory. Create `.env` files in the `oysipa-backend` directory and in the project root.

**Root (`/investor_tracking_system/.env`):**
```
# Used by the BMad development agent framework
Gemini_API_Key=YOUR_GEMINI_API_KEY
```

**Backend (`/investor_tracking_system/oysipa-backend/.env`):**
```
# Port for the backend server
PORT=5000

# MongoDB connection string
MONGO_URI=YOUR_MONGODB_CONNECTION_STRING

# Secret for signing JWT tokens
JWT_SECRET=YOUR_JWT_SECRET
```

## Running the Application

You will need two separate terminal windows to run both the backend and frontend servers simultaneously.

1.  **Start the backend server:**
    ```sh
    cd oysipa-backend
    npm run dev
    ```
    The API server should now be running on `http://localhost:5000` (or the port you specified).

2.  **Start the frontend server:**
    ```sh
    cd oysipa-frontend
    npm run dev
    ```
    The React development server should now be running on `http://localhost:5173` (Vite's default) or another available port.

## Development Methodology

This project is being developed using the **BMad (Build, Measure, Adapt, Develop)** framework, an AI-assisted development process. The core logic, agent definitions, and workflows for this methodology are stored in the `.bmad-core` directory. This ensures a consistent and reproducible development environment for all collaborators.
