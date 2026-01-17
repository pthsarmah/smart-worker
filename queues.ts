import { Queue } from 'bullmq';
import { connection } from './redis';
import { QueueEvents } from "bullmq";

export const loginQueue = new Queue('login', {
	connection: connection,
	defaultJobOptions: {
		attempts: 5,
		backoff: {
			type: "exponential",
			delay: 1000,
		},
		removeOnComplete: true,
		removeOnFail: false,
	}
});

export const loginSandboxQueue = new Queue('login-sandbox', {
	connection: connection,
	defaultJobOptions: {
		attempts: 1,
		backoff: {
			type: "exponential",
			delay: 1000,
		},
		removeOnComplete: true,
		removeOnFail: true,
	}
});

export const loginDLQ = new Queue('login-dlq', {
	connection: connection,
	defaultJobOptions: {
		removeOnComplete: true,
	}
});

export const loginQueueEvents = new QueueEvents("login", {
	connection: {
		host: process.env.REDIS_HOST || "localhost",
		port: parseInt(process.env.REDIS_PORT || "6379"),
	},
});
