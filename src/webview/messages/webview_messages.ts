import type { AiProviderKind } from '../../config/ai_provider_kind';

export type WebviewMessage =
  | { type: 'webviewReady' }
  | { type: 'copyMessage'; text: string }
  | { type: 'openSettings' }
  | { type: 'testConnection' }
  | { type: 'refreshModels' }
  | {
      type: 'updateProviderSettings';
      provider: AiProviderKind;
      providerUrl: string;
    }
  | { type: 'changeModel'; model: string }
  | { type: 'newChat' }
  | {
      type: 'switchChatSession';
      sessionId: string;
    }
  | {
      type: 'renameChatSession';
      sessionId: string;
      title: string;
    }
  | {
      type: 'archiveChatSession';
      sessionId: string;
    }
  | {
      type: 'restoreChatSession';
      sessionId: string;
    }
  | {
      type: 'trashChatSession';
      sessionId: string;
    }
  | {
      type: 'restoreTrashedChatSession';
      sessionId: string;
    }
  | {
      type: 'deleteChatSession';
      sessionId: string;
    }
  | { type: 'clearCurrentSession' }
  | { type: 'trashArchivedSessions' }
  | { type: 'emptyTrash' }
  | { type: 'stopGeneration' }
  | {
      type: 'chat';
      text: string;
    };
