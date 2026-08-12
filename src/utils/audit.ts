import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AuditEvent, EventType } from '../types';

export const PREVIEW_LIMIT = 500;

export function sha256(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function isPathInside(workspacePath: string, filePath: string): boolean {
  const relative = path.relative(path.resolve(workspacePath), path.resolve(filePath));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

export function safeSnapshotPath(relativeFile: string): string {
  const normalized = relativeFile.replace(/\\/g, '/');
  const parts = normalized.split('/').filter((part) => part && part !== '.' && part !== '..');
  return parts.map((part) => part.replace(/[^\p{L}\p{N}._-]/gu, '_')).join('/') || 'unnamed';
}

export function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split(/\r\n|\r|\n/).length;
}

export function isBulkInsert(text: string, characterThreshold: number, lineThreshold: number): boolean {
  return text.length >= characterThreshold || lineCount(text) >= lineThreshold;
}

export function storedText(text: string, limit = 4_096): Record<string, unknown> {
  if (text.length <= limit) return { insertedText: text, truncated: false };
  return {
    insertedText: text.slice(0, PREVIEW_LIMIT),
    truncated: true,
    insertedTextHash: sha256(text),
    insertedTextLength: text.length,
  };
}

export interface InternalMatch { matchedCharacters: number; similarity: number; matchMethod: 'exact-substring' | 'line-overlap'; }

export function correlateInternalCopy(inserted: string, source: string, minimumLength = 40): InternalMatch | undefined {
  if (inserted.length < minimumLength || source.length < minimumLength) return undefined;
  if (source.includes(inserted)) return { matchedCharacters: inserted.length, similarity: 1, matchMethod: 'exact-substring' };
  const lines = inserted.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return undefined;
  const sourceLines = new Set(source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean));
  const matchedCharacters = lines.filter((line) => sourceLines.has(line)).reduce((sum, line) => sum + line.length, 0);
  return { matchedCharacters, similarity: matchedCharacters / Math.max(1, lines.reduce((sum, line) => sum + line.length, 0)), matchMethod: 'line-overlap' };
}

export function createEvent(sessionId: string, eventType: EventType, fields: Partial<AuditEvent> = {}): AuditEvent {
  return { eventId: randomUUID(), sessionId, timestamp: new Date().toISOString(), eventType, ...fields };
}

export function serializeEvent(event: AuditEvent): string {
  return `${JSON.stringify(event)}\n`;
}
