/**
 * ContextBlur - Status Bar
 * Shows blur state and count in the VS Code status bar.
 */

import * as vscode from 'vscode';

export class StatusBar {
  private item: vscode.StatusBarItem;
  private _active = false;
  private _count = 0;
  private _risk: 'safe' | 'warning' | 'critical' = 'safe';

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.item.command = 'contextblur.toggle';
    this.item.tooltip = 'Toggle ContextBlur auto-blur';
    this.update();
    this.item.show();
  }

  /** Whether auto-blur is currently active */
  get active(): boolean {
    return this._active;
  }

  set active(value: boolean) {
    this._active = value;
    this.update();
  }

  /** Number of currently blurred ranges */
  get count(): number {
    return this._count;
  }

  set count(value: number) {
    this._count = value;
    this.update();
  }

  /** Risk level for the active editor */
  set risk(value: 'safe' | 'warning' | 'critical') {
    this._risk = value;
    this.update();
  }

  private update(): void {
    if (this._active) {
      const countText = this._count > 0 ? ` ${this._count} blurred` : ' live';
      const riskText =
        this._risk === 'critical' ? ' • CRITICAL' :
        this._risk === 'warning' ? ' • warning' :
        '';
      this.item.text = `$(eye-closed) ContextBlur${countText}${riskText}`;
      this.item.backgroundColor =
        this._risk === 'critical'
          ? new vscode.ThemeColor('statusBarItem.errorBackground')
          : undefined;
      this.item.tooltip = this._risk === 'critical'
        ? 'ContextBlur active: critical secrets detected and blurred.'
        : 'ContextBlur active';
    } else {
      if (this._risk === 'critical') {
        this.item.text = '$(warning) ContextBlur: risk';
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
        this.item.tooltip = 'Sensitive content detected. Run ContextBlur: Go Live Mode.';
      } else if (this._risk === 'warning') {
        this.item.text = '$(eye) ContextBlur: check';
        this.item.backgroundColor = undefined;
        this.item.tooltip = 'Potentially sensitive content detected.';
      } else {
        this.item.text = '$(eye) ContextBlur';
        this.item.backgroundColor = undefined;
        this.item.tooltip = 'Toggle ContextBlur auto-blur';
      }
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
