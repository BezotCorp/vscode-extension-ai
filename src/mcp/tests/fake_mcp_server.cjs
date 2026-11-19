// A minimal MCP server over stdio for the tests: newline-delimited JSON-RPC, one behaviour per tool name.
const readline = require('node:readline');

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const received = [];
let listVersion = 1;

const tools = () =>
  listVersion === 1
    ? [
        {
          name: 'echo',
          description: 'Echoes the text',
          inputSchema: { properties: { text: { type: 'string' } }, required: ['text'] },
        },
        { name: 'fail', description: 'Reports an error' },
        { name: 'rpc_invalid', description: 'JSON-RPC invalid params' },
        { name: 'rpc_other', description: 'JSON-RPC other error' },
        { name: 'hang', description: 'Never answers' },
        { name: 'die', description: 'Exits while called' },
        { name: 'parts', description: 'Several kinds of content' },
        { name: 'structured', description: 'Structured content' },
        { name: 'big_structured', description: 'Too much structured content' },
        { name: 'change', description: 'Announces that the list changed' },
        { name: 'replies', description: 'The replies the client gave to requests of the server' },
        { name: 'a.b', description: 'Collides with a_b once sanitized' },
        { name: 'a_b', description: 'Collides with a.b once sanitized' },
      ]
    : [{ name: 'after_change', description: 'Appeared after the change' }];

function call(id, name, args) {
  switch (name) {
    case 'echo':
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `echo: ${args.text}` }] } });
    case 'fail':
      return send({ jsonrpc: '2.0', id, result: { isError: true, content: [{ type: 'text', text: 'it broke' }] } });
    case 'rpc_invalid':
      return send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'invalid params' } });
    case 'rpc_other':
      return send({ jsonrpc: '2.0', id, error: { code: -1, message: 'something else' } });
    case 'hang':
      return undefined;
    case 'die':
      process.stderr.write('fatal: the server is dying');
      return setTimeout(() => process.exit(3), 20);
    case 'parts':
      return send({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            { type: 'text', text: 'first' },
            { type: 'resource', resource: { uri: 'file:///x', text: 'resource text' } },
            { type: 'resource', resource: { uri: 'file:///y' } },
            { type: 'image', mimeType: 'image/png', data: 'AAAA' },
            { type: 'audio', mimeType: 'audio/wav' },
            { type: 'video' },
            { type: 'text' },
          ],
        },
      });
    case 'structured':
      return send({ jsonrpc: '2.0', id, result: { content: [], structuredContent: { answer: 42 } } });
    case 'big_structured':
      return send({ jsonrpc: '2.0', id, result: { content: [], structuredContent: { big: 'x'.repeat(9000) } } });
    case 'change':
      listVersion = 2;
      send({ jsonrpc: '2.0', method: 'notifications/tools/list_changed' });
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'changed' }] } });
    case 'replies':
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: JSON.stringify(received) }] } });
    default:
      return send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: `ran ${name}` }] } });
  }
}

readline.createInterface({ input: process.stdin }).on('line', (line) => {
  let message;

  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  if (message.method === undefined) {
    // The client answered a request of ours.
    received.push({ id: message.id, result: message.result, error: message.error });
    return;
  }

  switch (message.method) {
    case 'initialize':
      // Noise the client must ignore, and requests the client must answer without honouring them.
      process.stdout.write('this line is not JSON\n');
      send({ jsonrpc: '2.0', id: 'srv-ping', method: 'ping' });
      send({ jsonrpc: '2.0', id: 'srv-sampling', method: 'sampling/createMessage', params: {} });
      send({ jsonrpc: '2.0', id: 999, result: 'an answer nobody asked for' });
      send({ jsonrpc: '2.0', method: 'notifications/something' });
      return send({ jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05', capabilities: {} } });
    case 'tools/list': {
      const all = tools();

      if (listVersion !== 1) {
        return send({ jsonrpc: '2.0', id: message.id, result: { tools: all } });
      }

      return message.params?.cursor
        ? send({ jsonrpc: '2.0', id: message.id, result: { tools: all.slice(6) } })
        : send({ jsonrpc: '2.0', id: message.id, result: { tools: all.slice(0, 6), nextCursor: 'page-2' } });
    }
    case 'tools/call':
      return call(message.id, message.params.name, message.params.arguments || {});
    default:
      return message.id === undefined
        ? undefined
        : send({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: 'unknown' } });
  }
});
