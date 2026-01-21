import { $ } from "bun";

console.log("Sandbox entrypoint started.");

const rootDirectory = process.env.APP_ROOT_DIR;
const codeChangesEnv = process.env.APP_CODE_CHANGES;

if (!rootDirectory) {
	console.error("No root directory found in environment variables!");
}
else if (!codeChangesEnv) {
	console.error("No code changes found in environment variables!");
}
else {
	console.log("Applying code changes from environment variable.");
	try {
		const codeChanges: { path: string, code: string }[] = JSON.parse(codeChangesEnv);

		for (const change of codeChanges) {
			const nPath = change.path.replace(rootDirectory, '/app/');
			console.log(`Applying change to ${nPath}`);
			await Bun.write(nPath, change.code);
		}
		console.log("All code changes applied.");
	} catch (e) {
		console.error("Error applying code changes:", e);
	}
}

console.log("Starting original application.");
await $`bun run index.ts`;
