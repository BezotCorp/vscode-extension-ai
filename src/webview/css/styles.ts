import { getAllStyles } from './all';
import { getBodyStyles } from './body';
import { getChatStyles } from './chat_styles';
import { getModelManagementStyles } from './model_management_styles';

export function getStyles(): string {
  return `
${getAllStyles()}
${getBodyStyles()}
${getChatStyles()}
${getModelManagementStyles()}`;
}
