import { $ } from "bun";

const ROOT_DIR = '/home/crankshaft/Projects/jobsys/';

console.log("Sandbox entrypoint started.");

const codeChangesEnv = process.env.CODE_CHANGES;

if (codeChangesEnv) {
	console.log("Applying code changes from environment variable.");
	try {
		const codeChanges: { path: string, code: string }[] = JSON.parse(codeChangesEnv);

		for (const change of codeChanges) {
			const nPath = change.path.replace(ROOT_DIR, '/app/');
			console.log(`Applying change to ${nPath}`);
			await Bun.write(nPath, change.code);
		}
		console.log("All code changes applied.");
	} catch (e) {
		console.error("Error applying code changes:", e);
		process.exit(1);
	}
} else {
	console.log("No code changes found in environment variables.");
}

console.log("Starting original application.");
await $`bun run index.ts`;
