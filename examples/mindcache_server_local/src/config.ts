import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const API_HOST = process.env.MINDCACHE_API_HOST || '127.0.0.1';
export const API_PORT = Number(process.env.MINDCACHE_API_PORT || 4040);
export const CLIENT_HOST = process.env.MINDCACHE_CLIENT_HOST || '127.0.0.1';
export const CLIENT_PORT = Number(process.env.MINDCACHE_CLIENT_PORT || 4173);

const currentFile = fileURLToPath(import.meta.url);
const srcDir = path.dirname(currentFile);
export const EXAMPLE_DIR = path.resolve(srcDir, '..');
export const DATA_DIR = path.join(EXAMPLE_DIR, 'data');
export const CLIENT_DIR = path.join(EXAMPLE_DIR, 'client');

export const API_BASE_URL = `http://${API_HOST}:${API_PORT}`;
