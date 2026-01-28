// Code change types
export interface CodeChange {
    path: string;
    code: string;
    originalCode: string;
}

// Embedding types
export interface ChunkedEmbedding {
    chunkId: number;
    content: string;
    embedding: number[];
}

export type EmbeddingCategory = "error_signature" | "failure_location" | "code_context" | "metadata";

export interface CategorizedEmbedding {
    category: EmbeddingCategory;
    chunkId: number;
    content: string;
    embedding: number[];
    weight: number;
}

// Failure context types
export interface FailureLocation {
    filePath: string;
    lineNumber: number;
    columnNumber: number;
    functionName: string | null;
}

export interface ErrorSignature {
    errorType: string;
    errorMessage: string;
    normalizedSignature: string;
}

export interface FocusedCodeSnippet {
    filePath: string;
    startLine: number;
    endLine: number;
    failureLine: number;
    content: string;
}

export interface JobMetadata {
    name: string;
    id: string | undefined;
    data: Record<string, unknown>;
}

export interface StructuredFailureContext {
    errorSignature: ErrorSignature;
    failureLocations: FailureLocation[];
    focusedSnippets: FocusedCodeSnippet[];
    jobMetadata: JobMetadata;
}

// Majority vote types
export type MajorityResult<T> =
    | { winner: T; count: number; total: number }
    | { winner: null; count: number; total: number; tied: true };

// API types
export interface CreateJobRequest {
    name: string;
    data: Record<string, unknown>;
}

export interface CreateJobResponse {
    jobId: string | undefined;
    status: "created";
}

export interface JobResultResponse {
    success: boolean;
    result: unknown;
}

export interface HealthCheckResponse {
    status: "healthy" | "unhealthy";
    timestamp: string;
    services: {
        redis: ServiceStatus;
        postgres: ServiceStatus;
    };
}

export interface ServiceStatus {
    status: "up" | "down";
    latency?: number;
    error?: string;
}

// DLQ types
export interface DLQJob {
    id: string;
    name: string;
    data: Record<string, unknown>;
    failedReason?: string;
    timestamp: number;
    attemptsMade: number;
}

export interface DLQListResponse {
    jobs: DLQJob[];
    total: number;
    page: number;
    pageSize: number;
}

export interface DLQRetryResponse {
    success: boolean;
    newJobId?: string;
    error?: string;
}

// Worker types
export interface WorkerJobData {
    num?: number;
    callfile?: string;
    reasoning_fix?: boolean;
    [key: string]: unknown;
}

// Memory search result types
export interface MemorySearchResult {
    id: string;
    job_failure_id: string;
    content: string;
    distance: number;
    category: EmbeddingCategory;
    weight: number;
    weightedDistance: number;
    queryChunk: string;
}

export interface MemorySearchResponse {
    results: MemorySearchResult[];
    signatureMatch: boolean;
}

// Category weights configuration
export const CATEGORY_WEIGHTS: Record<EmbeddingCategory, number> = {
    error_signature: 3.0,
    failure_location: 2.0,
    code_context: 1.0,
    metadata: 0.5,
};
