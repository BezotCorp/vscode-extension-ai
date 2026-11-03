import { getAllStyles, getBodyStyles, getChatStyles, getModelManagementStyles } from '.';

export function getStyles(): string {
  return `
${getAllStyles()}
${getBodyStyles()}
${getChatStyles()}
${getModelManagementStyles()}`;
}
