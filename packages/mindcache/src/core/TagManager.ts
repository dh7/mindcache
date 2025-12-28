/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Y from 'yjs';
import type { KeyAttributes, SystemTag } from './types';

/**
 * Interface for MindCache methods needed by TagManager.
 */
export interface ITagManageable {
    // Yjs access
    doc: Y.Doc;
    rootMap: Y.Map<Y.Map<any>>;

    // Access control
    hasSystemAccess: boolean;

    // Key utilities
    getSortedKeys(): string[];
    get_value(key: string): any;

    // Notifications
    notifyGlobalListeners(): void;

    // System tag normalization
    normalizeSystemTags(tags: SystemTag[]): SystemTag[];
}

/**
 * Manages content tags and system tags for MindCache keys.
 */
export class TagManager {
  // ============================================
  // Content Tag Methods
  // ============================================

  /**
     * Add a content tag to a key.
     * @returns true if the tag was added, false if key doesn't exist or tag already exists
     */
  static addTag(mc: ITagManageable, key: string, tag: string): boolean {
    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const contentTags = attributes?.contentTags || [];

    if (contentTags.includes(tag)) {
      return false;
    }

    mc.doc.transact(() => {
      const newContentTags = [...contentTags, tag];
      entryMap.set('attributes', {
        ...attributes,
        contentTags: newContentTags,
        tags: newContentTags // Sync legacy tags array
      });
    });

    mc.notifyGlobalListeners();
    return true;
  }

  /**
     * Remove a content tag from a key.
     * @returns true if the tag was removed
     */
  static removeTag(mc: ITagManageable, key: string, tag: string): boolean {
    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const contentTags = attributes?.contentTags || [];
    const tagIndex = contentTags.indexOf(tag);

    if (tagIndex === -1) {
      return false;
    }

    mc.doc.transact(() => {
      const newContentTags = contentTags.filter((t: string) => t !== tag);
      entryMap.set('attributes', {
        ...attributes,
        contentTags: newContentTags,
        tags: newContentTags // Sync legacy tags array
      });
    });

    mc.notifyGlobalListeners();
    return true;
  }

  /**
     * Get all content tags for a key.
     */
  static getTags(mc: ITagManageable, key: string): string[] {
    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return [];
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.contentTags || [];
  }

  /**
     * Get all unique content tags across all keys.
     */
  static getAllTags(mc: ITagManageable): string[] {
    const allTags = new Set<string>();

    for (const [, val] of mc.rootMap) {
      const entryMap = val as Y.Map<any>;
      const attributes = entryMap.get('attributes') as KeyAttributes;
      if (attributes?.contentTags) {
        attributes.contentTags.forEach((tag: string) => allTags.add(tag));
      }
    }

    return Array.from(allTags);
  }

  /**
     * Check if a key has a specific content tag.
     */
  static hasTag(mc: ITagManageable, key: string, tag: string): boolean {
    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.contentTags?.includes(tag) || false;
  }

  /**
     * Get all keys with a specific content tag as formatted string.
     */
  static getTagged(mc: ITagManageable, tag: string): string {
    const entries: Array<[string, any]> = [];

    const keys = mc.getSortedKeys();
    keys.forEach(key => {
      if (TagManager.hasTag(mc, key, tag)) {
        entries.push([key, mc.get_value(key)]);
      }
    });

    return entries
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }

  /**
     * Get array of keys with a specific content tag.
     */
  static getKeysByTag(mc: ITagManageable, tag: string): string[] {
    const keys = mc.getSortedKeys();
    return keys.filter(key => TagManager.hasTag(mc, key, tag));
  }

  // ============================================
  // System Tag Methods (requires system access)
  // ============================================

  /**
     * Add a system tag to a key (requires system access).
     */
  static systemAddTag(mc: ITagManageable, key: string, tag: SystemTag): boolean {
    if (!mc.hasSystemAccess) {
      console.warn('MindCache: systemAddTag requires system access level');
      return false;
    }

    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const systemTags = attributes?.systemTags || [];

    if (systemTags.includes(tag)) {
      return false;
    }

    mc.doc.transact(() => {
      const newSystemTags = [...systemTags, tag];
      const normalizedTags = mc.normalizeSystemTags(newSystemTags);
      entryMap.set('attributes', {
        ...attributes,
        systemTags: normalizedTags
      });
    });

    mc.notifyGlobalListeners();
    return true;
  }

  /**
     * Remove a system tag from a key (requires system access).
     */
  static systemRemoveTag(mc: ITagManageable, key: string, tag: SystemTag): boolean {
    if (!mc.hasSystemAccess) {
      console.warn('MindCache: systemRemoveTag requires system access level');
      return false;
    }

    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    const systemTags = attributes?.systemTags || [];
    const tagIndex = systemTags.indexOf(tag);

    if (tagIndex === -1) {
      return false;
    }

    mc.doc.transact(() => {
      const newSystemTags = systemTags.filter((t: SystemTag) => t !== tag);
      entryMap.set('attributes', {
        ...attributes,
        systemTags: newSystemTags
      });
    });

    mc.notifyGlobalListeners();
    return true;
  }

  /**
     * Get all system tags for a key (requires system access).
     */
  static systemGetTags(mc: ITagManageable, key: string): SystemTag[] {
    if (!mc.hasSystemAccess) {
      console.warn('MindCache: systemGetTags requires system access level');
      return [];
    }

    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return [];
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.systemTags || [];
  }

  /**
     * Check if a key has a specific system tag (requires system access).
     */
  static systemHasTag(mc: ITagManageable, key: string, tag: SystemTag): boolean {
    if (!mc.hasSystemAccess) {
      console.warn('MindCache: systemHasTag requires system access level');
      return false;
    }

    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    const attributes = entryMap.get('attributes') as KeyAttributes;
    return attributes?.systemTags?.includes(tag) || false;
  }

  /**
     * Set all system tags for a key at once (requires system access).
     */
  static systemSetTags(mc: ITagManageable, key: string, tags: SystemTag[]): boolean {
    if (!mc.hasSystemAccess) {
      console.warn('MindCache: systemSetTags requires system access level');
      return false;
    }

    const entryMap = mc.rootMap.get(key);
    if (!entryMap) {
      return false;
    }

    mc.doc.transact(() => {
      const attributes = entryMap.get('attributes') as KeyAttributes;
      entryMap.set('attributes', {
        ...attributes,
        systemTags: [...tags]
      });
    });

    mc.notifyGlobalListeners();
    return true;
  }

  /**
     * Get all keys with a specific system tag (requires system access).
     */
  static systemGetKeysByTag(mc: ITagManageable, tag: SystemTag): string[] {
    if (!mc.hasSystemAccess) {
      console.warn('MindCache: systemGetKeysByTag requires system access level');
      return [];
    }

    const keys = mc.getSortedKeys();
    return keys.filter(key => TagManager.systemHasTag(mc, key, tag));
  }
}
