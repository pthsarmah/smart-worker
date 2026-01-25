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

export type MajorityResult<T> =
	| { winner: T; count: number; total: number }
	| { winner: null; count: number; total: number; tied: true };
