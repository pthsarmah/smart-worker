import { describe, expect, test, mock } from "bun:test";

// Test the regex patterns and context extraction logic
// Note: We test the logic directly since the actual functions require file system access

describe("Reasoning Context Extraction", () => {
    const STACK_FRAME_RE =
        /at\s+(?:(?<func>[^\s(]+)\s+)?\(?(?<file>(?:[A-Za-z]:\\|\/)?[^():\n]+\.(?:js|ts|mjs|cjs)):(?<line>\d+):(?<col>\d+)\)?/g;

    const ERROR_TYPE_RE = /^(?<type>[A-Z][a-zA-Z]*Error):\s*(?<message>.+)$/m;

    const NODE_STACK_PATH_RE =
        /\(?((?:[A-Za-z]:\\|\/)?[^():\n]+\.(?:js|ts|mjs|cjs)):\d+:\d+\)?/g;

    describe("STACK_FRAME_RE", () => {
        test("extracts function name and location", () => {
            const stackLine = "    at processJob (/app/workers.ts:15:10)";
            const match = [...stackLine.matchAll(STACK_FRAME_RE)][0];

            expect(match).toBeDefined();
            expect(match?.groups?.func).toBe("processJob");
            expect(match?.groups?.file).toBe("/app/workers.ts");
            expect(match?.groups?.line).toBe("15");
            expect(match?.groups?.col).toBe("10");
        });

        test("handles anonymous functions", () => {
            const stackLine = "    at /app/index.ts:42:5";
            const match = [...stackLine.matchAll(STACK_FRAME_RE)][0];

            expect(match).toBeDefined();
            expect(match?.groups?.func).toBeUndefined();
            expect(match?.groups?.file).toBe("/app/index.ts");
        });

        test("extracts from Windows paths", () => {
            const stackLine = "    at handler (C:\\Users\\app\\index.ts:10:3)";
            const match = [...stackLine.matchAll(STACK_FRAME_RE)][0];

            expect(match).toBeDefined();
            expect(match?.groups?.file).toBe("C:\\Users\\app\\index.ts");
        });

        test("handles .mjs and .cjs extensions", () => {
            const mjsLine = "    at foo (/app/module.mjs:5:1)";
            const cjsLine = "    at bar (/app/module.cjs:10:1)";

            expect([...mjsLine.matchAll(STACK_FRAME_RE)]).toHaveLength(1);
            expect([...cjsLine.matchAll(STACK_FRAME_RE)]).toHaveLength(1);
        });
    });

    describe("ERROR_TYPE_RE", () => {
        test("extracts error type and message", () => {
            const errorLine = "TypeError: Cannot read property 'foo' of undefined";
            const match = ERROR_TYPE_RE.exec(errorLine);

            expect(match).toBeDefined();
            expect(match?.groups?.type).toBe("TypeError");
            expect(match?.groups?.message).toBe(
                "Cannot read property 'foo' of undefined"
            );
        });

        test("handles various error types", () => {
            const errors = [
                "ReferenceError: x is not defined",
                "SyntaxError: Unexpected token",
                "RangeError: Maximum call stack size exceeded",
                "CustomError: Something went wrong",
            ];

            for (const error of errors) {
                const match = ERROR_TYPE_RE.exec(error);
                expect(match).toBeDefined();
                expect(match?.groups?.type).toMatch(/Error$/);
            }
        });

        test("does not match non-error strings", () => {
            const notError = "This is just a regular message";
            const match = ERROR_TYPE_RE.exec(notError);
            expect(match).toBeNull();
        });
    });

    describe("NODE_STACK_PATH_RE", () => {
        test("extracts file paths from stack trace", () => {
            const stacktrace = `Error: Test error
    at processJob (/app/workers.ts:15:10)
    at Object.<anonymous> (/app/index.ts:42:5)
    at Module._compile (node:internal/modules/cjs/loader:1356:14)`;

            const matches = [...stacktrace.matchAll(NODE_STACK_PATH_RE)];

            expect(matches.length).toBe(2);
            expect(matches[0]?.[1]).toBe("/app/workers.ts");
            expect(matches[1]?.[1]).toBe("/app/index.ts");
        });

        test("filters out node_modules paths manually", () => {
            const paths = [
                "/app/src/index.ts",
                "/app/node_modules/express/lib/router.js",
                "/app/workers.ts",
            ];

            const filtered = paths.filter((p) => !p.includes("/node_modules/"));
            expect(filtered).toEqual(["/app/src/index.ts", "/app/workers.ts"]);
        });
    });

    describe("Error Signature Normalization", () => {
        function normalizeErrorMessage(message: string): string {
            return message
                .replace(/job\s+\d+/gi, "job <ID>")
                .replace(/\d{13,}/g, "<TIMESTAMP>")
                .replace(
                    /\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi,
                    "<UUID>"
                )
                .replace(/\b\d+\b/g, "<N>")
                .trim();
        }

        test("normalizes job IDs", () => {
            const message = "Failed job 12345";
            expect(normalizeErrorMessage(message)).toBe("Failed job <ID>");
        });

        test("normalizes timestamps", () => {
            const message = "Error at 1705312200000";
            expect(normalizeErrorMessage(message)).toBe("Error at <TIMESTAMP>");
        });

        test("normalizes UUIDs", () => {
            const message =
                "Request 550e8400-e29b-41d4-a716-446655440000 failed";
            expect(normalizeErrorMessage(message)).toBe("Request <UUID> failed");
        });

        test("normalizes numbers", () => {
            const message = "Connection refused on port 5432";
            expect(normalizeErrorMessage(message)).toBe(
                "Connection refused on port <N>"
            );
        });

        test("handles multiple normalizations", () => {
            const message =
                "Job 123 failed at 1705312200000 with UUID 550e8400-e29b-41d4-a716-446655440000";
            const normalized = normalizeErrorMessage(message);

            expect(normalized).not.toContain("123");
            expect(normalized).not.toContain("1705312200000");
            expect(normalized).not.toContain("550e8400");
            expect(normalized).toContain("<ID>");
            expect(normalized).toContain("<TIMESTAMP>");
            expect(normalized).toContain("<UUID>");
        });
    });

    describe("Focused Snippet Generation", () => {
        test("generates line markers correctly", () => {
            const lines = ["line1", "line2", "line3", "line4", "line5"];
            const failureLine = 3;
            const startLine = 1;

            const numberedSnippet = lines
                .map((line, idx) => {
                    const lineNum = startLine + idx;
                    const marker = lineNum === failureLine ? ">>>" : "   ";
                    return `${marker} ${lineNum.toString().padStart(4)}: ${line}`;
                })
                .join("\n");

            expect(numberedSnippet).toContain(">>>    3: line3");
            expect(numberedSnippet).toContain("      1: line1");
            expect(numberedSnippet).toContain("      5: line5");
        });

        test("calculates snippet boundaries correctly", () => {
            const SNIPPET_CONTEXT_LINES = 12;
            const totalLines = 100;

            // Test near beginning
            let failureLine = 5;
            let startLine = Math.max(1, failureLine - SNIPPET_CONTEXT_LINES);
            let endLine = Math.min(totalLines, failureLine + SNIPPET_CONTEXT_LINES);
            expect(startLine).toBe(1);
            expect(endLine).toBe(17);

            // Test near end
            failureLine = 98;
            startLine = Math.max(1, failureLine - SNIPPET_CONTEXT_LINES);
            endLine = Math.min(totalLines, failureLine + SNIPPET_CONTEXT_LINES);
            expect(startLine).toBe(86);
            expect(endLine).toBe(100);

            // Test middle
            failureLine = 50;
            startLine = Math.max(1, failureLine - SNIPPET_CONTEXT_LINES);
            endLine = Math.min(totalLines, failureLine + SNIPPET_CONTEXT_LINES);
            expect(startLine).toBe(38);
            expect(endLine).toBe(62);
        });
    });
});
