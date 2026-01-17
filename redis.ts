import { Redis } from 'ioredis';

export const connection = new Redis({
	port: 6379,
	host: 'localhost',
	maxRetriesPerRequest: null,
})
