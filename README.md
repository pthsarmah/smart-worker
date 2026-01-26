# SmartWorker - Job Processing System with AI-Powered Error Resolution

This project is a robust job processing system built with Bun, TypeScript, and BullMQ. It features an innovative AI layer that automatically attempts to fix failing jobs by leveraging a Large Language Model (LLM) and running the proposed fixes in a secure Docker sandbox. It also includes a Memory Layer for long-term storage and retrieval of failure contexts using vector embeddings.

## Features

- **Job Queuing:** Utilizes BullMQ and Redis to manage and process jobs asynchronously.
- **AI-Powered Error Resolution:** When a job repeatedly fails, it's passed to an AI layer. The AI analyzes the stack trace and relevant code, generates a fix, and tests it in a sandboxed environment.
- **Docker Sandbox:** Proposed fixes are tested in an isolated Docker container to ensure they are effective and don't introduce new issues.
- **Memory Layer:** Stores failed job metadata, stack traces, and code context in a PostgreSQL database with `pgvector` embeddings for future analysis and retrieval.
- **Categorized Embeddings:** Failure context is split into weighted categories (error signature, failure location, code context, metadata) for more accurate similarity matching.
- **Structured Failure Context:** Automatically extracts error signatures, parses stack trace locations, and generates focused code snippets around failure points.
- **Similarity Search with Majority Voting:** When a job fails, the system searches for similar past failures using weighted embeddings and elects the best match via majority vote.
- **Email Notifications:** If a fix is successful (or fails), an email is sent with the results and code changes, allowing for review and manual application.
- **Dead Letter Queue (DLQ):** Failed jobs are moved to a DLQ for manual inspection or reprocessing.
- **Express API:** A simple Express.js server provides endpoints to add new jobs and trigger the AI resolution flow.

## How It Works

1.  **Job Creation:** Jobs are added to the `loginQueue` via the `/job` API endpoint or the root `/` endpoint.
2.  **Job Processing:** A `loginWorker` processes jobs from the queue.
3.  **Failure Detection:** If a job fails multiple times (as defined by the job's `attempts` option), the `failed` event listener on the worker moves the job to the `loginDLQ` (Dead Letter Queue).
4.  **AI Intervention:** If the `reasoning_fix` flag is set on the job data, the `jobFailureReasoning` function is triggered.
5.  **Structured Context Extraction:** The system extracts structured failure context including:
    - **Error Signature:** Normalized error type and message (with dynamic values like IDs/timestamps replaced)
    - **Failure Locations:** Parsed stack trace with file paths, line numbers, and function names
    - **Focused Code Snippets:** Code surrounding each failure location with line markers
6.  **Memory Search:** Before generating a fix, the system searches for similar past failures using categorized embeddings with weighted distances. A majority vote algorithm selects the best matching previous job.
7.  **LLM Interaction:** The code, error information, and any relevant past resolution summaries are sent to an LLM with a prompt asking it to fix the code.
8.  **Sandbox Testing:** The LLM's proposed code changes are applied in a temporary Docker container (a "sandbox"). The failed job is then re-run within this sandbox using the `login-sandbox` queue.
9.  **Success Notification:** If the job succeeds in the sandbox, an email is sent with the proposed code changes.
10. **Resolution Summary:** On successful fix, an LLM generates a concise resolution summary explaining the root cause and applied fix.
11. **Memory Storage:** Resolved failures are stored in the Memory Layer with categorized embeddings (error signature, failure location, code context, metadata) weighted by importance for future similarity matching.
12. **Sandbox Destruction:** The Docker sandbox container is destroyed after the test run.

## Project Structure

```
.
├── memory-layer/
│   └── memory.ts           # Categorized embedding generation, weighted similarity search, and memory storage
├── reasoning-layer/
│   ├── destroy-sandbox.ts  # Functions to clean up Docker containers
│   ├── entrypoint.ts       # Entrypoint for the Docker sandbox
│   ├── reasoning.ts        # Handles structured context extraction, LLM interaction, and fix orchestration
│   ├── run-job.ts          # Logic to run the job within the sandbox
│   ├── sandbox.ts          # Functions for creating and managing the Docker sandbox
│   └── types.ts            # TypeScript types including categorized embeddings and structured failure context
├── email.ts                # Email client for sending notifications
├── index.ts                # Main application entrypoint and Express server
├── package.json            # Project dependencies and scripts
├── queues.ts               # BullMQ queue definitions
├── redis.ts                # Redis connection setup
├── sql.ts                  # PostgreSQL/pgvector connection, schema, and categorized embedding queries
├── test.ts                 # TUI for testing hazard scenarios and viewing similarity percentages
├── tsconfig.json           # TypeScript configuration
├── utils.ts                # Utility functions (includes majority vote algorithm)
└── workers.ts              # BullMQ worker definitions
```

## Key Technologies

- **Runtime:** [Bun](https://bun.sh/)
- **Language:** [TypeScript](https://www.typescriptlang.org/)
- **Framework:** [Express.js](https://expressjs.com/)
- **Job Queue:** [BullMQ](https://bullmq.io/)
- **Database/Broker:** [Redis](https://redis.io/)
- **Persistent Storage:** [PostgreSQL](https://www.postgresql.org/) with [pgvector](https://github.com/pgvector/pgvector)
- **Containerization:** [Docker](https://www.docker.com/)
- **Email:** [Nodemailer](https://nodemailer.com/)
- **AI/LLM:** 
  - **Code Generation:** `qwen2.5-coder-3b-instruct` (via OpenAI-compatible API on port 8100)
  - **Embeddings:** `bge-large-en-v1.5` (1024 dimensions, via API on port 8110)

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/docs/installation)
- [Docker](https://docs.docker.com/get-docker/)
- A running Redis instance
- A running PostgreSQL instance with the `pgvector` extension enabled
- Local LLM and Embedding services running (as specified in Key Technologies)

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
APP_PORT=9090
APP_REDIS_HOST=localhost
APP_REDIS_PORT=6800
APP_SMTP_HOST=your_smtp_host
APP_SMTP_PORT=your_smtp_port
APP_SMTP_USER=your_smtp_user
APP_SMTP_PASS=your_smtp_password
APP_SMTP_TO_USER=recipient_email
APP_ROOT_DIR=$(pwd)

# Database Configuration
APP_DB_HOST=localhost
APP_DB_PORT=5432
APP_DB_USER=your_db_user
APP_DB_PASSWORD=your_db_password
APP_DB_NAME=jobsys

# Execution Context (use 'host' for main app, 'sandbox' is used internally)
EXECUTION_CONTEXT=host
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

3.  To add a custom job and wait for its result, send a POST request to the `/job` endpoint:
    ```bash
    curl -X POST http://localhost:9090/job \
         -H "Content-Type: application/json" \
         -d '{
               "name": "my-custom-job",
               "data": { "key": "value" }
             }'
    ```