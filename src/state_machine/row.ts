export type Row = {
  id: string;
  kind: string;
  subject: string;
  state: string;
  data: string;
  payload: Uint8Array | null;
  owner: number;
  updated_at: number;
};
