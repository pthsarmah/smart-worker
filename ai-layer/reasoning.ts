import type { Job } from "bullmq";
import fs from "fs/promises";
import type { CodeChange } from "./types";
import { spinUpSandboxAndRunAICodeChanges } from "./sandbox";

const NODE_STACK_PATH_RE =
	/\(?((?:[A-Za-z]:\\|\/)?[^():\n]+\.(?:js|ts|mjs|cjs)):\d+:\d+\)?/g;

const TS_CAPTURE_REGEX = /\/\/ File:\s*(.*?)(?:\\n)+(?:```(?:\w+)?(?:\\n)+)?([\s\S]*?)(?=(?:\\n)*```|(?=(?:\\n)*\/\/ File:)|$)/g;

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

export async function getStacktracePathsCodeContext(job: Job) {
	const filePaths = getFilePaths(job.stacktrace[0] as string);
	filePaths.push(job.data.callfile);

	let codeContext = `
==================
JOB METADATA
==================
Name: ${job.name}
Data: ${JSON.stringify(job.data)}
ID: ${job.id}

==================
STACKTRACE
==================
${job.stacktrace[0] as string}

==================
CODE CONTEXT
==================
`;

	for (let i = 0; i < filePaths.length; i++) {
		const path = filePaths[i] as string;
		try {
			const filePath = new URL(path, import.meta.url)
			const data = await fs.readFile(filePath, "utf8");
			codeContext += `FILE ${i + 1}: ${path}
CODE IN FILE ${i + 1}:
\`\`\`
${data}
\`\`\`

`;
		} catch (err: any) {
			codeContext += `FILE ${i + 1}: ${path}
ERROR: Could not read file (${err.message})

`;
		}
	}

	return codeContext;
}

export const jobFailureReasoning = async (job: Job) => {

	const prompt = await getStacktracePathsCodeContext(job);
	const messages = [
		{
			role: "system",
			content: `You are a senior software engineer.
Your task is to **REWRITE** the provided code to resolve the job failure.

STRICT OUTPUT RULES:
1. **ACTUAL CODE CHANGES:** You must **modify the code logic** to fix the bug. Do not just comment on the error.
   - If the code throws an intentional error that causes failure, **remove or handle it**.
   - The code you output must be the **working, fixed version**.

2. **FORMAT:**
   - **File Path First:** Line 1 must be \`// File: path/to/file.ts\`
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

	const response = await fetch("http://localhost:8080/v1/chat/completions", {
		method: "POST",
		headers: {
			"Content-Type": "application/json"
		},
		body: JSON.stringify({
			model: "qwen2.5-coder-3b-instruct-q4_k_m.gguf",
			messages: messages,
		}),
	});

	const responseJson: any = await response.json();
	const reasonText = JSON.stringify(responseJson["choices"][0]["message"]["content"]);

	let codeChanges: CodeChange[] = [];

	for (const match of reasonText.matchAll(TS_CAPTURE_REGEX)) {
		const rawPath = match[1] as string;
		const rawCode = match[2] as string;

		const filePath = rawPath.trim();
		const cleanCode = rawCode
			.replace(/\\n/g, '\n')  // Unescape newlines
			.replace(/\\t/g, '\t')
			.replace(/\\"/g, '"')   // Unescape quotes
			.replace(/"$/, '');     // Remove potential trailing quote from JSON.stringify

		console.log(`
=============
FILE: ${filePath}
=============`);

		console.log(cleanCode.trim());
		codeChanges.push({
			path: filePath,
			code: cleanCode.trim(),
		});
	}

	if (codeChanges.length > 0) {
		spinUpSandboxAndRunAICodeChanges(job, codeChanges);
	}
};
