# SmartWorker - Job Processing System with AI-Powered Error Resolution

This project is a robust job processing system built with Bun, TypeScript, and BullMQ. It features an innovative AI layer that automatically attempts to fix failing jobs by leveraging a Large Language Model (LLM) and running the proposed fixes in a secure Docker sandbox.

## Features

- **Job Queuing:** Utilizes BullMQ and Redis to manage and process jobs asynchronously.
- **AI-Powered Error Resolution:** When a job repeatedly fails, it's passed to an AI layer. The AI analyzes the stack trace and relevant code, generates a fix, and tests it in a sandboxed environment.
- **Docker Sandbox:** Proposed fixes are tested in an isolated Docker container to ensure they are effective and don't introduce new issues.
- **Email Notifications:** If a fix is successful, an email is sent with a diff of the code changes, allowing for review and manual application if desired.
- **Dead Letter Queue (DLQ):** Failed jobs are moved to a DLQ for manual inspection or reprocessing.
- **Express API:** A simple Express.js server provides an endpoint to add new jobs to the queue.

## How It Works

1.  **Job Creation:** Jobs are added to the `loginQueue` via the `/job` API endpoint.
2.  **Job Processing:** A `loginWorker` processes jobs from the queue.
3.  **Failure Detection:** If a job fails multiple times (as defined by the job's `attempts` option), the `failed` event listener on the worker moves the job to the `loginDLQ` (Dead Letter Queue).
4.  **AI Intervention:** If the `reasoning_fix` flag is set on the job data, the `jobFailureReasoning` function is triggered.
5.  **Code Analysis:** The AI layer gathers context from the job's stack trace and the source code of the files involved in the error.
6.  **LLM Interaction:** The code and error information are sent to an LLM with a prompt asking it to fix the code.
7.  **Sandbox Testing:** The LLM's proposed code changes are applied in a temporary Docker container (a "sandbox"). The failed job is then re-run within this sandbox.
8.  **Success Notification:** If the job succeeds in the sandbox, an email is sent with the proposed code changes.
9.  **Sandbox Destruction:** The Docker sandbox container is destroyed after the test run.

## Project Structure

```
.
├── ai-layer/
│   ├── destroy-sandbox.ts  # Functions to clean up Docker containers
│   ├── entrypoint.ts       # Entrypoint for the Docker sandbox
│   ├── reasoning.ts        # Handles interaction with the LLM
│   ├── run-job.ts          # Logic to run the job within the sandbox
│   ├── sandbox.ts          # Functions for creating and managing the Docker sandbox
│   └── types.ts            # TypeScript types for the AI layer
├── email.ts                # Email client for sending notifications
├── index.ts                # Main application entrypoint and Express server
├── package.json            # Project dependencies and scripts
├── queues.ts               # BullMQ queue definitions
├── redis.ts                # Redis connection setup
├── tsconfig.json           # TypeScript configuration
├── utils.ts                # Utility functions
└── workers.ts              # BullMQ worker definitions
```

## Key Technologies

- **Runtime:** [Bun](https://bun.sh/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Framework:** [Express.js](https://expressjs.com/)
- **Job Queue:** [BullMQ](https://bullmq.io/)
- **Database/Broker:** [Redis](https://redis.io/)
- **Containerization:** [Docker](https://www.docker.com/)
- **Email:** [Nodemailer](https://nodemailer.com/)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Docker](https://docs.docker.com/get-docker/)
- A running Redis instance

### Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd jobsys
    ```
2.  Install dependencies:
    ```bash
    bun install
    ```

### Configuration

Create a `.env` file in the root of the project with the following environment variables:

```
PORT=9090
REDIS_HOST=localhost
REDIS_PORT=6379
SMTP_HOST=your_smtp_host
SMTP_PORT=your_smtp_port
SMTP_USER=your_smtp_user
SMTP_PASS=your_smtp_password
SMTP_TO_USER=recipient_email
ROOT_DIR=$(pwd)
```

**Note on `ROOT_DIR`**: This is used by the sandboxing environment to correctly mount and locate files.

### Running the Application

1.  Start the main application:
    ```bash
    bun run index.ts
    ```
    This will start the Express server and the BullMQ workers.

2.  To add a job that will intentionally fail and trigger the AI fix process, you can send a GET request to the root endpoint:
    ```bash
    curl http://localhost:9090
    ```

3.  To add a custom job, send a POST request to the `/job` endpoint:
    ```bash
    curl -X POST http://localhost:9090/job \
         -H "Content-Type: application/json" \
         -d '{
               "name": "my-custom-job",
               "data": { "key": "value" }
             }'
    ```
