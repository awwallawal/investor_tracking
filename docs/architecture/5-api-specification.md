# 5. API Specification

## 5.1. REST API Specification (OpenAPI)

This section defines the REST API contract using the OpenAPI 3.0 standard.

```yaml
openapi: 3.0.3
info:
  title: OYSIPA Investor Tracking System API
  description: The API for the OYSIPA Investor Tracking System & CRM.
  version: 1.0.0
servers:
  - url: https://oysipa-backend.onrender.com/api/v1
    description: Production Server
  - url: http://localhost:3001/api/v1
    description: Local Development Server
tags:
  - name: Authentication
    description: User authentication and registration
  - name: Investors
    description: Operations about investors
  - name: Projects
    description: Operations about investment projects
  - name: Interactions
    description: Logging and retrieving project interactions
# 1. API Endpoints (Paths)
paths:
  /auth/login:
    post:
      summary: User Login
      tags:
        - Authentication
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/LoginRequest'
      responses:
        '200':
          description: Successful login
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/AuthResponse'
        '401':
          description: Unauthorized
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'

  /auth/register:
    post:
      summary: Register a new user via invitation
      tags:
        - Authentication
      description: This endpoint is used by a new user clicking the link in their invitation email.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/RegisterRequest'
      responses:
        '201':
          description: User successfully created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/UserResponse'
        '400':
          description: Bad request (e.g., invalid token, password too weak)
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/ErrorResponse'
  /investors:
    get:
      summary: List all investors
      tags: [Investors]
      security:
        - bearerAuth: []
      parameters:
        - in: query
          name: limit
          schema: { type: integer, default: 20 }
        - in: query
          name: offset
          schema: { type: integer, default: 0 }
        - in: query
          name: sortBy
          schema: { type: string, default: 'createdAt' }
      responses:
        '200':
          description: A list of investors.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/Investor'
    post:
      summary: Create a new investor
      tags: [Investors]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InvestorRequest'
      responses:
        '201':
          description: Investor created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Investor'

  /investors/{id}:
    get:
      summary: Get a single investor by ID
      tags: [Investors]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: A single investor object.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Investor'
        '404':
          description: Investor not found
    put:
      summary: Update an investor
      tags: [Investors]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InvestorRequest'
      responses:
        '200':
          description: Investor updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Investor'
    delete:
      summary: Delete an investor
      tags: [Investors]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '204':
          description: Investor deleted successfully

  /investors/{investorId}/projects:
    get:
      summary: List all projects for an investor
      tags: [Projects]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: investorId
          required: true
          schema: { type: string }
      responses:
        '200':
          description: A list of projects for the specified investor.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/InvestmentProject'
    post:
      summary: Create a new project for an investor
      tags: [Projects]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: investorId
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InvestmentProjectRequest'
      responses:
        '201':
          description: Project created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/InvestmentProject'

  /projects/{id}:
    get:
      summary: Get a single project by ID
      tags: [Projects]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '200':
          description: A single project object.
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/InvestmentProject'
        '404':
          description: Project not found
    put:
      summary: Update a project
      tags: [Projects]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InvestmentProjectRequest'
      responses:
        '200':
          description: Project updated successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/InvestmentProject'
    delete:
      summary: Delete a project
      tags: [Projects]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: id
          required: true
          schema: { type: string }
      responses:
        '204':
          description: Project deleted successfully

  /projects/{projectId}/interactions:
    get:
      summary: List all interaction logs for a project
      tags: [Interactions]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: projectId
          required: true
          schema: { type: string }
      responses:
        '200':
          description: A list of interaction logs for the specified project.
          content:
            application/json:
              schema:
                type: array
                items:
                  $ref: '#/components/schemas/InteractionLog'
    post:
      summary: Create a new interaction log for a project
      tags: [Interactions]
      security:
        - bearerAuth: []
      parameters:
        - in: path
          name: projectId
          required: true
          schema: { type: string }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/InteractionLogRequest'
      responses:
        '201':
          description: Interaction log created successfully
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/InteractionLog'

# 2. Reusable Components (Schemas)
components:
  schemas:
    # Base Models
    User:
      type: object
      properties:
        id:
          type: string
          example: '60d0fe4f5311236168a109ca'
        name:
          type: string
          example: 'John Doe'
        email:
          type: string
          format: email
          example: 'john.doe@oysipa.gov.ng'
        role:
          type: string
          enum: [Staff, Portal Administrator, Director-General]
          example: 'Staff'

    Investor:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        sector:
          type: string
        countryOfOrigin:
          type: string
        companyRegistrationInfo:
          type: string
        assignedTo:
          type: string
          description: User ID
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    InvestmentProject:
      type: object
      properties:
        id:
          type: string
        title:
          type: string
        description:
          type: string
        estimatedValue:
          type: number
        location:
          type: string
        lifecycleStage:
          type: string
          description: LifecycleStage ID
        investor:
          type: string
          description: Investor ID
        createdAt:
          type: string
          format: date-time
        updatedAt:
          type: string
          format: date-time

    InteractionLog:
      type: object
      properties:
        id:
          type: string
        project:
          type: string
        loggedBy:
          $ref: '#/components/schemas/UserResponse' # Nested user details
        description:
          type: string
        category:
          type: string
        documentUrl:
          type: string
        createdAt:
          type: string
          format: date-time

    # Request/Response Schemas
    LoginRequest:
      type: object
      required: [email, password]
      properties:
        email:
          type: string
          format: email
        password:
          type: string
          format: password

    RegisterRequest:
      type: object
      required: [name, password, inviteToken]
      properties:
        name:
          type: string
        password:
          type: string
          format: password
        inviteToken:
          type: string

    AuthResponse:
      type: object
      properties:
        token:
          type: string
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
        user:
          $ref: '#/components/schemas/User'

    UserResponse:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
        email:
          type: string
        role:
          type: string

    InvestorRequest:
      type: object
      required: [name, sector]
      properties:
        name:
          type: string
        sector:
          type: string
        countryOfOrigin:
          type: string
        companyRegistrationInfo:
          type: string
        assignedTo:
          type: string
          description: User ID

    InvestmentProjectRequest:
      type: object
      required: [title, lifecycleStage]
      properties:
        title:
          type: string
        description:
          type: string
        estimatedValue:
          type: number
        location:
          type: string
        lifecycleStage:
          type: string
          description: LifecycleStage ID

    InteractionLogRequest:
      type: object
      required: [description, category]
      properties:
        description:
          type: string
        category:
          type: string
        documentUrl:
          type: string

    ErrorResponse:
      type: object
      required: [message]
      properties:
        message:
          type: string
          example: 'Invalid credentials'

  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

# 3. Security Definitions
security:
  - bearerAuth: []
```
