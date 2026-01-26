import type { Job } from "bullmq";
import fs from "fs/promises";
import type { ErrorSignature, FailureLocation, FocusedCodeSnippet, StructuredFailureContext } from "./types";
import { spinUpSandboxAndRunAICodeChanges } from "./sandbox";
import { startSpinner } from "../utils";
import { searchJobFromMemory, storeJobToMemory } from "../memory-layer/memory";

const NODE_STACK_PATH_RE =
	/\(?((?:[A-Za-z]:\\|\/)?[^():\n]+\.(?:js|ts|mjs|cjs)):\d+:\d+\)?/g;

const STACK_FRAME_RE =
	/at\s+(?:(?<func>[^\s(]+)\s+)?\(?(?<file>(?:[A-Za-z]:\\|\/)?[^():\n]+\.(?:js|ts|mjs|cjs)):(?<line>\d+):(?<col>\d+)\)?/g;

const ERROR_TYPE_RE = /^(?<type>[A-Z][a-zA-Z]*Error):\s*(?<message>.+)$/m;

const TS_CAPTURE_REGEX = /\/\/ File:\s*(.*?)(?:\\n)+(?:```(?:\w+)?(?:\\n)+)?([\s\S]*?)(?=(?:\\n)*```|(?=(?:\\n)*\/\/ File:)|$)/g;

const SNIPPET_CONTEXT_LINES = 12;

function extractErrorSignature(stacktrace: string, failedReason?: string): ErrorSignature {
	const errorMatch = ERROR_TYPE_RE.exec(stacktrace) || ERROR_TYPE_RE.exec(failedReason || '');

	const errorType = errorMatch?.groups?.type || 'Error';
	const errorMessage = errorMatch?.groups?.message || failedReason || 'Unknown error';

	const normalizedMessage = errorMessage
		.replace(/job\s+\d+/gi, 'job <ID>')
		.replace(/\d{13,}/g, '<TIMESTAMP>')
		.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '<UUID>')
		.replace(/\b\d+\b/g, '<N>')
		.trim();

	const normalizedSignature = `${errorType}:${normalizedMessage}`;

	return {
		errorType,
		errorMessage,
		normalizedSignature
	};
}

function extractFailureLocations(stacktrace: string): FailureLocation[] {
	const locations: FailureLocation[] = [];
	const seen = new Set<string>();

	for (const match of stacktrace.matchAll(STACK_FRAME_RE)) {
		const filePath = match.groups?.file || '';
		const lineNumber = parseInt(match.groups?.line || '0', 10);
		const columnNumber = parseInt(match.groups?.col || '0', 10);
		const functionName = match.groups?.func || null;

		if (filePath.includes('/node_modules/')) continue;

		const key = `${filePath}:${lineNumber}`;
		if (seen.has(key)) continue;
		seen.add(key);

		locations.push({ filePath, lineNumber, columnNumber, functionName });
	}

	return locations;
}

async function extractFocusedSnippet(
	filePath: string,
	failureLine: number
): Promise<FocusedCodeSnippet | null> {
	try {
		const fileUrl = new URL(filePath, import.meta.url);
		const content = await fs.readFile(fileUrl, "utf8");
		const lines = content.split('\n');

		const startLine = Math.max(1, failureLine - SNIPPET_CONTEXT_LINES);
		const endLine = Math.min(lines.length, failureLine + SNIPPET_CONTEXT_LINES);

		const snippetLines = lines.slice(startLine - 1, endLine);
		const numberedSnippet = snippetLines
			.map((line, idx) => {
				const lineNum = startLine + idx;
				const marker = lineNum === failureLine ? '>>>' : '   ';
				return `${marker} ${lineNum.toString().padStart(4)}: ${line}`;
			})
			.join('\n');

		return {
			filePath,
			startLine,
			endLine,
			failureLine,
			content: numberedSnippet
		};
	} catch {
		return null;
	}
}

function getFilePaths(stacktrace: string) {
	const seen = new Set();
	const paths = [];

	for (const match of stacktrace.matchAll(NODE_STACK_PATH_RE)) {
		const filePath = match[1] as string;
		if (!seen.has(filePath)) {
			seen.add(filePath);
			paths.push(filePath);
		}
	}

	return paths.filter(p => !p.includes("/node_modules/"));
}

