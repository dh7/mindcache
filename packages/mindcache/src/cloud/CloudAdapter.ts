import * as syncProtocol from 'y-protocols/sync';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';


import type { MindCache } from '../core/MindCache';
import type {
  CloudConfig,
  ConnectionState,
  CloudAdapterEvents
} from './types';

const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

export class CloudAdapter {
  private ws: WebSocket | null = null;
  private mindcache: MindCache | null = null;
  private unsubscribe: (() => void) | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _state: ConnectionState = 'disconnected';
  private _isOnline: boolean = true; // Browser network status
  private listeners: Partial<{ [K in keyof CloudAdapterEvents]: CloudAdapterEvents[K][] }> = {};
  private token: string | null = null;
  private handleOnline: (() => void) | null = null;
  private handleOffline: (() => void) | null = null;
  private _synced = false; // Track if initial sync is complete

  constructor(private config: CloudConfig) {

    if (!config.baseUrl) {
      throw new Error('MindCache Cloud: baseUrl is required. Please provide the cloud API URL in your configuration.');
    }

    // Setup browser online/offline detection
    this.setupNetworkDetection();
  }

  /** Browser network status - instantly updated via navigator.onLine */
  get isOnline(): boolean {
    return this._isOnline;
  }

  private setupNetworkDetection(): void {
    // Only run in browser environment
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
      return;
    }

    // Set initial state
    this._isOnline = navigator.onLine;

    this.handleOnline = () => {
      console.log('☁️ CloudAdapter: Network is back online');
      this._isOnline = true;
      this.emit('network_online');

      // If we were connected or connecting before, try to reconnect
      if (this._state === 'disconnected' || this._state === 'error') {
        this.connect();
      }
    };

