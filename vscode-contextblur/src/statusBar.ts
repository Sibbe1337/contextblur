/**
 * ContextBlur - Status Bar
 * Shows blur state and count in the VS Code status bar.
 */

import * as vscode from 'vscode';

export class StatusBar {
  private item: vscode.StatusBarItem;
  private _active = false;
  private _count = 0;

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

  private update(): void {
    if (this._active) {
      const countText = this._count > 0 ? `: ${this._count} blurred` : '';
      this.item.text = `$(eye-closed) ContextBlur${countText}`;
      this.item.backgroundColor = undefined;
    } else {
      this.item.text = '$(eye) ContextBlur';
      this.item.backgroundColor = undefined;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
