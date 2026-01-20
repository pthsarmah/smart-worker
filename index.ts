import express from "express";
import { loginQueue, loginQueueEvents } from "./queues";
import "./ai-layer/destroy-sandbox.ts"
import "./workers";

const app = express();
app.use(express.json());

const portStr = process.env.PORT;
let port: number;

if (!portStr) {
	port = 9090
} else port = parseInt(portStr);

app.get("/", async (_, res) => {
	const job = await loginQueue.add('start-worker', { num: 10, callfile: import.meta.path, reasoning_fix: true });
	res.status(202).json({
		jobId: job.id,
		status: 'created',
	});
});

app.post("/job", async (req, res) => {
	const { name, data } = req.body;
	if (!name || !data) {
		return res.status(400).json({ error: "Missing name or data" });
	}

	data["reasoning_fix"] = false;

	const job = await loginQueue.add(name, data, {
		removeOnComplete: true,
		removeOnFail: true,
	});

	try {
		const result = await job.waitUntilFinished(loginQueueEvents);
		res.status(200).json({ success: true, result });
	} catch (error) {
		const freshJob = await loginQueue.getJob(job.id as string);
		res.status(200).json({ success: false, result: freshJob?.failedReason });
	}
});

app.listen(port, '0.0.0.0', () => {
	console.log(`Server listening on port ${port}`)
});