    this.handleOffline = () => {
      console.log('☁️ CloudAdapter: Network went offline');
      this._isOnline = false;
      this.emit('network_offline');

      // Update state immediately instead of waiting for WS timeout
      if (this._state === 'connected' || this._state === 'connecting') {
        this._state = 'disconnected';
        this.emit('disconnected');
      }
    };

    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
  }

  private cleanupNetworkDetection(): void {
    if (typeof window === 'undefined') {
      return;
    }
    if (this.handleOnline) {
      window.removeEventListener('online', this.handleOnline);
    }
    if (this.handleOffline) {
      window.removeEventListener('offline', this.handleOffline);
    }
  }

  setToken(token: string): void {
    this.token = token;
  }

  setTokenProvider(provider: () => Promise<string>): void {
    this.config.tokenProvider = provider;
  }

  get state(): ConnectionState {
    return this._state;
  }

  attach(mc: MindCache): void {
    if (this.mindcache) {
      this.detach();
    }
    this.mindcache = mc;

    // Yjs Update Listener handled in connect/setupWebSocket
    // But we need to listen to local changes if we want to push them?
    // Yjs handles this via 'update' event on doc.
    // We attach listener to doc in connect() or better here if doc exists?
    // MindCache will expose .doc

    // Attach local update propagation
    mc.doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin !== this && this.ws && this.ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        syncProtocol.writeUpdate(encoder, update);
        this.sendBinary(encoding.toUint8Array(encoder));
      }
    });

    console.log('☁️ CloudAdapter: Attached to MindCache instance');
  }

  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.mindcache = null;
  }

  private async fetchTokenWithApiKey(): Promise<string> {
    if (!this.config.apiKey) {
      throw new Error('API key is required to fetch token');
    }

    const httpBaseUrl = this.config.baseUrl!
      .replace('wss://', 'https://')
      .replace('ws://', 'http://');

    const isDelegate = this.config.apiKey.startsWith('del_') && this.config.apiKey.includes(':');
    const authHeader = isDelegate
      ? `ApiKey ${this.config.apiKey}`
      : `Bearer ${this.config.apiKey}`;

    const response = await fetch(`${httpBaseUrl}/api/ws-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify({
        instanceId: this.config.instanceId,
        permission: 'write'
      })
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to get token' }));
      throw new Error(error.error || `Failed to get WebSocket token: ${response.status}`);
    }

    const data = await response.json();
    return data.token;
  }

  async connect(): Promise<void> {
    if (this._state === 'connecting' || this._state === 'connected') {
      return;
    }

    this._state = 'connecting';

    try {
      if (!this.token) {
        if (this.config.tokenProvider) {
          this.token = await this.config.tokenProvider();
        } else if (this.config.apiKey) {
          this.token = await this.fetchTokenWithApiKey();
        }
      }

      let url = `${this.config.baseUrl}/sync/${this.config.instanceId}`;
      if (this.token) {
        url += `?token=${encodeURIComponent(this.token)}`;
        this.token = null;
      } else {
        throw new Error('MindCache Cloud: No authentication method available. Provide apiKey or tokenProvider.');
      }

      this.ws = new WebSocket(url);
      this.ws.binaryType = 'arraybuffer'; // Crucial for Yjs
      this.setupWebSocket();
    } catch (error) {
      this._state = 'error';
      this.emit('error', error as Error);
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    // Cleanup network detection listeners
    this.cleanupNetworkDetection();

    this._state = 'disconnected';
    this.emit('disconnected');
  }

  on<K extends keyof CloudAdapterEvents>(event: K, listener: CloudAdapterEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);
  }

  off<K extends keyof CloudAdapterEvents>(event: K, listener: CloudAdapterEvents[K]): void {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event]!.filter(l => l !== listener) as any;
    }
  }

  private emit<K extends keyof CloudAdapterEvents>(event: K, ...args: Parameters<CloudAdapterEvents[K]>): void {
    if (this.listeners[event]) {
      this.listeners[event]!.forEach(listener => (listener as any)(...args));
    }
  }

  private setupWebSocket(): void {
    if (!this.ws) {
      return;
    }

    this.ws.onopen = () => {
      // Start Sync
      if (this.mindcache) {
        const encoder = encoding.createEncoder();
        syncProtocol.writeSyncStep1(encoder, this.mindcache.doc);
        this.sendBinary(encoding.toUint8Array(encoder));
      }
    };

    this.ws.onmessage = (event) => {
      try {
        if (typeof event.data === 'string') {
          // Handle JSON auth messages
          const msg = JSON.parse(event.data);
          console.log('☁️ CloudAdapter: Received JSON message:', msg.type, msg);
          if (msg.type === 'auth_success') {
            this._state = 'connected';
            this.reconnectAttempts = 0;
            this.emit('connected');
            console.log('☁️ Connected to MindCache cloud');
          } else if (msg.type === 'auth_error' || msg.type === 'error') {
            this._state = 'error';
            this.emit('error', new Error(msg.error));
          } else {
            // Log unhandled message types for debugging (not an error, just informational)
            console.debug('MindCache Cloud: Received message type:', msg.type, msg);
          }
        } else {
          // Handle Binary Yjs messages
          console.log('☁️ CloudAdapter: Received binary message, length:', event.data.byteLength);
          const encoder = encoding.createEncoder();
          const decoder = decoding.createDecoder(new Uint8Array(event.data as ArrayBuffer));

          if (this.mindcache) {
            const messageType = syncProtocol.readSyncMessage(decoder, encoder, this.mindcache.doc, this);

            // If response needed
            if (encoding.length(encoder) > 0) {
              this.sendBinary(encoding.toUint8Array(encoder));
            }

            // Emit synced after receiving first sync message from server
            // messageType 0 = syncStep1, 1 = syncStep2, 2 = update
            // After receiving syncStep2 (1) or any message if not yet synced
            if (!this._synced && (messageType === 1 || messageType === 2)) {
              this._synced = true;
              this.emit('synced');
              console.log('☁️ Synced with cloud');
            }
          }
        }
      } catch (error) {
        console.error('MindCache Cloud: Failed to handle message:', error);
      }
    };

    this.ws.onclose = () => {
      this._state = 'disconnected';
      this.emit('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this._state = 'error';
      this.emit('error', new Error('WebSocket connection failed'));
    };
  }

  private sendBinary(data: Uint8Array): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      return;
    }

    const delay = Math.min(
      RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }
}

