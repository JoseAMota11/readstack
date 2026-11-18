import { config } from './config/config';
import { startApplication } from './database/startup';

void config; // Validate authentication configuration before either provider starts.
void startApplication(process.env).catch((error: unknown) => {
  const safeMessages = new Set([
    'Invalid database provider', 'Invalid PostgreSQL configuration',
    'PostgreSQL migration discovery failed', 'PostgreSQL connection failed',
    'PostgreSQL migration ledger not ready', 'PostgreSQL schema incompatible',
    'PostgreSQL client cleanup failed', 'PostgreSQL application startup failed',
  ]);
  console.error(error instanceof Error && safeMessages.has(error.message) ? error.message : 'Application startup failed');
  process.exitCode = 1;
});
