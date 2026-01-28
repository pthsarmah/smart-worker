import { describe, expect, test } from "bun:test";
import { majorityVote, getDiffHTML } from "../utils";

describe("majorityVote", () => {
    test("returns winner when clear majority exists", () => {
        const result = majorityVote([1, 1, 1, 2, 3]);
        expect(result.winner).toBe(1);
        expect(result.count).toBe(3);
        expect(result.total).toBe(5);
    });

    test("returns null winner when no majority", () => {
        const result = majorityVote([1, 2, 3, 4, 5]);
        expect(result.winner).toBeNull();
        expect("tied" in result && result.tied).toBe(true);
    });

    test("returns null winner when tied", () => {
        const result = majorityVote([1, 1, 2, 2]);
        expect(result.winner).toBeNull();
        expect("tied" in result && result.tied).toBe(true);
    });

    test("throws error on empty input", () => {
        expect(() => majorityVote([])).toThrow("majorityVote: empty input");
    });

    test("throws error when input is not array", () => {
        // @ts-expect-error - testing invalid input
        expect(() => majorityVote("not an array")).toThrow(
            "values must be an array"
        );
    });

    test("works with custom equality function", () => {
        const objects = [
            { id: 1, name: "a" },
            { id: 1, name: "b" },
            { id: 1, name: "c" },
            { id: 2, name: "d" },
        ];
        const result = majorityVote(objects, (a, b) => a.id === b.id);
        expect(result.winner?.id).toBe(1);
        expect(result.count).toBe(3);
    });

    test("handles single element array", () => {
        const result = majorityVote([42]);
        expect(result.winner).toBe(42);
        expect(result.count).toBe(1);
        expect(result.total).toBe(1);
    });

    test("handles two element array with same values", () => {
        const result = majorityVote([5, 5]);
        expect(result.winner).toBe(5);
        expect(result.count).toBe(2);
    });

    test("handles string values", () => {
        const result = majorityVote(["a", "b", "a", "a"]);
        expect(result.winner).toBe("a");
        expect(result.count).toBe(3);
    });
});

describe("getDiffHTML", () => {
    test("generates HTML with added content highlighted", () => {
        const oldCode = '"line1\\nline2"';
        const newCode = '"line1\\nline2\\nline3"';
        const result = getDiffHTML(oldCode, newCode);

        expect(result).toContain("background-color: #e6ffec");
        expect(result).toContain("line3");
    });

    test("generates HTML with removed content highlighted", () => {
        const oldCode = '"line1\\nline2\\nline3"';
        const newCode = '"line1\\nline2"';
        const result = getDiffHTML(oldCode, newCode);

        expect(result).toContain("background-color: #ffebe9");
        expect(result).toContain("line-through");
    });

    test("escapes HTML special characters", () => {
        const oldCode = '"<script>alert(1)</script>"';
        const newCode = '"<div>safe</div>"';
        const result = getDiffHTML(oldCode, newCode);

        expect(result).toContain("&lt;script&gt;");
        expect(result).toContain("&lt;div&gt;");
        expect(result).not.toContain("<script>");
    });

    test("handles non-JSON strings gracefully", () => {
        const oldCode = "plain old text";
        const newCode = "plain new text";
        const result = getDiffHTML(oldCode, newCode);

        expect(result).toContain("old");
        expect(result).toContain("new");
    });

    test("wraps output in styled div", () => {
        const result = getDiffHTML('"a"', '"b"');

        expect(result).toMatch(/^<div style="[^"]*font-family:/);
        expect(result).toMatch(/<\/div>$/);
    });

    test("handles empty strings", () => {
        const result = getDiffHTML('""', '""');
        expect(result).toContain("<div");
        expect(result).toContain("</div>");
    });

    test("handles identical content", () => {
        const code = '"same content"';
        const result = getDiffHTML(code, code);

        // Should have unchanged content styling (gray)
        expect(result).toContain("color: #6a737d");
    });
});
