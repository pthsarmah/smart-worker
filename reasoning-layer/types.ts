export interface CodeChange {
	path: string;
	code: string;
	originalCode: string;
};

export type ChunkedEmbedding = {
	chunkId: number;
	content: string;
	embedding: number[],
}

export type EmbeddingCategory = 'error_signature' | 'failure_location' | 'code_context' | 'metadata';

export type CategorizedEmbedding = {
	category: EmbeddingCategory;
	chunkId: number;
	content: string;
	embedding: number[];
	weight: number;
}

export type FailureLocation = {
	filePath: string;
	lineNumber: number;
	columnNumber: number;
	functionName: string | null;
}

export type ErrorSignature = {
	errorType: string;
	errorMessage: string;
	normalizedSignature: string;
}

export type FocusedCodeSnippet = {
	filePath: string;
	startLine: number;
	endLine: number;
	failureLine: number;
	content: string;
}

export type StructuredFailureContext = {
	errorSignature: ErrorSignature;
	failureLocations: FailureLocation[];
	focusedSnippets: FocusedCodeSnippet[];
	jobMetadata: {
		name: string;
		id: string | undefined;
		data: Record<string, unknown>;
	};
}

export type MajorityResult<T> =
	| { winner: T; count: number; total: number }
	| { winner: null; count: number; total: number; tied: true };
