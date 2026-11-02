import * as http from 'node:http';

import { PermissionStore } from '../permissions';
import { MAX_BRIDGE_PORT_ATTEMPTS, VSCODE_PORT } from '../constants';
import { handleActiveFile } from './active_file_handler';
import { handleOpenFiles } from './open_files_handler';
import { handlePatch } from './patch_handler';
import { isLocalProgramRequest } from './request_guard';

export type BridgeServerRuntime = {
  server: http.Server;
  port?: number;
  dispose(): void;
};

export function createBridgeServer(store: PermissionStore): BridgeServerRuntime {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');

    if (!isLocalProgramRequest(req)) {
      res.writeHead(403);
      res.end(JSON.stringify({ error: 'forbidden' }));
      return;
    }

    if (req.method === 'GET' && req.url === '/active-file') {
      handleActiveFile(res);
      return;
    }

    if (req.method === 'GET' && req.url === '/open-files') {
      handleOpenFiles(res);
      return;
    }

    if (req.method === 'POST' && req.url === '/patch') {
      handlePatch(req, res, store);
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'not found' }));
  });

  const runtime: BridgeServerRuntime = {
    server,
    port: undefined,
    dispose() {
      if (server.listening) {
        server.close();
      }
    },
  };

  void listenOnAvailablePort(server, runtime, VSCODE_PORT, 0);

  return runtime;
}

function listenOnAvailablePort(
  server: http.Server,
  runtime: BridgeServerRuntime,
  port: number,
  attempt: number,
): Promise<void> {
  return new Promise((resolve) => {
    const onError = (error: NodeJS.ErrnoException) => {
      server.off('listening', onListening);

      if (error.code === 'EADDRINUSE' && attempt + 1 < MAX_BRIDGE_PORT_ATTEMPTS) {
        const nextPort = port + 1;

        console.warn(`BezotCorp AI bridge port ${port} is already in use. Trying ${nextPort}...`);

        void listenOnAvailablePort(server, runtime, nextPort, attempt + 1).then(resolve);
        return;
      }

      console.error('BezotCorp AI bridge server error:', error);
      resolve();
    };

    const onListening = () => {
      server.off('error', onError);
      runtime.port = port;

      console.log(`BezotCorp AI extension bridge listening on http://127.0.0.1:${port}`);

      resolve();
    };

    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}
