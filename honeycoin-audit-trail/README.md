# Honeycoin Audit Trail Service

## Overview
The Honeycoin Audit Trail Service is a Node.js application built with TypeScript and Express that provides an SQL-based audit trail for user actions. This service allows for the tracking of actions performed by users, ensuring accountability and traceability.

## Features
- RESTful API for retrieving audit entries.
- PostgreSQL database for storing audit data.
- Middleware for error handling and request logging.
- Seed script for populating the database with initial data.
- Docker support for easy deployment.

## Project Structure
```
honeycoin-audit-trail
├── src
│   ├── app.ts
│   ├── server.ts
│   ├── controllers
│   │   └── auditController.ts
│   ├── routes
│   │   └── auditRoutes.ts
│   ├── models
│   │   └── auditEntry.ts
│   ├── repositories
│   │   └── auditRepository.ts
│   ├── services
│   │   └── auditService.ts
│   ├── db
│   │   ├── index.ts
│   │   └── migrations
│   │       └── 001_create_audit_entries_table.sql
│   └── config
│       └── index.ts
├── scripts
│   └── seed-audit-data.ts
├── sql
│   └── schema.sql
├── tests
│   └── audit.test.ts
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## Installation
1. Clone the repository:
   ```
   git clone https://github.com/yourusername/honeycoin-audit-trail.git
   cd honeycoin-audit-trail
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   - Copy `.env.example` to `.env` and fill in the required values.

4. Run database migrations:
   ```
   npm run migrate
   ```

5. Seed the database with initial data:
   ```
   npm run seed
   ```

## Usage
- Start the server:
  ```
  npm start
  ```

- Access the API:
  - Retrieve audit entries for a specific user:
    ```
    GET /api/audit/:userId
    ```

## Testing
To run the tests, use:
```
npm test
```

## Docker
To build and run the application using Docker:
```
docker-compose up --build
```

## Performance Notes
- Ensure that the database is properly indexed for optimal query performance.
- Monitor the application for any performance bottlenecks and optimize as necessary.

## License
This project is licensed under the MIT License. See the LICENSE file for details.