export async function extractStructuredFailureContext(job: Job): Promise<StructuredFailureContext> {
	const stacktrace = job.stacktrace?.[0] as string || '';

	const errorSignature = extractErrorSignature(stacktrace, job.failedReason);
	const failureLocations = extractFailureLocations(stacktrace);

	const snippetPromises = failureLocations.slice(0, 3).map(loc =>
		extractFocusedSnippet(loc.filePath, loc.lineNumber)
	);
	const snippetResults = await Promise.all(snippetPromises);
	const focusedSnippets = snippetResults.filter((s): s is FocusedCodeSnippet => s !== null);

	return {
		errorSignature,
		failureLocations,
		focusedSnippets,
		jobMetadata: {
			name: job.name,
			id: job.id,
			data: job.data
		}
	};
}

export async function getStacktracePathsCodeContext(job: Job) {
	const structuredContext = await extractStructuredFailureContext(job);
	const filePaths = getFilePaths(job.stacktrace[0] as string);
	filePaths.push(job.data.callfile);

	let fullCodeContext: string = '';
	let jobContext = `
==================
JOB METADATA
==================
Name: ${job.name}
Data: ${JSON.stringify(job.data)}
ID: ${job.id}

==================
ERROR SIGNATURE
==================
Type: ${structuredContext.errorSignature.errorType}
Message: ${structuredContext.errorSignature.errorMessage}
Normalized: ${structuredContext.errorSignature.normalizedSignature}

==================
FAILURE LOCATIONS
==================
${structuredContext.failureLocations.map((loc, i) =>
		`[${i + 1}] ${loc.filePath}:${loc.lineNumber}:${loc.columnNumber}${loc.functionName ? ` in ${loc.functionName}()` : ''}`
	).join('\n')}

==================
STACKTRACE
==================
${job.stacktrace[0] as string}

==================
FOCUSED CODE SNIPPETS
==================
`;

	const focusedSnippetsContext = structuredContext.focusedSnippets.map((snippet, i) =>
		`--- Snippet ${i + 1}: ${snippet.filePath} (lines ${snippet.startLine}-${snippet.endLine}, failure at ${snippet.failureLine}) ---\n${snippet.content}`
	).join('\n\n');

	for (let i = 0; i < filePaths.length; i++) {
		const path = filePaths[i] as string;
		try {
			const filePath = new URL(path, import.meta.url)
			const data = await fs.readFile(filePath, "utf8");
			fullCodeContext += `FILE ${i + 1}: ${path}
CODE IN FILE ${i + 1}:
\`\`\`
${data}
\`\`\`

`;
		} catch (err: any) {
			fullCodeContext += `FILE ${i + 1}: ${path}
ERROR: Could not read file (${err.message})

`;
		}
	}

	return {
		jobContext,
		codeContext: fullCodeContext,
		structuredContext,
		focusedSnippetsContext
	};
}

const generateResolutionSummary = async (fixPrompt: string) => {

	const messages = [
		{
			role: "system",
			content: `
You are a senior software engineer.

Your task is to write a **concise resolution summary** explaining how the job failure was fixed.

STRICT OUTPUT RULES:
1. **CONTENT:**
   - Explain the **root cause** of the failure.
   - Explain the **specific fix applied**.
   - Focus on logic and behavior, not formatting or instructions.

2. **FORMAT:**
   - Output a **single short paragraph only**.
   - No bullet points, no headings, no markdown.
   - No code.

3. **STYLE:**
   - Technical, clear, production-quality.
   - No references to prompts, instructions, or tooling.
   - Write as if for an incident or change log.

Input: Original code and fixed code.  
Output: One short resolution summary paragraph.
        `.trim(),
		},
		{
			role: "user",
			content: JSON.stringify(fixPrompt),
		}
	];


	const stopSpinner = startSpinner("Generating resolution summary...");
	let response;

	try {
		response = await fetch("http://localhost:8100/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
				messages: messages,
			}),
		});
	}
	catch (e: any) {
		console.error('Error connecting with LLM!');
		stopSpinner();
		return;
	}

	stopSpinner();

	const responseJson: any = await response.json();
	const reasonText = JSON.stringify(responseJson["choices"][0]["message"]["content"]);
	return reasonText;
}

