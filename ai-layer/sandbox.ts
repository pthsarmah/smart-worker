import { $ } from 'bun';
import type { CodeChange } from './types';
import { runFailedJob } from './run-job';
import type { Job } from 'bullmq';
import { destroySandbox } from './destroy-sandbox';
import { EmailClient } from '../email';
import { getDiffHTML } from '../utils';

var ROOT_DIRECTORY = './';

const initPorts = (sPort: string) => {
	return `
FROM oven/bun:1.0.25-alpine
WORKDIR /app
RUN apk add --no-cache curl
RUN apk add --no-cache redis
RUN adduser -D sandbox
USER sandbox
COPY --chown=sandbox:sandbox ${ROOT_DIRECTORY} .
ENV PORT=${sPort}
EXPOSE ${sPort}/tcp
CMD ["sh", "-c", "redis-server --daemonize no & exec bun run ai-layer/entrypoint.ts"]
`
}

export const prepareDockerContainer = async (dockerfileContent: string) => {
	try {
		const bytes = await Bun.write(`${import.meta.dir}/Dockerfile.temp`, dockerfileContent);
		if (bytes > 0) console.log("\x1b[36m%s\x1b[0m", ">> Dockerfile written!");
		else throw new Error('No bytes written');
	} catch (e) {
		console.error("Error creating dockerfile: ", e);
	}
}

export const buildDockerContainer = async () => {
	const file = Bun.file(`${import.meta.dir}/Dockerfile.temp`);
	const fileStr = await file.text();

	if (!file || !fileStr) {
		console.error("Error reading dockerfile!");
		return;
	}

	await $`docker build -f ${import.meta.dir}/Dockerfile.temp -t bun-sandbox ${ROOT_DIRECTORY}`.quiet();
}

export const createDockerNetwork = async () => {
	console.log("\x1b[34m%s\x1b[0m", "> Creating a Docker network...");
	const existing_networks = await $`docker network ls --filter name=sandbox --format "{{.Name}}"`.text();
	if (existing_networks.includes("sandbox")) {
		console.log("Network already exists");
		return;
	}
	await $`docker network create sandbox --driver=bridge`.quiet();
}

export const runDockerContainer = async (jobName: string, codeChanges: CodeChange[], sandboxPort: string) => {
	console.log("\x1b[34m%s\x1b[0m", "> Testing code changes...");
	const codeChangesJSON = JSON.stringify(codeChanges);

	const result = await $`docker run -d --rm --memory=128m --network=sandbox --cpus=0.5 --name=bun-sandbox-${jobName} --pids-limit=64 -p ${sandboxPort}:${sandboxPort} -e CODE_CHANGES=${codeChangesJSON} bun-sandbox`;
	console.log(`Started container with ID: ${result.stdout.toString().trim()}`);
}

export const spinUpSandboxAndRunAICodeChanges = async (job: Job, codeChanges: CodeChange[]) => {

	const sPort = Math.floor(Math.random() * (20000 - 10000) + 10000);

	const dockerfileContent = initPorts(sPort.toString());
	const jobDockerId = `${job.name}-one`;

	try {
		console.log("\x1b[34m%s\x1b[0m", `> Preparing sandbox for job ${job.id}`);
		await prepareDockerContainer(dockerfileContent);
		await buildDockerContainer();
		await createDockerNetwork();
		await runDockerContainer(jobDockerId, codeChanges, sPort.toString());

		console.log("\x1b[34m%s\x1b[0m", "> Waiting for sandbox container to start...");

		await new Promise(resolve => setTimeout(resolve, 10000));

		console.log("Sandbox ready. Running job...");
		const result = await runFailedJob(job, sPort.toString());

		if (result.success) {
			console.log("\x1b[36m%s\x1b[0m", `>> Job ${job.id} ran successfully in sandbox.`);
			console.log("\x1b[36m%s\x1b[0m", `>> Email sent with proposed changes`);

			const html = codeChanges.map(c => {
				const codeHtml = getDiffHTML(JSON.stringify(c.originalCode), JSON.stringify(c.code));
				const str = `<b>Path</b>: ${c.path}<br><br>
										 <b>Code</b>: <br><br><code>${codeHtml}</code><br><br>==========================`
				return str;
			}).join("<br><br>");

			EmailClient.Instance.sendSuccessEmail(html);
		}
		else {
			console.error(`Job ${job.id} failed in sandbox.`);
		}
	} catch (error) {
		console.error(`An error occurred in sandbox for job ${job.id}:`, error);
	} finally {
		await destroySandbox(jobDockerId);
	}
}
