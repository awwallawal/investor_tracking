# Troubleshooting Plan: Blank Dashboard Resolution (New Process)

This document outlines the steps to diagnose and resolve the critical issue causing all dashboards to render as blank pages after login.

## 1. Corrected Problem Diagnosis

The root cause is a **build-time error**, not a bug in the component logic itself. The project's linting configuration (`eslint.config.js`) enforces the official "Rules of Hooks" for React.

A utility function was incorrectly named `useAuth`, which violates these rules because it is not a true React Hook. This violation is treated as a fatal error by the development server, which stops the application from building and results in a blank screen.

## 2. Refined Step-by-Step Resolution

To fix this robustly across the entire application, the following systematic approach will be taken.

### Step 1: Find All Usages of `useAuth`

- **Action:** Perform a global search across the `oysipa-frontend` directory for the string "useAuth".
- **Goal:** Create a definitive checklist of every file that needs to be updated, ensuring the fix is comprehensive.

### Step 2: Move File and Rename Function

- **Action:**
    1. Create a new directory: `src/utils` (if it doesn't exist).
    2. Move `src/hooks/useAuth.js` to `src/utils/auth.js`.
    3. In the new file, rename the function from `useAuth` to `getAuthenticatedUser`.
- **Goal:** Resolve the naming violation that is breaking the build.

### Step 3: Update All Affected Files

- **Action:** For each file identified in Step 1, update the code to use the new function name and import path.
- **Goal:** Ensure the entire application can access the authentication utility without error.

### Step 4: Restore Original Enhancement Plan

- **Action:** Once the application is running and the critical bug is resolved, proceed with the original UI/UX improvement plan.
- **Goal:**
  - Fix the `lifecycleStage` vs. `lifecycleStatus` bug.
  - Enhance the UI of the dashboard widgets and charts using Material-UI and a charting library.
  - Standardize API calls.

## 3. Standardization: `lifecycleStatus`

The codebase uses two different terms for the same concept: `lifecycleStage` and `lifecycleStatus`. To ensure consistency and prevent future bugs, we will standardize on `lifecycleStatus`.

### Step 1: Backend Changes

1.  **`src/models/LifecycleStageModel.js`**:
    *   Rename the file to `src/models/LifecycleStatusModel.js`.
    *   In the file, rename the schema to `lifecycleStatusSchema`.
    *   Rename the model from `LifecycleStage` to `LifecycleStatus`.
    *   Export `LifecycleStatus`.

2.  **`src/controllers/lifecycleStageController.js`**:
    *   Rename the file to `src/controllers/lifecycleStatusController.js`.
    *   Update the import from `../models/LifecycleStageModel` to `../models/LifecycleStatusModel`.
    *   Rename `getAllLifecycleStages` to `getAllLifecycleStatuses`.

3.  **`src/api/lifecyclestages.js`**:
    *   Rename the file to `src/api/lifecyclestatuses.js`.
    *   Update the import from `../controllers/lifecycleStageController` to `../controllers/lifecycleStatusController`.
    *   Update the route from `/` to `/` (no change, but the file name change is important).
    *   Update the controller function from `getAllLifecycleStages` to `getAllLifecycleStatuses`.

4.  **`src/index.js`**:
    *   Update the import from `./api/lifecyclestages` to `./api/lifecyclestatuses`.
    *   Update the route from `/api/lifecyclestages` to `/api/lifecyclestatuses`.

5.  **`src/controllers/projectController.js`**:
    *   Update the comment to refer to `lifecycleStatus`.
    *   Update the filtering logic to use `lifecycleStatus`.

6.  **`jest.setup.js`**:
    *   Update `lifecycleStage` to `lifecycleStatus`.

7.  **`src/api/projects.test.js`**:
    *   Update the test description to refer to `lifecycleStatus`.
    *   Update the test to filter by `lifecycleStatus`.

8.  **`src/api/lifecyclestages.test.js`**:
    *   Rename the file to `src/api/lifecyclestatuses.test.js`.
    *   Update the import from `../models/LifecycleStageModel` to `../models/LifecycleStatusModel`.
    *   Update the model name from `LifecycleStage` to `LifecycleStatus`.
    *   Update the route from `/api/lifecyclestages` to `/api/lifecyclestatuses`.

### Step 2: Frontend Changes

1.  **`src/components/LifecycleChart.jsx`**:
    *   Update the `navigate` call to use `lifecycleStatus`.

2.  **`src/components/LifecycleStageChanger.jsx`**:
    *   Rename the file to `src/components/LifecycleStatusChanger.jsx`.
    *   Update the component name to `LifecycleStatusChanger`.
    *   Update the API calls from `/api/lifecyclestages` to `/api/lifecyclestatuses`.
    *   Update the `project.lifecycleStage` to `project.lifecycleStatus`.
    *   Update the API call to update the project to use `lifecycleStatus`.

3.  **`src/components/ProjectSummaryCard.jsx`**:
    *   Update `project.currentLifecycleStage` to `project.lifecycleStatus`.

4.  **`src/pages/Dashboard.test.jsx`**:
    *   Update `currentLifecycleStage` to `lifecycleStatus`.

5.  **`src/pages/ProjectListPage.test.jsx`**:
    *   Update `lifecycleStage` to `lifecycleStatus`.

6.  **`src/test/ProjectForm.test.jsx`**:
    *   Update `lifecycleStage` to `lifecycleStatus`.

7.  **`src/test/ProjectList.test.jsx`**:
    *   Update `lifecycleStage` to `lifecycleStatus`.

8.  **`src/components/ProjectSummaryCard.test.jsx`**:
    *   Update `currentLifecycleStage` to `lifecycleStatus`.

9.  **`src/components/LifecycleChart.test.jsx`**:
    *   Update `lifecycleStage` to `lifecycleStatus`.

### Step 3: Verification

1.  Run all backend tests.
2.  Run all frontend tests.
3.  Manually test the dashboard filtering functionality.


# Troubleshooting Plan: Blank Dashboard Resolution (Old Process)

This document outlines the steps to diagnose and resolve the critical issue causing all dashboards to render as blank pages after login.

## 1. Corrected Problem Diagnosis

The root cause is a **build-time error**, not a bug in the component logic itself. The project's linting configuration (`eslint.config.js`) enforces the official "Rules of Hooks" for React.

A utility function was incorrectly named `useAuth`, which violates these rules because it is not a true React Hook. This violation is treated as a fatal error by the development server, which stops the application from building and results in a blank screen.

## 2. Refined Step-by-Step Resolution

To fix this robustly across the entire application, the following systematic approach will be taken.

### Step 1: Find All Usages of `useAuth`

- **Action:** Perform a global search across the `oysipa-frontend` directory for the string "useAuth".
- **Goal:** Create a definitive checklist of every file that needs to be updated, ensuring the fix is comprehensive.

### Step 2: Move File and Rename Function

- **Action:**
    1. Create a new directory: `src/utils` (if it doesn't exist).
    2. Move `src/hooks/useAuth.js` to `src/utils/auth.js`.
    3. In the new file, rename the function from `useAuth` to `getAuthenticatedUser`.
- **Goal:** Resolve the naming violation that is breaking the build.

### Step 3: Update All Affected Files

- **Action:** For each file identified in Step 1, update the code to use the new function name and import path.
- **Goal:** Ensure the entire application can access the authentication utility without error.

### Step 4: Restore Original Enhancement Plan

- **Action:** Once the application is running and the critical bug is resolved, proceed with the original UI/UX improvement plan.
- **Goal:**
  - Fix the `lifecycleStage` vs. `lifecycleStatus` bug.
  - Enhance the UI of the dashboard widgets and charts using Material-UI and a charting library.
  - Standardize API calls.