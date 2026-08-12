import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import type { AuditEvent, ExamSession } from '../types';
import { serializeEvent, sha256, safeSnapshotPath } from '../utils/audit';
import { generateReportHtml } from '../report/report';

export class SessionStorage {
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly snapshotHashes = new Map<string, string>();

  constructor(private readonly root: vscode.Uri) {}

  sessionDirectory(id: string): vscode.Uri { return vscode.Uri.joinPath(this.root, 'sessions', id); }

  async initialize(session: ExamSession): Promise<void> {
    await fs.mkdir(path.join(this.sessionDirectory(session.sessionId).fsPath, 'snapshots'), { recursive: true });
    await this.writeSession(session);
    await fs.writeFile(path.join(this.sessionDirectory(session.sessionId).fsPath, 'events.jsonl'), '', { flag: 'a' });
  }

  async writeSession(session: ExamSession): Promise<void> {
    const file = path.join(this.sessionDirectory(session.sessionId).fsPath, 'session.json');
    await fs.mkdir(path.dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(session, null, 2)}\n`, 'utf8');
    await fs.rename(temporary, file);
  }

  append(event: AuditEvent): Promise<void> {
    const file = path.join(this.sessionDirectory(event.sessionId).fsPath, 'events.jsonl');
    const operation = this.writeQueue.then(() => fs.appendFile(file, serializeEvent(event), 'utf8'));
    this.writeQueue = operation.catch(() => undefined);
    return operation;
  }

  async flush(): Promise<void> { await this.writeQueue; }

  async createSnapshot(session: ExamSession, relativeFile: string, content: string): Promise<{ path: string; hash: string; size: number } | undefined> {
    const hash = sha256(content);
    const cacheKey = `${session.sessionId}:${relativeFile}`;
    if (this.snapshotHashes.get(cacheKey) === hash) return undefined;
    const safeFile = safeSnapshotPath(relativeFile);
    const directory = path.join(this.sessionDirectory(session.sessionId).fsPath, 'snapshots', safeFile);
    await fs.mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = path.join(directory, `${stamp}-${hash.slice(0, 12)}.txt`);
    await fs.writeFile(snapshot, content, 'utf8');
    this.snapshotHashes.set(cacheKey, hash);
    const relativeSnapshot = path.relative(this.sessionDirectory(session.sessionId).fsPath, snapshot).replace(/\\/g, '/');
    return { path: relativeSnapshot, hash, size: Buffer.byteLength(content) };
  }

  async readEvents(sessionId: string): Promise<AuditEvent[]> {
    await this.flush();
    const content = await fs.readFile(path.join(this.sessionDirectory(sessionId).fsPath, 'events.jsonl'), 'utf8');
    return content.split('\n').filter(Boolean).map((line) => JSON.parse(line) as AuditEvent);
  }

  async eventsHash(sessionId: string): Promise<string> {
    await this.flush();
    return sha256(await fs.readFile(path.join(this.sessionDirectory(sessionId).fsPath, 'events.jsonl')));
  }

  async writeReport(session: ExamSession): Promise<vscode.Uri> {
    const file = vscode.Uri.joinPath(this.sessionDirectory(session.sessionId), 'report.html');
    await fs.writeFile(file.fsPath, generateReportHtml(session, await this.readEvents(session.sessionId)), 'utf8');
    return file;
  }

  async latestFinishedReport(): Promise<vscode.Uri | undefined> {
    const sessions = path.join(this.root.fsPath, 'sessions'); let entries: string[];
    try { entries = await fs.readdir(sessions); } catch { return undefined; }
    const finished: ExamSession[] = [];
    for (const entry of entries) try { const data = JSON.parse(await fs.readFile(path.join(sessions, entry, 'session.json'), 'utf8')) as ExamSession; if (data.status === 'FINISHED') finished.push(data); } catch { /* Ignore invalid entries. */ }
    const session = finished.sort((a,b) => (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''))[0];
    if (!session) return undefined;
    const report = vscode.Uri.joinPath(this.sessionDirectory(session.sessionId), 'report.html');
    try { await fs.access(report.fsPath); return report; } catch { return undefined; }
  }

  async recoverActive(): Promise<ExamSession | undefined> {
    const sessions = path.join(this.root.fsPath, 'sessions');
    let entries: string[];
    try { entries = await fs.readdir(sessions); } catch { return undefined; }
    const active: ExamSession[] = [];
    for (const entry of entries) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(sessions, entry, 'session.json'), 'utf8')) as ExamSession;
        if (data.status === 'ACTIVE') active.push(data);
      } catch { /* Ignore incomplete or unrelated storage entries. */ }
    }
    return active.sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  }
}
