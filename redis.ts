import { Redis } from 'ioredis';

export const connection = new Redis({
	port: parseInt(process.env.APP_REDIS_PORT || '6379'),
	host: 'localhost',
	maxRetriesPerRequest: null,
})