export const jobFailureReasoning = async (job: Job) => {

	const { jobContext, codeContext, structuredContext, focusedSnippetsContext } = await getStacktracePathsCodeContext(job);
	var prompt = jobContext + focusedSnippetsContext + "\n\n==================\nFULL CODE CONTEXT\n==================\n" + codeContext;

	let stopSpinner = startSpinner("Searching vector DB for similar jobs...");
	const { electionResults, resolutionSummary, meanDistance, signatureMatch } = await searchJobFromMemory(structuredContext);
	stopSpinner();

	if (electionResults && resolutionSummary) {
		const matchType = signatureMatch ? "error signature" : "code context";
		console.log("\x1b[36m%s\x1b[0m", `> Similarities found with job ${electionResults.winner}! (matched by ${matchType})\nSimilarity %: ${((1 - meanDistance) * 100).toFixed(2)} \nMean Distance: ${meanDistance.toFixed(4)}`);
		prompt = `
===================================================
PREVIOUS SIMILAR JOB RESOLUTION SUMMARY (JOB ${electionResults.winner})
===================================================
	${resolutionSummary}
		\n` + prompt;
	} else {
		console.log("\x1b[33m%s\x1b[0m", "> No similar jobs!");
	}

	const messages = [
		{
			role: "system",
			content: `You are a senior software engineer.
Your task is to **REWRITE** the provided code to resolve the job failure.

**READ PREVIOUS RESOLUTION SUMMARIES IF AVAILABLE:** 
	 -- You must ALWAYS read the PREVIOUS SIMILARY JOB RESOLUTION SUMMARY if AVAILABLE and TRY to solve the error with that information.
	 -- If the resolution summary is non-similar or incomprehensible, ignore it.

STRICT OUTPUT RULES:
1. **ACTUAL CODE CHANGES:** You must **modify the code logic** to fix the bug. Do not just comment on the error.
   - If the code throws an intentional error that causes failure, **remove or handle it**.
   - The code you output must be the **working, fixed version**.

2. **FORMAT:**
   - **File Path First:** Line 1 must be \`// File: <path/to/file.ts>\`
   - **No Markdown/Text:** Output *only* the raw code.
   - **Indentation:** Use 4 spaces (no tabs).

3. **COMMENTING STRATEGY:**
   - **Do not** leave the old buggy code commented out. Delete it.
   - Add a comment **only on the specific line you changed** using this format:
     \`// FIX: <brief explanation of the change>\`
`.trim(),
		},
		{
			"role": "user",
			"content": JSON.stringify(prompt),
		}
	];

	stopSpinner = startSpinner("Sending code to LLM for fix...");
	let response;

	try {
		response = await fetch("http://localhost:8100/v1/chat/completions", {
			method: "POST",
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				model: "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
				messages: messages,
			}),
		});
	}
	catch (e: any) {
		console.error('Error connecting with LLM: ', e);
		stopSpinner();
		return;
	}

	stopSpinner();

	const responseJson: any = await response.json();
	const reasonText = JSON.stringify(responseJson["choices"][0]["message"]["content"]);
	const rootDir = process.env.APP_ROOT_DIR!;

	if (!rootDir) {
		console.log("No root directory found!");
		return;
	}

	const codeChanges = await Promise.all(
		Array.from(reasonText.matchAll(TS_CAPTURE_REGEX)).map(async (match) => {
			const filePath = (match[1] as string).trim();
			const rawCode = match[2] as string;

			const absolutePath = filePath.replace(rootDir, "");
			const orgCodePromise = Bun.file(absolutePath).text();

			const cleanCode = rawCode.replace(/\\([nt"])/g, (_, char) => {
				if (char === 'n') return '\n';
				if (char === 't') return '\t';
				return '"';
			}).replace(/"$/, '');

			return {
				path: filePath,
				originalCode: await orgCodePromise,
				code: cleanCode.trim(),
			};
		})
	);

	let codeChangesContext = "";
	for (let i = 0; i < codeChanges.length; i++) {
		const path = codeChanges[i]?.path as string;
		const originalCode = codeChanges[i]?.originalCode as string;
		const fixedCode = codeChanges[i]?.code as string;

		codeChangesContext += `FILE ${i + 1}: ${path}
ORIGINAL CODE IN FILE ${i + 1}:
\`\`\`
${originalCode}
\`\`\`

FIXED CODE IN FILE ${i + 1}:
\`\`\`
${fixedCode}
\`\`\`
`;
	}

	if (codeChanges.length > 0) {
		console.log("\x1b[36m%s\x1b[0m", "> Fix sent! Testing in Docker sandbox...");
		const result = await spinUpSandboxAndRunAICodeChanges(job, codeChanges);
		if (result) {
			const fixPrompt = jobContext + codeChangesContext;
			const summary = await generateResolutionSummary(fixPrompt);
			console.log("SUMMARY: \n\n", summary);
			await storeJobToMemory(job, structuredContext, result, summary as string);
		}
	}
};
