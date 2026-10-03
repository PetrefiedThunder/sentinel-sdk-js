// Node 18.17 exits 1 for failing TODO tests despite reporting zero failures.
// Keep documented defects explicit skips there; Node 20+ executes every repro.
// Evidence: docs/qa/2026-10-02/artifacts/review-node18-todo-exit-control.txt.
export function knownDefect(reason) {
  return Number(process.versions.node.split('.')[0]) < 20
    ? { skip: `${reason}; Node 18 TODO-exit limitation, reproduced on Node 24/26` }
    : { todo: reason };
}
