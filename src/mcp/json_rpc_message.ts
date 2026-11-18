export type JsonRpcMessage = {
  id?: number | string;
  method?: string;
  result?: unknown;
  error?: { code: number; message: string };
};
