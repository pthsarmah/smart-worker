import type { Job } from "bullmq";

export const runFailedJob = async (
	job: Job,
	port: string,
): Promise<{ success: boolean; result: any }> => {
	for (let i = 0; i < 5; i++) {
		try {
			const response = await fetch(`http://localhost:${port}`, {
				method: "GET",
			});

			if (response.ok) {
				const result = await response.json();
				return { success: true, result: result };
			}
			console.log(`Attempt ${i + 1} failed: ${response.statusText}`);
		} catch (error: any) {
			console.log(`Attempt ${i + 1} failed: ${error.message}`);
		}
		await new Promise(resolve => setTimeout(resolve, 2000));
	}
	return { success: false, result: "Failed to connect to the job server after multiple attempts." };
};
