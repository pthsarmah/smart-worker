export interface CodeChange {
	path: string;
	code: string;
	originalCode: string;
};

export type ChunkedEmbedding = {
	chunkId: number;
	content: string;
	embedding: any[],
}
