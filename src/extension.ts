import * as vscode from 'vscode';
import { registerCommands } from './commands/registerCommands';
import { WorkspaceMonitor } from './monitoring/workspaceMonitor';
import { SessionManager } from './session/sessionManager';
import { SessionStorage } from './storage/sessionStorage';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const version = String(context.extension.packageJSON.version ?? 'unknown');
  const sessions = new SessionManager(new SessionStorage(context.globalStorageUri), version);
  const monitor = new WorkspaceMonitor(sessions);
  context.subscriptions.push(monitor, ...registerCommands(context, sessions, monitor));
  if (await sessions.recover()) { await monitor.sessionStarted(vscode.window.activeTextEditor); await vscode.window.showInformationMessage('SENAI Exam Logger: sessão ativa recuperada após reinicialização.'); }
}

export function deactivate(): void {}
