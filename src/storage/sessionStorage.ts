import fs from 'node:fs/promises';
import path from 'node:path';
import * as vscode from 'vscode';
import type { AuditEvent, ExamSession } from '../types';
import { serializeEvent, sha256, safeSnapshotPath } from '../utils/audit';
import { derivedFiles, parseJsonLines } from '../report/exports';
import type { SnapshotReason } from '../types';

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

  async createSnapshot(session: ExamSession, relativeFile: string, content: string, reason: SnapshotReason): Promise<{ path: string; hash: string; size: number } | undefined> {
    const hash = sha256(content);
    const cacheKey = `${session.sessionId}:${relativeFile}`;
    if (this.snapshotHashes.get(cacheKey) === hash) return undefined;
    const safeFile = safeSnapshotPath(relativeFile);
    const directory = path.join(this.sessionDirectory(session.sessionId).fsPath, 'snapshots', safeFile);
    await fs.mkdir(directory, { recursive: true });
    if ((await fs.readdir(directory)).some((name) => name.includes(`_${hash.slice(0, 12)}`))) { this.snapshotHashes.set(cacheKey, hash); return undefined; }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = path.extname(safeFile) || '.txt';
    const snapshot = path.join(directory, `${stamp}_${reason}_${hash.slice(0, 12)}${extension}`);
    await fs.writeFile(snapshot, content, 'utf8');
    this.snapshotHashes.set(cacheKey, hash);
    const relativeSnapshot = path.relative(this.sessionDirectory(session.sessionId).fsPath, snapshot).replace(/\\/g, '/');
    return { path: relativeSnapshot, hash, size: Buffer.byteLength(content) };
  }

  async readEvents(sessionId: string): Promise<AuditEvent[]> {
    await this.flush();
    const content = await fs.readFile(path.join(this.sessionDirectory(sessionId).fsPath, 'events.jsonl'), 'utf8');
    return parseJsonLines(content);
  }

  async eventsHash(sessionId: string): Promise<string> {
    await this.flush();
    return sha256(await fs.readFile(path.join(this.sessionDirectory(sessionId).fsPath, 'events.jsonl')));
  }

  async generateDerivedFiles(session: ExamSession): Promise<vscode.Uri> {
    const directory = this.sessionDirectory(session.sessionId).fsPath; const events = await this.readEvents(session.sessionId); const files = derivedFiles(session, events);
    const eventsDirectory = path.join(directory, 'events'); await fs.mkdir(eventsDirectory, { recursive: true });
    await Promise.all([fs.copyFile(path.join(directory, 'events.jsonl'), path.join(eventsDirectory, 'events.jsonl')), fs.writeFile(path.join(eventsDirectory, 'events.pretty.json'), files.pretty), fs.writeFile(path.join(eventsDirectory, 'events.csv'), files.eventsCsv), fs.writeFile(path.join(directory, 'files-summary.csv'), files.filesCsv), fs.writeFile(path.join(directory, 'summary.json'), files.summary), fs.writeFile(path.join(directory, 'report.html'), files.report)]);
    return vscode.Uri.file(path.join(directory, 'report.html'));
  }

  async latestFinishedSession(): Promise<ExamSession | undefined> { const sessions = path.join(this.root.fsPath, 'sessions'); let entries: string[]; try { entries = await fs.readdir(sessions); } catch { return undefined; } const result: ExamSession[]=[]; for(const entry of entries) try { const value=JSON.parse(await fs.readFile(path.join(sessions,entry,'session.json'),'utf8')) as ExamSession; if(value.status==='FINISHED') result.push(value); } catch {} return result.sort((a,b)=>(b.finishedAt??'').localeCompare(a.finishedAt??''))[0]; }
  async latestSessionDirectory(): Promise<vscode.Uri | undefined> { const sessions=path.join(this.root.fsPath,'sessions'); let entries:string[]; try { entries=await fs.readdir(sessions); } catch{return undefined;} const withTime=await Promise.all(entries.map(async entry=>({entry,time:(await fs.stat(path.join(sessions,entry))).mtimeMs}))); return withTime.length?vscode.Uri.file(path.join(sessions,withTime.sort((a,b)=>b.time-a.time)[0].entry)):undefined; }
  async regenerateLatest(): Promise<vscode.Uri> { const session=await this.latestFinishedSession(); if(!session) throw new Error('Nenhuma sessão finalizada foi encontrada. Sessões ACTIVE não podem gerar relatório final.'); return this.generateDerivedFiles(session); }

  async latestFinishedReport(): Promise<vscode.Uri | undefined> {
    const session = await this.latestFinishedSession();
    if (!session) return undefined;
    const report = vscode.Uri.joinPath(this.sessionDirectory(session.sessionId), 'report.html');
    try { await fs.access(report.fsPath); return report; } catch { return this.generateDerivedFiles(session); }
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
