/**
 * ContextBlur - VS Code Extension Entry Point
 * Activates blur commands, status bar, and auto-scan lifecycle.
 */

import * as vscode from 'vscode';
import { BlurManager } from './blurManager';
import { StatusBar } from './statusBar';
import { disposeDecorationType } from './blurDecorations';
import * as config from './config';

let blurManager: BlurManager | undefined;
let statusBar: StatusBar | undefined;

export function activate(context: vscode.ExtensionContext): void {
  if (!config.isEnabled()) {
    return;
  }

  // Create status bar and blur manager
  statusBar = new StatusBar();
  blurManager = new BlurManager(statusBar);
  blurManager.registerListeners();

  // ── Register commands ──

  context.subscriptions.push(
    vscode.commands.registerCommand('contextblur.toggle', () => {
      blurManager!.toggle();
      const state = blurManager!.isAutoBlurEnabled ? 'ON' : 'OFF';
      vscode.window.showInformationMessage(`ContextBlur: Auto-blur ${state}`);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('contextblur.blurSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        blurManager!.blurSelection(editor);
      } else {
        vscode.window.showInformationMessage('ContextBlur: No active editor.');
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('contextblur.autoBlur', () => {
      blurManager!.runAutoBlur();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('contextblur.clearAll', () => {
      blurManager!.clearAll();
      vscode.window.showInformationMessage('ContextBlur: All blurs cleared.');
    })
  );

  // ── Watch for config changes (e.g. extension re-enabled) ──

  context.subscriptions.push(
    config.onConfigChange(() => {
      // If extension was disabled, nothing to do (requires reload)
      // Style/pattern changes are handled by BlurManager's own listener
    })
  );

  // ── Disposables ──

  context.subscriptions.push({
    dispose: () => {
      blurManager?.dispose();
      statusBar?.dispose();
      disposeDecorationType();
    },
  });
}

export function deactivate(): void {
  blurManager?.dispose();
  statusBar?.dispose();
  disposeDecorationType();
  blurManager = undefined;
  statusBar = undefined;
}
