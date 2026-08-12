export type SessionStatus = 'ACTIVE' | 'FINISHED';

export interface ExamSession {
  sessionId: string;
  studentName: string;
  className: string;
  examName: string;
  startedAt: string;
  finishedAt: string | null;
  workspaceUri: string;
  workspacePath: string;
  extensionVersion: string;
  status: SessionStatus;
}

export type EventType =
  | 'SESSION_STARTED' | 'SESSION_RECOVERED' | 'SESSION_FINISHED'
  | 'DOCUMENT_OPENED' | 'EXTERNAL_DOCUMENT_OPENED'
  | 'DOCUMENT_CHANGED' | 'DOCUMENT_SAVED'
  | 'FILE_CREATED' | 'FILE_DELETED' | 'FILE_RENAMED'
  | 'BULK_INSERT' | 'SNAPSHOT_CREATED';

export interface AuditEvent {
  eventId: string;
  sessionId: string;
  timestamp: string;
  eventType: EventType;
  file?: string;
  relativeFile?: string;
  languageId?: string;
  metadata?: Record<string, unknown>;
}
