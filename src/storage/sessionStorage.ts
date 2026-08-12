import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import type { AuditEvent, ExamSession } from '../types';
import { serializeEvent, sha256, safeSnapshotPath } from '../utils/audit';

export class SessionStorage {
  private writeQueue: Promise<void> = Promise.resolve();

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

  async createSnapshot(session: ExamSession, relativeFile: string, content: string): Promise<{ path: string; hash: string; size: number }> {
    const hash = sha256(content);
    const safeFile = safeSnapshotPath(relativeFile);
    const directory = path.join(this.sessionDirectory(session.sessionId).fsPath, 'snapshots', safeFile);
    await fs.mkdir(directory, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshot = path.join(directory, `${stamp}-${hash.slice(0, 12)}.txt`);
    await fs.writeFile(snapshot, content, 'utf8');
    const relativeSnapshot = path.relative(this.sessionDirectory(session.sessionId).fsPath, snapshot).replace(/\\/g, '/');
    return { path: relativeSnapshot, hash, size: Buffer.byteLength(content) };
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
