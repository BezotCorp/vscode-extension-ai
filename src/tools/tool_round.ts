// One model response that requested tools, with the serialized result the model received for each call.
export type ToolRound = {
  content: string;
  calls: { name: string; arguments: unknown; result: string }[];
};
