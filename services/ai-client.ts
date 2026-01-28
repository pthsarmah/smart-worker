import { aiConfig } from "../config";
import { logAIInteraction } from "../logger";

export interface ChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
}

export interface ChatCompletionResponse {
    id: string;
    object: string;
    created: number;
    model: string;
    choices: Array<{
        index: number;
        message: {
            role: string;
            content: string;
        };
        finish_reason: string;
    }>;
    usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

export interface EmbeddingResponse {
    embedding: number[];
}

export interface AIClientOptions {
    serviceUrl?: string;
    modelName?: string;
    embeddingUrl?: string;
    embeddingModel?: string;
}

export class AIClient {
    private serviceUrl: string;
    private modelName: string;
    private embeddingUrl: string;
    private embeddingModel: string;

    constructor(options: AIClientOptions = {}) {
        this.serviceUrl = options.serviceUrl ?? aiConfig.serviceUrl;
        this.modelName = options.modelName ?? aiConfig.modelName;
        this.embeddingUrl = options.embeddingUrl ?? aiConfig.embeddingUrl;
        this.embeddingModel = options.embeddingModel ?? aiConfig.embeddingModel;
    }

    async chat(messages: ChatMessage[]): Promise<ChatCompletionResponse> {
        logAIInteraction("chat_request", {
            model: this.modelName,
            messageCount: messages.length,
        });

        const response = await fetch(`${this.serviceUrl}/v1/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: this.modelName,
                messages,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logAIInteraction("chat_error", { error: errorText, status: response.status });
            throw new Error(`AI chat request failed: ${response.status} ${errorText}`);
        }

        const result = await response.json() as ChatCompletionResponse;
        logAIInteraction("chat_response", {
            model: result.model,
            usage: result.usage,
        });

        return result;
    }

    async getChatContent(messages: ChatMessage[]): Promise<string> {
        const response = await this.chat(messages);
        return response.choices[0]?.message.content ?? "";
    }

    async generateEmbedding(text: string): Promise<number[]> {
        logAIInteraction("embedding_request", {
            model: this.embeddingModel,
            textLength: text.length,
        });

        const response = await fetch(`${this.embeddingUrl}/embedding`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: text,
                encoding_format: "float",
                model: this.embeddingModel,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logAIInteraction("embedding_error", { error: errorText, status: response.status });
            throw new Error(`Embedding request failed: ${response.status} ${errorText}`);
        }

        const embeddings = await response.json() as EmbeddingResponse[];
        const embedding = embeddings[0]?.embedding ?? [];

        logAIInteraction("embedding_response", {
            dimensions: embedding.length,
        });

        return embedding;
    }

    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        const results: number[][] = [];
        for (const text of texts) {
            const embedding = await this.generateEmbedding(text);
            results.push(embedding);
        }
        return results;
    }
}

// Default singleton instance
export const aiClient = new AIClient();

export default aiClient;
