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
  eventsSha256?: string;
}

export type EventType =
  | 'SESSION_STARTED' | 'SESSION_RECOVERED' | 'SESSION_FINISHED'
  | 'DOCUMENT_OPENED' | 'DOCUMENT_CLOSED' | 'DOCUMENT_ACTIVATED' | 'DOCUMENT_DEACTIVATED' | 'EXTERNAL_DOCUMENT_OPENED'
  | 'DOCUMENT_CHANGED' | 'DOCUMENT_SAVED'
  | 'FILE_CREATED' | 'FILE_DELETED' | 'FILE_RENAMED'
  | 'BULK_INSERT' | 'POSSIBLE_INTERNAL_COPY' | 'IDLE_STARTED' | 'IDLE_ENDED'
  | 'SNAPSHOT_CREATED' | 'REPORT_GENERATED';

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

export interface FileStatistics {
  relativeFile: string;
  firstOpenedAt?: string;
  lastOpenedAt?: string;
  firstEditedAt?: string;
  lastEditedAt?: string;
  activeDurationMs: number;
  editCount: number;
  saveCount: number;
  charactersInserted: number;
  charactersRemoved: number;
  bulkInsertCount: number;
}
