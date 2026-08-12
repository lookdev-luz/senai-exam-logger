import { randomUUID } from 'node:crypto';
import path from 'node:path';
import * as vscode from 'vscode';
import { SessionStorage } from '../storage/sessionStorage';
import type { AuditEvent, EventType, ExamSession } from '../types';
import { createEvent, isPathInside } from '../utils/audit';

export class SessionManager {
  private active?: ExamSession;
  private acceptingEvents = false;

  constructor(private readonly storage: SessionStorage, private readonly extensionVersion: string) {}
  get current(): ExamSession | undefined { return this.active; }

  async recover(): Promise<boolean> {
    const session = await this.storage.recoverActive();
    if (!session || !vscode.workspace.workspaceFolders?.some((folder) => folder.uri.toString() === session.workspaceUri)) return false;
    this.active = session;
    this.acceptingEvents = true;
    await this.log('SESSION_RECOVERED');
    return true;
  }

  async start(folder: vscode.WorkspaceFolder, studentName: string, className: string, examName: string): Promise<ExamSession> {
    const session: ExamSession = {
      sessionId: randomUUID(), studentName, className, examName,
      startedAt: new Date().toISOString(), finishedAt: null,
      workspaceUri: folder.uri.toString(), workspacePath: folder.uri.fsPath,
      extensionVersion: this.extensionVersion, status: 'ACTIVE',
    };
    await this.storage.initialize(session);
    this.active = session;
    this.acceptingEvents = true;
    await this.log('SESSION_STARTED');
    return session;
  }

  contains(uri: vscode.Uri): boolean { return uri.scheme === 'file' && !!this.active && isPathInside(this.active.workspacePath, uri.fsPath); }
  relative(uri: vscode.Uri): string | undefined {
    return this.contains(uri) && this.active ? path.relative(this.active.workspacePath, uri.fsPath).replace(/\\/g, '/') : undefined;
  }

  async log(type: EventType, fields: Partial<AuditEvent> = {}): Promise<void> {
    if (!this.active || !this.acceptingEvents) return;
    await this.storage.append(createEvent(this.active.sessionId, type, fields));
  }

  async snapshot(document: vscode.TextDocument): Promise<void> {
    const session = this.active;
    const relativeFile = this.relative(document.uri);
    if (!session || relativeFile === undefined) return;
    const result = await this.storage.createSnapshot(session, relativeFile, document.getText());
    await this.log('SNAPSHOT_CREATED', { file: document.uri.toString(), relativeFile, languageId: document.languageId, metadata: { snapshotPath: result.path, sha256: result.hash, size: result.size } });
  }

  async finish(openDocuments: readonly vscode.TextDocument[]): Promise<ExamSession | undefined> {
    const session = this.active;
    if (!session) return undefined;
    for (const document of openDocuments) if (this.contains(document.uri)) await this.snapshot(document);
    await this.log('SESSION_FINISHED');
    this.acceptingEvents = false;
    session.finishedAt = new Date().toISOString();
    session.status = 'FINISHED';
    await this.storage.writeSession(session);
    await this.storage.flush();
    this.active = undefined;
    return session;
  }
}
