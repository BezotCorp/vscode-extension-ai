// The level of access a tool call says it needs. The model announces it in the call; the runtime works out the level
// the operation really needs from its paths and acts on that one. `critical` must say why the AI needs to touch a
// critical location.
export type AccessRequest =
	| { kind: "normal" }
	| { kind: "elevated" }
	| { kind: "critical"; reason: string };
