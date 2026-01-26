import { BoxRenderable, createCliRenderer, RGBA, SelectRenderable, SelectRenderableEvents, TextRenderable } from "@opentui/core"

const renderer = await createCliRenderer({
	exitOnCtrlC: true,
});

const transparent = new RGBA(new Float32Array([0, 0, 0, 0]));

const API_URL = "http://localhost:9090/job";

type HazardOption = {
	name: string;
	description: string;
	jobName: string;
	jobData: Record<string, unknown>;
	setupFn?: () => Promise<void>;
};

const hazardOptions: HazardOption[] = [
	{
		name: "Data type error",
		description: "Send string instead of number",
		jobName: "start-worker",
		jobData: { value: "not-a-number" },
	},
	{
		name: "Missing required field",
		description: "Omit required data field",
		jobName: "start-worker",
		jobData: {},
	},
	{
		name: "Null data value",
		description: "Send null as data value",
		jobName: "start-worker",
		jobData: { value: null },
	},
	{
		name: "Invalid nested object",
		description: "Send malformed nested data",
		jobName: "start-worker",
		jobData: { config: { invalid: undefined, circular: "[Circular]" } },
	},
	{
		name: "Array instead of object",
		description: "Send array where object expected",
		jobName: "start-worker",
		jobData: { items: "should-be-array" },
	},
	{
		name: "Env variable missing",
		description: "Remove TEST_ENV_VAR from env",
		jobName: "start-worker",
		jobData: { value: 30, requiresEnv: true },
		setupFn: async () => {
			const envFile = await Bun.file(".env.docker").text();
			const newEnvText = envFile.replace(/TEST_ENV_VAR=.*\n?/g, "");
			await Bun.write(".env.docker", newEnvText);
		},
	},
	{
		name: "Invalid file path",
		description: "Reference non-existent file",
		jobName: "start-worker",
		jobData: { filePath: "/nonexistent/path/file.txt" },
	},
	{
		name: "Division by zero",
		description: "Send zero as divisor",
		jobName: "start-worker",
		jobData: { dividend: 100, divisor: 0 },
	},
	{
		name: "Negative array index",
		description: "Send negative index for array access",
		jobName: "start-worker",
		jobData: { arrayIndex: -1, items: [1, 2, 3] },
	},
	{
		name: "Overflow number",
		description: "Send number exceeding safe integer",
		jobName: "start-worker",
		jobData: { value: Number.MAX_SAFE_INTEGER + 1000 },
	},
	{
		name: "Empty string key",
		description: "Send object with empty string key",
		jobName: "start-worker",
		jobData: { "": "empty-key-value" },
	},
	{
		name: "Deep nesting",
		description: "Send deeply nested object",
		jobName: "start-worker",
		jobData: { a: { b: { c: { d: { e: { f: { g: { h: "deep" } } } } } } } },
	},
	{
		name: "Special characters",
		description: "Send special chars in strings",
		jobName: "start-worker",
		jobData: { text: "\x00\x01\x02\n\r\t" },
	},
	{
		name: "Unicode edge cases",
		description: "Send problematic unicode",
		jobName: "start-worker",
		jobData: { text: "\uD800\uDC00\uFFFD\u0000" },
	},
	{
		name: "Large payload",
		description: "Send oversized data payload",
		jobName: "start-worker",
		jobData: { largeArray: Array(10000).fill("x".repeat(100)) },
	},
];

const sendJob = async (option: HazardOption): Promise<{ success: boolean; message: string }> => {
	try {
		if (option.setupFn) {
			await option.setupFn();
		}

		const res = await fetch(API_URL, {
			method: "POST",
			body: JSON.stringify({
				name: option.jobName,
				data: option.jobData,
			}),
			headers: { "Content-Type": "application/json" }
		});

		if (!res.ok) {
			const text = await res.text();
			return { success: false, message: `HTTP ${res.status}: ${text}` };
		}

		const json = await res.json();
		return { success: true, message: `Job queued: ${JSON.stringify(json)}` };
	} catch (err: any) {
		return { success: false, message: `Error: ${err.message}` };
	}
};

const menuOptions = hazardOptions.map(h => ({
	name: h.name,
	description: h.description,
}));

const menu = new SelectRenderable(renderer, {
	id: "hazard-menu",
	width: 50,
	height: hazardOptions.length,
	backgroundColor: transparent,
	selectedBackgroundColor: transparent,
	selectedTextColor: "#f67400",
	focusedBackgroundColor: transparent,
	options: menuOptions,
});

const statusText = new TextRenderable(renderer, {
	id: "status-text",
	width: 50,
	height: 3,
	content: "Select a hazard to inject...",
	fg: "#888888",
});

const resultText = new TextRenderable(renderer, {
	id: "result-text",
	width: 50,
	height: 2,
	content: "",
	fg: "#00ff00",
});

menu.on(SelectRenderableEvents.ITEM_SELECTED, async (_, option) => {
	const hazard = hazardOptions.find(h => h.name === option.name);
	if (!hazard) return;

	statusText.content = `Injecting: ${hazard.name}...`;
	statusText.fg = "#ffff00";

	const result = await sendJob(hazard);

	if (result.success) {
		statusText.content = `Sent: ${hazard.name}`;
		statusText.fg = "#00ff00";
		resultText.content = result.message;
		resultText.fg = "#00ff00";
	} else {
		statusText.content = `Failed to send: ${hazard.name}`;
		statusText.fg = "#ff0000";
		resultText.content = result.message;
		resultText.fg = "#ff0000";
	}
});

menu.on(SelectRenderableEvents.SELECTION_CHANGED, (_, option) => {
	const hazard = hazardOptions.find(h => h.name === option.name);
	if (hazard) {
		statusText.content = hazard.description;
		statusText.fg = "#888888";
	}
});

menu.showDescription = false;
menu.focus();

const menuContainer = new BoxRenderable(renderer, {
	id: "menu-container",
	width: 54,
	height: hazardOptions.length + 4,
	padding: 2,
	flexDirection: "column",
	justifyContent: "flex-start",
	alignItems: "flex-start",
	title: "Hazard Injector",
	border: true,
	borderStyle: "single",
	titleAlignment: "left",
});

const statusContainer = new BoxRenderable(renderer, {
	id: "status-container",
	width: 54,
	height: 7,
	padding: 2,
	flexDirection: "column",
	justifyContent: "flex-start",
	alignItems: "flex-start",
	title: "Status",
	border: true,
	borderStyle: "single",
	titleAlignment: "left",
});

const mainContainer = new BoxRenderable(renderer, {
	id: "main-container",
	width: 56,
	height: hazardOptions.length + 15,
	padding: 1,
	flexDirection: "column",
	justifyContent: "flex-start",
	alignItems: "center",
	gap: 1,
});

menuContainer.add(menu);
statusContainer.add(statusText);
statusContainer.add(resultText);
mainContainer.add(menuContainer);
mainContainer.add(statusContainer);
renderer.root.add(mainContainer);
