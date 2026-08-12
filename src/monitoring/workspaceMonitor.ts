import path from 'node:path';
import * as vscode from 'vscode';
import { SessionManager } from '../session/sessionManager';
import { correlateInternalCopy, isBulkInsert, lineCount, PREVIEW_LIMIT, sha256, storedText } from '../utils/audit';

export class WorkspaceMonitor implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[];
  private idleTimer?: NodeJS.Timeout;
  private lastActivityAt = Date.now();
  private idleStartedAt?: number;
  private activeFile?: string;
  private previousActiveFile?: string;
  private readonly lastEdit = new Map<string, number>();

  constructor(private readonly sessions: SessionManager) {
    this.disposables = [
      vscode.workspace.onDidOpenTextDocument((d) => void this.opened(d)), vscode.workspace.onDidCloseTextDocument((d) => void this.closed(d)),
      vscode.window.onDidChangeActiveTextEditor((e) => void this.activated(e)),
      vscode.workspace.onDidChangeTextDocument((e) => void this.changed(e)), vscode.workspace.onDidSaveTextDocument((d) => void this.saved(d)),
      vscode.workspace.onDidCreateFiles((e) => void this.files('FILE_CREATED', e.files)), vscode.workspace.onDidDeleteFiles((e) => void this.files('FILE_DELETED', e.files)),
      vscode.workspace.onDidRenameFiles((e) => void this.renamed(e)),
    ];
    this.scheduleIdle();
  }
  dispose(): void { if (this.idleTimer) clearTimeout(this.idleTimer); this.disposables.forEach((d) => d.dispose()); }

  async sessionStarted(editor: vscode.TextEditor | undefined): Promise<void> {
    this.lastActivityAt = Date.now(); this.idleStartedAt = undefined; this.activeFile = undefined; this.previousActiveFile = undefined; this.lastEdit.clear(); this.scheduleIdle();
    if (editor && this.sessions.contains(editor.document.uri)) { this.activeFile = this.sessions.relative(editor.document.uri); await this.sessions.log('DOCUMENT_ACTIVATED', this.fields(editor.document)); }
  }
  async prepareFinish(): Promise<void> { await this.activity(); if (this.activeFile) await this.sessions.log('DOCUMENT_DEACTIVATED', { relativeFile: this.activeFile, metadata: { reason: 'session-finished' } }); }
  sessionFinished(): void { if (this.idleTimer) clearTimeout(this.idleTimer); this.idleStartedAt = undefined; this.activeFile = undefined; this.previousActiveFile = undefined; this.lastEdit.clear(); }

  private scheduleIdle(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    const seconds = vscode.workspace.getConfiguration('senaiExamLogger').get<number>('idleThresholdSeconds', 60);
    this.idleTimer = setTimeout(() => void this.beginIdle(), Math.max(1, seconds) * 1000);
  }
  private async beginIdle(): Promise<void> {
    if (!this.sessions.current) { this.scheduleIdle(); return; }
    if (this.idleStartedAt) return;
    this.idleStartedAt = this.lastActivityAt;
    await this.sessions.log('IDLE_STARTED', { relativeFile: this.activeFile, metadata: { startedAt: new Date(this.idleStartedAt).toISOString(), activeFile: this.activeFile } });
  }
  private async activity(): Promise<{ sincePreviousMs: number; endedIdleDurationMs?: number }> {
    const now = Date.now(), sincePreviousMs = now - this.lastActivityAt;
    let endedIdleDurationMs: number | undefined;
    if (this.idleStartedAt) { endedIdleDurationMs = now - this.idleStartedAt; await this.sessions.log('IDLE_ENDED', { relativeFile: this.activeFile, metadata: { startedAt: new Date(this.idleStartedAt).toISOString(), endedAt: new Date(now).toISOString(), durationMs: endedIdleDurationMs, activeFile: this.activeFile } }); this.idleStartedAt = undefined; }
    this.lastActivityAt = now; this.scheduleIdle(); return { sincePreviousMs, endedIdleDurationMs };
  }
  private fields(document: vscode.TextDocument) { return { file: document.uri.toString(), relativeFile: this.sessions.relative(document.uri), languageId: document.languageId }; }

  private async opened(document: vscode.TextDocument): Promise<void> {
    if (!this.sessions.current || document.uri.scheme !== 'file') return;
    if (this.sessions.contains(document.uri)) await this.sessions.log('DOCUMENT_OPENED', this.fields(document));
    else await this.sessions.log('EXTERNAL_DOCUMENT_OPENED', { ...this.fields(document), metadata: { fileName: path.basename(document.uri.fsPath), extension: path.extname(document.uri.fsPath), previousActiveFile: this.activeFile } });
  }
  private async closed(document: vscode.TextDocument): Promise<void> { if (this.sessions.contains(document.uri)) await this.sessions.log('DOCUMENT_CLOSED', this.fields(document)); }
  private async activated(editor: vscode.TextEditor | undefined): Promise<void> {
    if (!this.sessions.current) return; await this.activity();
    if (this.activeFile) await this.sessions.log('DOCUMENT_DEACTIVATED', { relativeFile: this.activeFile });
    this.previousActiveFile = this.activeFile; this.activeFile = editor && this.sessions.contains(editor.document.uri) ? this.sessions.relative(editor.document.uri) : undefined;
    if (this.activeFile && editor) await this.sessions.log('DOCUMENT_ACTIVATED', this.fields(editor.document));
  }
  private async changed(event: vscode.TextDocumentChangeEvent): Promise<void> {
    if (!this.sessions.contains(event.document.uri) || !event.contentChanges.length) return;
    const relativeFile = this.sessions.relative(event.document.uri)!; const now = Date.now(); const previousEdit = this.lastEdit.get(relativeFile); const activity = await this.activity();
    const config = vscode.workspace.getConfiguration('senaiExamLogger'); const maxText = config.get<number>('maxStoredInsertedTextLength', 4096);
    const changes = event.contentChanges.map((c) => ({ range: c.range, rangeOffset: c.rangeOffset, rangeLength: c.rangeLength, insertedTextLength: c.text.length, removedTextLength: c.rangeLength, insertedLineCount: lineCount(c.text), removedLineCount: c.range.end.line - c.range.start.line, ...storedText(c.text, maxText) }));
    await this.sessions.log('DOCUMENT_CHANGED', { ...this.fields(event.document), metadata: { changes } });
    const characterThreshold = config.get<number>('bulkInsertCharacterThreshold', 100), lineThreshold = config.get<number>('bulkInsertLineThreshold', 5);
    for (const change of event.contentChanges) if (isBulkInsert(change.text, characterThreshold, lineThreshold)) {
      const bulkMetadata = { characterCount: change.text.length, lineCount: lineCount(change.text), sha256: sha256(change.text), preview: change.text.slice(0, PREVIEW_LIMIT), timeSinceLastFileChangeMs: previousEdit === undefined ? null : now - previousEdit, timeSinceLastEditorActivityMs: activity.sincePreviousMs, previousActiveFile: this.previousActiveFile, afterIdleDurationMs: activity.endedIdleDurationMs };
      await this.sessions.log('BULK_INSERT', { ...this.fields(event.document), metadata: bulkMetadata });
      await this.correlate(change.text, relativeFile);
      if (config.get<boolean>('snapshotOnBulkInsert', true)) await this.sessions.snapshot(event.document);
    }
    this.lastEdit.set(relativeFile, now);
  }
  private async correlate(inserted: string, destination: string): Promise<void> {
    const threshold = vscode.workspace.getConfiguration('senaiExamLogger').get<number>('internalCopySimilarityThreshold', 0.85);
    let best: { source: vscode.TextDocument; similarity: number; matchedCharacters: number; matchMethod: string } | undefined;
    for (const source of vscode.workspace.textDocuments) { const relative = this.sessions.relative(source.uri); if (!relative || relative === destination) continue; const match = correlateInternalCopy(inserted, source.getText()); if (match && match.similarity >= threshold && (!best || match.similarity > best.similarity)) best = { source, ...match }; }
    if (best) await this.sessions.log('POSSIBLE_INTERNAL_COPY', { relativeFile: destination, metadata: { sourceFile: this.sessions.relative(best.source.uri), destinationFile: destination, matchedCharacters: best.matchedCharacters, insertedCharacters: inserted.length, similarity: best.similarity, matchMethod: best.matchMethod } });
  }
  private async saved(document: vscode.TextDocument): Promise<void> { if (!this.sessions.contains(document.uri)) return; await this.activity(); await this.sessions.log('DOCUMENT_SAVED', this.fields(document)); await this.sessions.snapshot(document); }
  private async files(type: 'FILE_CREATED'|'FILE_DELETED', files: readonly vscode.Uri[]): Promise<void> { for (const uri of files) if (this.sessions.contains(uri)) { await this.activity(); await this.sessions.log(type, { file: uri.toString(), relativeFile: this.sessions.relative(uri) }); } }
  private async renamed(event: vscode.FileRenameEvent): Promise<void> { for (const f of event.files) if (this.sessions.contains(f.oldUri) || this.sessions.contains(f.newUri)) { await this.activity(); await this.sessions.log('FILE_RENAMED', { file: f.newUri.toString(), relativeFile: this.sessions.relative(f.newUri), metadata: { oldRelativeFile: this.sessions.relative(f.oldUri), newRelativeFile: this.sessions.relative(f.newUri) } }); } }
}
