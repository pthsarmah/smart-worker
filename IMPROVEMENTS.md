# Project Improvements & Suggestions

This document outlines suggested improvements for the `smart-worker` project to enhance its reliability, maintainability, and scalability.

## 1. Configuration & Environment Management

- **Centralized Configuration:**
  - Currently, environment variables are accessed directly (e.g., `process.env.APP_PORT` in `index.ts`).
  - **Suggestion:** Use a configuration library like `dotenv` combined with a schema validator like `zod` or `envalid`. This ensures all required variables are present and correctly typed at startup.
  - Create a `config.ts` file that exports a validated configuration object.

- **AI Provider Flexibility:**
  - The AI service URL (`http://localhost:8100`) and model parameters are hardcoded in `reasoning-layer/reasoning.ts`.
  - **Suggestion:** Abstract the AI client into a service or interface. Allow configuration for different providers (OpenAI, Anthropic, Ollama, etc.) via environment variables.

## 2. Architecture & Code Structure

- **Separation of Concerns:**
  - `workers.ts` currently contains hardcoded "hazard testing" logic (e.g., failing if `job.data.num === 10`).
  - **Suggestion:** Separate "demo" or "test" workers from production workers. Create a dedicated `TestWorker` or `HazardWorker` for testing failure scenarios, keeping the main `LoginWorker` (or renamed `GenericWorker`) clean.

- **Structured Logging:**
  - The project uses `console.log` and `console.error`.
  - **Suggestion:** Implement a structured logging library like `pino` or `winston`. This allows for log levels (INFO, WARN, ERROR), JSON output for easy parsing, and better context tracking (job IDs, request IDs).

- **Type Safety:**
  - Ensure strictly typed interfaces are used throughout, minimizing `any`. Share types between the API and the worker using a shared types file or package.

## 3. Testing & Quality Assurance

- **Unit & Integration Tests:**
  - While there is a `test.ts` TUI, there are no standard automated tests.
  - **Suggestion:** Implement a testing framework using `bun test`.
    - **Unit Tests:** For utility functions in `utils.ts`, context extraction in `reasoning.ts`.
    - **Integration Tests:** For API endpoints (mocking the queue) and Worker logic (mocking the AI service).

- **CI/CD Pipelines:**
  - **Suggestion:** Add a GitHub Actions workflow (or similar) to run linting, type checking, and tests on every push.

## 4. Deployment & DevOps

- **Containerization of Main App:**
  - The project uses Docker for the sandbox, but the main application itself lacks a `Dockerfile`.
  - **Suggestion:** Create a `Dockerfile` for the main `smart-worker` application to simplify deployment.
  - Create a `docker-compose.yml` that orchestrates the app, Redis, PostgreSQL, and potentially the local LLM service for a complete local dev environment.

- **Graceful Shutdown:**
  - The server currently doesn't handle termination signals (`SIGTERM`, `SIGINT`).
  - **Suggestion:** Implement graceful shutdown logic to close Redis connections, stop workers, and finish processing active requests before exiting.

## 5. Reliability & Monitoring

- **Dead Letter Queue (DLQ) Management:**
  - Jobs are moved to DLQ, but there is no easy way to inspect or retry them.
  - **Suggestion:** Add API endpoints to:
    - List jobs in DLQ.
    - Retry a job from DLQ.
    - Clear DLQ.

- **Health Checks:**
  - **Suggestion:** Add a `/health` endpoint that checks the status of Redis and PostgreSQL connections.

## 6. Documentation

- **API Documentation:**
  - **Suggestion:** Use Swagger/OpenAPI (e.g., with `swagger-ui-express`) to document the `/job` and `/` endpoints.

- **Architecture Diagrams:**
  - Add visual diagrams (using Mermaid.js) to the `README` to explain the flow between the Queue, Worker, AI Layer, and Sandbox.
