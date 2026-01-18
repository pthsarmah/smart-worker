import { $ } from 'bun';

export const removeAllDockerContainers = async () => {
	console.log('Attempting to remove all sandbox containers...');
	try {
		const containersOutput = await $`docker ps -a --format "{{.Names}}"`.text();
		const containerNames = containersOutput.split('\n').filter(name =>
			name.startsWith('bun-sandbox') || name.startsWith('sandbox-redis')
		);

		if (containerNames.length === 0) {
			console.log('No sandbox containers found to remove.');
			return;
		}

		console.log(`Found containers to remove: ${containerNames.join(', ')}`);

		for (const name of containerNames) {
			if (name) {
				try {
					console.log(`Stopping container ${name}...`);
					await $`docker stop ${name}`;
					console.log(`Stopped container ${name}.`);
				} catch (e: any) {
					if (e.stderr && !e.stderr.includes('No such container')) {
						console.error(`Could not stop container ${name}.`, e.stderr);
					} else if (!e.stderr) {
						console.error(`Could not stop container ${name}.`, e);
					}
				}
			}
		}

		console.log('Finished removing all sandbox containers.');
	} catch (e: any) {
		console.error('Failed to get list of docker containers.', e.stderr || e);
	}
};

export const destroySandbox = async (jobDockerId: string) => {
	console.log(`Destroying sandbox for job ${jobDockerId}`);

	try {
		await $`docker stop bun-sandbox-${jobDockerId}`.quiet();
		console.log(`Stopped container bun-sandbox-${jobDockerId}`);
	} catch (e: any) {
		if (e.stderr && !e.stderr.includes('No such container')) {
			console.error(`Could not stop container bun-sandbox-${jobDockerId}.`, e.stderr);
		} else if (!e.stderr) {
			console.error(`Could not stop container bun-sandbox-${jobDockerId}.`, e);
		}
	}

	try {
		await $`docker stop sandbox-redis-${jobDockerId}`.quiet();
		console.log(`Stopped container sandbox-redis-${jobDockerId}`);
	} catch (e: any) {
		if (e.stderr && !e.stderr.includes('No such container')) {
			console.error(`Could not stop container sandbox-redis-${jobDockerId}.`, e.stderr);
		} else if (!e.stderr) {
			console.error(`Could not stop container sandbox-redis-${jobDockerId}.`, e);
		}
	}

	try {
		await Bun.file(`${import.meta.dir}/Dockerfile.temp`).delete();
		console.log('\x1b[36m%s\x1b[0m', 'Deleted Dockerfile.temp successfully');
	} catch (e: any) {
		console.error(`Could not delete Dockerfile.temp`);
	}

	console.log(`Sandbox for job ${jobDockerId} destroyed.`);
};

removeAllDockerContainers()
