import { Worker } from "bullmq";
import { connection } from "./redis";
import { jobFailureReasoning } from "./reasoning-layer/reasoning";
import { loginDLQ, loginQueue } from "./queues";

const loginWorker = new Worker('login', async job => {
	console.log('Processing job', job.id);

	//Job data hazard testing
	if (job.data.num === 10) {
		throw new Error(`Failed job ${job.id}`);
	}

	//Environment variable hazard testing
	if (!process.env.TEST_ENV_VAR) {
		throw new Error(`Failed job ${job.id}`);
	}

	console.log(`Job ${job.id} successfully completed!`);
}, { connection });

loginWorker.on('failed', async (job) => {
	const attemptsMade = job?.attemptsMade ?? 0;
	const maxAttempts = job?.opts.attempts ?? 1;

	if (job && attemptsMade >= maxAttempts) {
		if (job.id) loginQueue.remove(job.id);
		loginDLQ.add(job.name, job.data, job.opts);
		if (job.data.reasoning_fix)
			jobFailureReasoning(job).then(() => { }).catch((e) => console.error(e));
		else
			console.error(`Job ${job.id} failed again!`);
	}
});

loginWorker.on('completed', job => {
	console.log(`Job ${job.id} completed`);
});
