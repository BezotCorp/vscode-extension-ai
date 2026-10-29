import { ContextSelection } from '../../../context';
import { Tool, ToolExecutionResult } from '../..';
import { toolFailure, toolSuccess } from '../../tool_result';

export class SelectedTextTool implements Tool {
  readonly id = 'selectedText';
  readonly name = 'Selected Text';
  readonly readOnlyCompatible = true;
  readonly description = 'Provides the current VS Code selected text context.';
  readonly parameters = { type: 'object' as const, properties: {} };

  constructor(private readonly getSelection: () => ContextSelection | undefined) {}

  async execute(): Promise<ToolExecutionResult> {
    const selection = this.getSelection();

    if (!selection) {
      return toolFailure('error', this.id, undefined, {
        reason: 'no_selection',
        message: 'No text is selected in the active editor.',
        executed: false,
        retryable: false,
      });
    }

    return toolSuccess(this.id, selection.path, {
      content: selection.text,
      details: { languageId: selection.languageId },
    });
  }
}
