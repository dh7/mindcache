/**
 * WebSocket Integration Tests
 *
 * Run the server first: pnpm dev
 * Then run tests: pnpm test
 */

import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';

const WS_URL = 'ws://localhost:8787/sync';

interface AuthResult {
  ws: WebSocket;
  authMsg: any;
  syncMsg: any;
}

/** Connect and authenticate, returning both auth_success and sync messages */
function connectAndAuth(instanceId: string): Promise<AuthResult> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${WS_URL}/${instanceId}`);
    const messages: any[] = [];
    const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000);

    ws.on('error', reject);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'auth', apiKey: 'test' }));
    });

    ws.on('message', (data) => {
      // Skip binary Yjs messages
      if (data instanceof Buffer && data[0] !== 123) {
        return;
      } // 123 = '{'
      try {
        const msg = JSON.parse(data.toString());
        messages.push(msg);

        // Wait for both auth_success and sync
        const authMsg = messages.find(m => m.type === 'auth_success');
        const syncMsg = messages.find(m => m.type === 'sync');

        if (authMsg && syncMsg) {
          clearTimeout(timeout);
          resolve({ ws, authMsg, syncMsg });
        }
      } catch { /* ignore binary messages */ }
    });
  });
}

function waitForMessage(ws: WebSocket, expectedType: string, timeoutMs = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timeout waiting for ${expectedType}`)), timeoutMs);

    const handler = (data: WebSocket.Data) => {
      // Skip binary Yjs messages
      if (data instanceof Buffer && data[0] !== 123) {
        return;
      } // 123 = '{'
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === expectedType) {
          clearTimeout(timeout);
          ws.off('message', handler);
          resolve(msg);
        }
      } catch { /* ignore binary messages */ }
    };

    ws.on('message', handler);
  });
}

describe('WebSocket Authentication', () => {
  it('should authenticate with valid API key', async () => {
    const instanceId = `test-auth-${Date.now()}`;
    const { ws, authMsg } = await connectAndAuth(instanceId);

    expect(authMsg.type).toBe('auth_success');
    expect(authMsg.userId).toBe('dev-user');
    expect(['write', 'admin']).toContain(authMsg.permission);

    ws.close();
  });

  it('should receive initial sync after auth', async () => {
    const instanceId = `test-sync-${Date.now()}`;
    const { ws, syncMsg } = await connectAndAuth(instanceId);

    expect(syncMsg.type).toBe('sync');
    expect(syncMsg.data).toBeDefined();

    ws.close();
  });
});

describe('Key Operations', () => {
  it('should set and persist a key', async () => {
    const instanceId = `test-set-${Date.now()}`;

    // Connect and set a key
    const { ws: ws1 } = await connectAndAuth(instanceId);

    ws1.send(JSON.stringify({
      type: 'set',
      key: 'greeting',
      value: 'Hello World',
      attributes: {
        readonly: false,
        visible: true,
        hardcoded: false,
        template: false,
        type: 'text',
        tags: ['test']
      },
      timestamp: Date.now()
    }));

    // Small delay for write to complete
    await new Promise(r => setTimeout(r, 200));
    ws1.close();

    // Reconnect and verify
    const { ws: ws2, syncMsg } = await connectAndAuth(instanceId);

    expect(syncMsg.data.greeting).toBeDefined();
    expect(syncMsg.data.greeting.value).toBe('Hello World');
    expect(syncMsg.data.greeting.attributes.contentTags).toContain('test');

    ws2.close();
  });

  it('should delete a key', async () => {
    const instanceId = `test-delete-${Date.now()}`;

    // Set a key first
    const { ws: ws1 } = await connectAndAuth(instanceId);
    ws1.send(JSON.stringify({
      type: 'set',
      key: 'toDelete',
      value: 'temporary',
      attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text', tags: [] },
      timestamp: Date.now()
    }));
    await new Promise(r => setTimeout(r, 200));

    // Delete it
    ws1.send(JSON.stringify({
      type: 'delete',
      key: 'toDelete',
      timestamp: Date.now()
    }));
    await new Promise(r => setTimeout(r, 200));
    ws1.close();

    // Verify deletion
    const { ws: ws2, syncMsg } = await connectAndAuth(instanceId);
    expect(syncMsg.data.toDelete).toBeUndefined();
    ws2.close();
  });
});

describe('Real-time Sync', () => {
  it('should broadcast key updates to other clients', async () => {
    const instanceId = `test-realtime-${Date.now()}`;

    // Connect two clients
    const { ws: client1 } = await connectAndAuth(instanceId);
    const { ws: client2 } = await connectAndAuth(instanceId);

    // Set up listener on client2 BEFORE client1 sends
    const updatePromise = waitForMessage(client2, 'key_updated');

    // Client1 sets a key
    client1.send(JSON.stringify({
      type: 'set',
      key: 'realtime-test',
      value: 'from client1',
      attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text', tags: [] },
      timestamp: Date.now()
    }));

    const updateMsg = await updatePromise;

    expect(updateMsg.key).toBe('realtime-test');
    expect(updateMsg.value).toBe('from client1');
    expect(updateMsg.updatedBy).toBe('dev-user');

    client1.close();
    client2.close();
  });

  it('should broadcast key deletions to other clients', async () => {
    const instanceId = `test-delete-broadcast-${Date.now()}`;

    const { ws: client1 } = await connectAndAuth(instanceId);
    const { ws: client2 } = await connectAndAuth(instanceId);

    // Set a key first, wait for client2 to receive it
    const setPromise = waitForMessage(client2, 'key_updated');
    client1.send(JSON.stringify({
      type: 'set',
      key: 'to-delete',
      value: 'temp',
      attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text', tags: [] },
      timestamp: Date.now()
    }));
    await setPromise;

    // Now delete and check broadcast
    const deletePromise = waitForMessage(client2, 'key_deleted');
    client1.send(JSON.stringify({
      type: 'delete',
      key: 'to-delete',
      timestamp: Date.now()
    }));

    const deleteMsg = await deletePromise;
    expect(deleteMsg.key).toBe('to-delete');
    expect(deleteMsg.deletedBy).toBe('dev-user');

    client1.close();
    client2.close();
  });
});

describe('Persistence', () => {
  it('should persist keys across connections', async () => {
    const instanceId = `test-persist-${Date.now()}`;
    const testValue = `persisted-${Date.now()}`;

    // Connect, set key, disconnect
    const { ws: client1 } = await connectAndAuth(instanceId);

    client1.send(JSON.stringify({
      type: 'set',
      key: 'persistent-key',
      value: testValue,
      attributes: { readonly: false, visible: true, hardcoded: false, template: false, type: 'text', tags: [] },
      timestamp: Date.now()
    }));

    await new Promise(r => setTimeout(r, 200));
    client1.close();

    // Reconnect and verify
    const { ws: client2, syncMsg } = await connectAndAuth(instanceId);

    expect(syncMsg.data['persistent-key']).toBeDefined();
    expect(syncMsg.data['persistent-key'].value).toBe(testValue);

    client2.close();
  });
});

describe('Ping/Pong', () => {
  it('should respond to ping with pong', async () => {
    const instanceId = `test-ping-${Date.now()}`;
    const { ws } = await connectAndAuth(instanceId);

    const pongPromise = waitForMessage(ws, 'pong');
    ws.send(JSON.stringify({ type: 'ping' }));

    const pong = await pongPromise;
    expect(pong.type).toBe('pong');

    ws.close();
  });
});
