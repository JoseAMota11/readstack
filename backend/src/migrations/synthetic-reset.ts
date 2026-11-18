import { runSyntheticCli } from './synthetic-db05';

const watchdog = setTimeout(() => { console.error('DB-05 timeout; independently verify transaction outcome'); process.exit(1); }, 120000);
runSyntheticCli('reset', process.env).then(() => console.log('DB-05 reset completed; verify independently.'))
  .catch(() => { console.error('DB-05 reset refused or failed; independently verify target and outcome.'); process.exitCode = 1; })
  .finally(() => clearTimeout(watchdog));
