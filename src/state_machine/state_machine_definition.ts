// The states of one kind of persistent operation and the transitions allowed between them.
// A state without outgoing transitions is final.
export type StateMachineDefinition<State extends string> = {
  initial: State;
  transitions: Readonly<Record<State, readonly State[]>>;
};
