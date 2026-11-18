const stages = ['preflight', 'observer', 'transaction', 'parity', 'security', 'rollback', 'cleanup'] as const;
export type DiagnosticStage = typeof stages[number];

// Never format or inspect an exception, even for unknown or non-Error rejections.
export function createDiagnostics(write: (message: string) => void) {
  let stage: DiagnosticStage = 'preflight';
  return {
    enter(next: DiagnosticStage) {
      if (!stages.includes(next)) throw new Error('Invalid diagnostic stage');
      stage = next;
    },
    fail(_error?: unknown) {
      write(`DB-04I failed: ${stage}.`);
    },
  };
}
