// One tracked operation as stored in SQLite. `state` alone says where the operation stands.
export type StateMachineRecord<State extends string> = {
  id: string;
  kind: string;
  // What the operation is about (for a file operation, the path).
  subject: string;
  state: State;
  // Everything needed to resume the operation after an interruption.
  data: Record<string, unknown>;
  payload: Uint8Array | null;
  // Process that drives the operation; an operation whose owner is gone can be resumed.
  owner: number;
  updatedAt: number;
};
