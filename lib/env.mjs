import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { root } from './paths.mjs';

// Keys and local settings live in a git-ignored .env at dogfood's root, loaded once for the server, the MCP server and
// scripts. Variables already set in the environment win.
const file = join(root, '.env');
if (existsSync(file)) process.loadEnvFile(file);
