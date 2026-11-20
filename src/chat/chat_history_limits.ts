export const MAX_HISTORY_MESSAGES = 40;

// Used when the provider cannot say how large its context window is.
export const DEFAULT_HISTORY_CHARACTERS = 24_000;

// Share of the context window earlier turns may take.
export const HISTORY_CONTEXT_SHARE = 0.4;

// Largest tool result replayed to the model from an earlier turn, in characters. It limits what a request holds, not
// what the conversation keeps: stored results are whole.
export const MAX_REPLAYED_RESULT_CHARACTERS = 4_000;
