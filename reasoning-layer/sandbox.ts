import { $ } from "bun";
import { runFailedJob } from "./run-job";
import type { Job } from "bullmq";
import { destroySandbox } from "./destroy-sandbox";
import { EmailClient } from "../email";
import { getDiffHTML } from "../utils";
import { logger, logSandbox } from "../logger";
import type { CodeChange } from "../types";

var ROOT_DIRECTORY = "./";

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
CMD ["sh", "-c", "redis-server --daemonize no --port 6800 & exec bun run reasoning-layer/entrypoint.ts"]
`;
};

export const prepareDockerContainer = async (dockerfileContent: string) => {
    try {
        const bytes = await Bun.write(
            `${import.meta.dir}/Dockerfile.temp`,
            dockerfileContent
        );
        if (bytes > 0) logSandbox("dockerfile_written");
        else throw new Error("No bytes written");
    } catch (e) {
        logger.error({ error: e }, "Error creating dockerfile");
    }
};

export const buildDockerContainer = async () => {
    const file = Bun.file(`${import.meta.dir}/Dockerfile.temp`);
    const fileStr = await file.text();

    if (!file || !fileStr) {
        logger.error("Error reading dockerfile");
        return;
    }

    await $`docker build -f ${import.meta.dir}/Dockerfile.temp -t bun-sandbox ${ROOT_DIRECTORY}`.quiet();
};

export const createDockerNetwork = async () => {
    logSandbox("creating_network");
    const existing_networks =
        await $`docker network ls --filter name=sandbox --format "{{.Name}}"`.text();
    if (existing_networks.includes("sandbox")) {
        logger.debug("Docker network already exists");
        return;
    }
    await $`docker network create sandbox --driver=bridge`.quiet();
};

export const runDockerContainer = async (
    jobName: string,
    codeChanges: CodeChange[],
    sandboxPort: string
) => {
    logSandbox("running_container", undefined, { jobName, port: sandboxPort });
    const codeChangesJSON = JSON.stringify(codeChanges);

    const result =
        await $`docker run --env-file .env.docker -d --rm --memory=128m --network=sandbox --cpus=0.5 --name=bun-sandbox-${jobName} --pids-limit=64 -p ${sandboxPort}:${sandboxPort} -e APP_CODE_CHANGES=${codeChangesJSON} -e APP_PORT=${sandboxPort} bun-sandbox`;

    logger.debug(
        { containerId: result.stdout.toString().trim() },
        "Started sandbox container"
    );
};

export const spinUpSandboxAndRunAICodeChanges = async (
    job: Job,
    codeChanges: CodeChange[]
) => {
    const sPort = Math.floor(Math.random() * (20000 - 10000) + 10000);

    const dockerfileContent = initPorts(sPort.toString());
    const jobDockerId = `${job.name}-one`;

    let res = false;

    try {
        logSandbox("preparing", job.id, { port: sPort });
        await prepareDockerContainer(dockerfileContent);
        await buildDockerContainer();
        await createDockerNetwork();
        await runDockerContainer(jobDockerId, codeChanges, sPort.toString());

        logSandbox("waiting_for_startup", job.id);

        await new Promise((resolve) => setTimeout(resolve, 10000));

        logger.info({ jobId: job.id }, "Sandbox ready, running job");
        const result = await runFailedJob(job, sPort.toString());

        if (result.success) {
            logSandbox("job_success", job.id);

            const html = codeChanges
                .map((c) => {
                    const codeHtml = getDiffHTML(
                        JSON.stringify(c.originalCode),
                        JSON.stringify(c.code)
                    );
                    const str = `<b>Path</b>: ${c.path}<br>
										 <b>Code</b>: <br><br><code>${codeHtml}</code><br>`;
                    return str;
                })
                .join("<br><br>");

            EmailClient.Instance.sendSuccessEmail(html);
            res = true;
        } else {
            logSandbox("job_failure", job.id);
            res = false;
        }
    } catch (error) {
        res = false;
        logger.error({ error, jobId: job.id }, "Error in sandbox");
    } finally {
        await destroySandbox(jobDockerId);
        return res;
    }
};
