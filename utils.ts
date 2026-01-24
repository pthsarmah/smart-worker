import { stdout } from "process"
import * as Diff from 'diff';
import type { MajorityResult } from "./reasoning-layer/types";

export function majorityVote<T>(
	values: readonly T[],
	equals: (a: T, b: T) => boolean = Object.is
): MajorityResult<T> {
	if (!Array.isArray(values)) {
		throw new TypeError("values must be an array");
	}

	if (values.length === 0) {
		throw new Error("majorityVote: empty input");
	}

	const counts: { value: T; count: number }[] = [];

	for (const v of values) {
		let found = false;

		for (const entry of counts) {
			if (equals(entry.value, v)) {
				entry.count++;
				found = true;
				break;
			}
		}

		if (!found) {
			counts.push({ value: v, count: 1 });
		}
	}

	let max = 0;
	for (const { count } of counts) {
		if (count > max) max = count;
	}

	const winners = counts.filter(e => e.count === max);
	const majorityThreshold = Math.floor(values.length / 2) + 1;

	if (max < majorityThreshold) {
		return { winner: null, count: max, total: values.length, tied: true };
	}

	if (winners.length > 1) {
		return { winner: null, count: max, total: values.length, tied: true };
	}

	return {
		winner: winners[0]?.value!,
		count: winners[0]?.count!,
		total: values.length,
	};
}

export function startSpinner(loadingText: string) {
	const characters = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
	const cursorEsc = {
		hide: '\u001B[?25l',
		show: '\u001B[?25h',
	}
	stdout.write(cursorEsc.hide)

	let i = 0;
	const timer = setInterval(function() {
		stdout.write("\r" + "\x1b[33m" + characters[i++] + " " + loadingText);
		i = i >= characters.length ? 0 : i;
	}, 150);

	return () => {
		clearInterval(timer);
		stdout.write("\r\x1b[2K" + "\x1b[0m");
		stdout.write(cursorEsc.show);
	}
}

export function getDiffHTML(oldCodeJson: string, newCodeJson: string): string {
	let oldCode: string;
	let newCode: string;

	try {
		oldCode = JSON.parse(oldCodeJson);
		newCode = JSON.parse(newCodeJson);
	} catch (e) {
		oldCode = oldCodeJson;
		newCode = newCodeJson;
	}

	const diffResult = Diff.diffTrimmedLines(oldCode, newCode);

	const escapeHtml = (unsafe: string): string => {
		return unsafe
			.replace(/&/g, "&amp;")
			.replace(/</g, "&lt;")
			.replace(/>/g, "&gt;")
			.replace(/"/g, "&quot;")
			.replace(/'/g, "&#039;");
	};

	const formatText = (text: string): string => {
		let escaped = escapeHtml(text);
		escaped = escaped.replace(/\n/g, "<br>");
		return escaped.replace(/(\t|  )/g, "&nbsp;&nbsp;");
	};

	let htmlOutput = '<div style="font-family: Menlo, Monaco, Consolas, monospace; background-color: #f7f7f7; padding: 10px; border: 1px solid #ddd; font-size: 12px; line-height: 1.5;">';

	diffResult.forEach((part) => {
		const value = formatText(part.value);

		if (part.added) {
			htmlOutput += `<span style="background-color: #e6ffec; color: #24292e; display: inline-block; width: 100%;">${value}</span>`;
		} else if (part.removed) {
			htmlOutput += `<span style="background-color: #ffebe9; color: #cb2431; text-decoration: line-through; display: inline-block; width: 100%; opacity: 0.8;">${value}</span>`;
		} else {
			htmlOutput += `<span style="color: #6a737d;">${value}</span>`;
		}
	});

	htmlOutput += '</div>';

	return htmlOutput;
}
