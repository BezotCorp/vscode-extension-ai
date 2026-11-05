import type { AiProviderKind } from './ai_provider_kind';

export const DEFAULT_PROVIDER: AiProviderKind = 'ollama';
export const DEFAULT_PROVIDER_URL = 'http://127.0.0.1:11434';
export const DEFAULT_MODEL = 'qwen2.5-coder:7b';
export const DEFAULT_CONTEXT_TOKENS = 16_384;
export const MIN_CONTEXT_TOKENS = 2_048;
