import path from 'node:path';
import * as vscode from 'vscode';
import { SessionManager } from '../session/sessionManager';
import { isBulkInsert, lineCount, PREVIEW_LIMIT, sha256, storedText } from '../utils/audit';

export class WorkspaceMonitor implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[];
  constructor(private readonly sessions: SessionManager) {
    this.disposables = [
      vscode.workspace.onDidOpenTextDocument((document) => void this.opened(document)),
      vscode.workspace.onDidChangeTextDocument((event) => void this.changed(event)),
      vscode.workspace.onDidSaveTextDocument((document) => void this.saved(document)),
      vscode.workspace.onDidCreateFiles((event) => void this.created(event)),
      vscode.workspace.onDidDeleteFiles((event) => void this.deleted(event)),
      vscode.workspace.onDidRenameFiles((event) => void this.renamed(event)),
    ];
  }
  dispose(): void { this.disposables.forEach((item) => item.dispose()); }

  private async opened(document: vscode.TextDocument): Promise<void> {
    if (!this.sessions.current || document.uri.scheme !== 'file') return;
    const fields = { file: document.uri.toString(), relativeFile: this.sessions.relative(document.uri), languageId: document.languageId,
      metadata: this.sessions.contains(document.uri) ? undefined : { fileName: path.basename(document.uri.fsPath) } };
    await this.sessions.log(this.sessions.contains(document.uri) ? 'DOCUMENT_OPENED' : 'EXTERNAL_DOCUMENT_OPENED', fields);
  }

  private async changed(event: vscode.TextDocumentChangeEvent): Promise<void> {
    if (!this.sessions.contains(event.document.uri) || event.contentChanges.length === 0) return;
    const relativeFile = this.sessions.relative(event.document.uri);
    const changes = event.contentChanges.map((change) => ({ range: change.range, rangeOffset: change.rangeOffset, rangeLength: change.rangeLength,
      insertedTextLength: change.text.length, removedTextLength: change.rangeLength, insertedLineCount: lineCount(change.text),
      removedLineCount: change.range.end.line - change.range.start.line + (change.range.end.character > 0 ? 1 : 0), ...storedText(change.text) }));
    await this.sessions.log('DOCUMENT_CHANGED', { file: event.document.uri.toString(), relativeFile, languageId: event.document.languageId, metadata: { changes } });
    const config = vscode.workspace.getConfiguration('senaiExamLogger');
    const characters = config.get<number>('bulkInsertCharacterThreshold', 100);
    const lines = config.get<number>('bulkInsertLineThreshold', 5);
    for (const change of event.contentChanges) if (isBulkInsert(change.text, characters, lines)) {
      await this.sessions.log('BULK_INSERT', { file: event.document.uri.toString(), relativeFile, languageId: event.document.languageId,
        metadata: { characterCount: change.text.length, lineCount: lineCount(change.text), sha256: sha256(change.text), preview: change.text.slice(0, PREVIEW_LIMIT) } });
    }
  }
  private async saved(document: vscode.TextDocument): Promise<void> {
    if (!this.sessions.contains(document.uri)) return;
    await this.sessions.log('DOCUMENT_SAVED', { file: document.uri.toString(), relativeFile: this.sessions.relative(document.uri), languageId: document.languageId });
    await this.sessions.snapshot(document);
  }
  private async created(event: vscode.FileCreateEvent): Promise<void> { for (const uri of event.files) if (this.sessions.contains(uri)) await this.sessions.log('FILE_CREATED', { file: uri.toString(), relativeFile: this.sessions.relative(uri) }); }
  private async deleted(event: vscode.FileDeleteEvent): Promise<void> { for (const uri of event.files) if (this.sessions.contains(uri)) await this.sessions.log('FILE_DELETED', { file: uri.toString(), relativeFile: this.sessions.relative(uri) }); }
  private async renamed(event: vscode.FileRenameEvent): Promise<void> {
    for (const file of event.files) if (this.sessions.contains(file.oldUri) || this.sessions.contains(file.newUri)) await this.sessions.log('FILE_RENAMED', {
      file: file.newUri.toString(), relativeFile: this.sessions.relative(file.newUri), metadata: { oldFile: file.oldUri.toString(), oldRelativeFile: this.sessions.relative(file.oldUri), newFile: file.newUri.toString(), newRelativeFile: this.sessions.relative(file.newUri) },
    });
  }
}
