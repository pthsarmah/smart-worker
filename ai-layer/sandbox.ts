import { $ } from 'bun';
import type { CodeChange } from './types';
import { runFailedJob } from './run-job';
import type { Job } from 'bullmq';
import { destroySandbox } from './destroy-sandbox';

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
CMD sh -c "redis-server --daemonize yes && bun run ai-layer/entrypoint.ts"
`
}

export const prepareDockerContainer = async (dockerfileContent: string) => {
	try {
		const bytes = await Bun.write(`${import.meta.dir}/Dockerfile`, dockerfileContent);
		if (bytes > 0) console.log("Dockerfile written!");
		else throw new Error('No bytes written');
	} catch (e) {
		console.error("Error creating dockerfile: ", e);
	}
}

export const buildDockerContainer = async () => {
	const file = Bun.file(`${import.meta.dir}/Dockerfile`);
	const fileStr = await file.text();

	if (!file || !fileStr) {
		console.error("Error reading dockerfile!");
		return;
	}

	const result = await $`docker build -f ${import.meta.dir}/Dockerfile -t bun-sandbox ${ROOT_DIRECTORY}`;

	console.log(result.stdout.toString());
}

export const createDockerNetwork = async () => {
	const existing_networks = await $`docker network ls --filter name=sandbox --format "{{.Name}}"`.text();
	if (existing_networks.includes("sandbox")) {
		console.log("network sandbox already exists");
		return;
	}
	const result = await $`docker network create sandbox --driver=bridge`;
	console.log(result.stdout.toString());
}

export const runDockerContainer = async (jobName: string, codeChanges: CodeChange[], sandboxPort: string) => {
	const codeChangesJSON = JSON.stringify(codeChanges);

	const result = await $`docker run -d --rm --memory=128m --network=sandbox --cpus=0.5 --name=bun-sandbox-${jobName} --pids-limit=64 -p ${sandboxPort}:${sandboxPort} -e CODE_CHANGES=${codeChangesJSON} bun-sandbox`;
	console.log(`Started container with ID: ${result.stdout.toString().trim()}`);
}

export const spinUpSandboxAndRunAICodeChanges = async (job: Job, codeChanges: CodeChange[]) => {

	const sPort = Math.floor(Math.random() * (20000 - 10000) + 10000);

	const dockerfileContent = initPorts(sPort.toString());
	const jobDockerId = `${job.name}-one`;

	try {
		console.log(`Preparing sandbox for job ${job.id}`);
		await prepareDockerContainer(dockerfileContent);
		await buildDockerContainer();
		await createDockerNetwork();
		await runDockerContainer(jobDockerId, codeChanges, sPort.toString());

		console.log("Waiting for sandbox container to start...");

		await new Promise(resolve => setTimeout(resolve, 10000));

		console.log("Sandbox ready. Running job...");
		const result = await runFailedJob(job, sPort.toString());

		if (result.success) {
			console.log(`Job ${job.id} ran successfully in sandbox.`);
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
