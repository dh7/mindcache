import type { MindCache } from '../core/MindCache';
import type { KeyAttributes } from '../core/types';
import type { 
  CloudConfig, 
  Operation, 
  IncomingMessage, 
  ConnectionState,
  CloudAdapterEvents 
} from './types';

const DEFAULT_BASE_URL = 'wss://api.mindcache.io';
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

/**
 * CloudAdapter connects a MindCache instance to the cloud service
 * for real-time sync and persistence.
 */
export class CloudAdapter {
  private ws: WebSocket | null = null;
  private queue: Operation[] = [];
  private mindcache: MindCache | null = null;
  private unsubscribe: (() => void) | null = null;
  private reconnectAttempts = 0;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private _state: ConnectionState = 'disconnected';
  private listeners: Partial<{ [K in keyof CloudAdapterEvents]: CloudAdapterEvents[K][] }> = {};

  constructor(private config: CloudConfig) {
    this.config.baseUrl = config.baseUrl || DEFAULT_BASE_URL;
  }

  /**
   * Get current connection state
   */
  get state(): ConnectionState {
    return this._state;
  }

  /**
   * Attach to a MindCache instance and start syncing
   */
  attach(mc: MindCache): void {
    if (this.mindcache) {
      this.detach();
    }

    this.mindcache = mc;

    // Subscribe to local changes → push to cloud
    const listener = () => {
      // Skip if this change came from remote
      if (mc.isRemoteUpdate()) {
        return;
      }

      // Get the current state and queue changes
      // In a real implementation, we'd track individual changes
      // For now, we'll sync the entire state on change
      this.syncLocalChanges();
    };

    mc.subscribeToAll(listener);
    this.unsubscribe = () => mc.unsubscribeFromAll(listener);
  }

  /**
   * Detach from the MindCache instance
   */
  detach(): void {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.mindcache = null;
  }

  /**
   * Connect to the cloud service
   */
  connect(): void {
    if (this._state === 'connecting' || this._state === 'connected') {
      return;
    }

    this._state = 'connecting';
    
    const url = `${this.config.baseUrl}/sync/${this.config.instanceId}`;
    
    try {
      this.ws = new WebSocket(url);
      this.setupWebSocket();
    } catch (error) {
      this._state = 'error';
      this.emit('error', error as Error);
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from the cloud service
   */
  disconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this._state = 'disconnected';
    this.emit('disconnected');
  }

  /**
   * Push an operation to the cloud
   */
  push(op: Operation): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(op));
    } else {
      // Queue for when we reconnect
      this.queue.push(op);
    }
  }

  /**
   * Add event listener
   */
  on<K extends keyof CloudAdapterEvents>(event: K, listener: CloudAdapterEvents[K]): void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);
  }

  /**
   * Remove event listener
   */
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
    if (!this.ws) return;

    this.ws.onopen = () => {
      // Authenticate
      this.ws!.send(JSON.stringify({ 
        type: 'auth', 
        apiKey: this.config.apiKey 
      }));
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data) as IncomingMessage;
        this.handleMessage(msg);
      } catch (error) {
        console.error('MindCache Cloud: Failed to parse message:', error);
      }
    };

    this.ws.onclose = () => {
      this._state = 'disconnected';
      this.emit('disconnected');
      this.scheduleReconnect();
    };

    this.ws.onerror = (error) => {
      this._state = 'error';
      this.emit('error', new Error('WebSocket error'));
      console.error('MindCache Cloud: WebSocket error:', error);
    };
  }

  private handleMessage(msg: IncomingMessage): void {
    switch (msg.type) {
      case 'auth_success':
        this._state = 'connected';
        this.reconnectAttempts = 0;
        this.emit('connected');
        this.flushQueue();
        break;

      case 'auth_error':
        this._state = 'error';
        this.emit('error', new Error(msg.error));
        this.disconnect();
        break;

      case 'sync':
        // Initial sync - load all data
        if (this.mindcache && msg.data) {
          Object.entries(msg.data).forEach(([key, entry]) => {
            const { value, attributes } = entry as { value: unknown; attributes: KeyAttributes };
            this.mindcache!._setFromRemote(key, value, attributes);
          });
          this.emit('synced');
        }
        break;

      case 'set':
        // Remote update (legacy)
        if (this.mindcache) {
          this.mindcache._setFromRemote(msg.key, msg.value, msg.attributes as KeyAttributes);
        }
        break;

      case 'key_updated':
        // Server broadcast of key update
        if (this.mindcache) {
          this.mindcache._setFromRemote(msg.key, msg.value, msg.attributes);
        }
        break;

      case 'delete':
        // Remote delete (legacy)
        if (this.mindcache) {
          this.mindcache._deleteFromRemote(msg.key);
        }
        break;

      case 'key_deleted':
        // Server broadcast of key deletion
        if (this.mindcache) {
          this.mindcache._deleteFromRemote(msg.key);
        }
        break;

      case 'clear':
        if (this.mindcache) {
          this.mindcache._clearFromRemote();
        }
        break;

      case 'cleared':
        // Server broadcast of clear
        if (this.mindcache) {
          this.mindcache._clearFromRemote();
        }
        break;

      case 'error':
        this.emit('error', new Error(msg.error));
        break;
    }
  }

  private flushQueue(): void {
    while (this.queue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const op = this.queue.shift()!;
      this.ws.send(JSON.stringify(op));
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

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private syncLocalChanges(): void {
    if (!this.mindcache) return;

    // Get all current entries and sync them
    const entries = this.mindcache.serialize();
    
    Object.entries(entries).forEach(([key, entry]) => {
      this.push({
        type: 'set',
        key,
        value: entry.value,
        attributes: entry.attributes,
        timestamp: Date.now()
      });
    });
  }
}

