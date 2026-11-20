// Errors raised before any byte of the request could be delivered.
export const NOT_DELIVERED_CODES = new Set(['ENOTFOUND', 'ECONNREFUSED', 'EAI_AGAIN', 'ERR_TLS_CERT_ALTNAME_INVALID']);
