/**
 * ContextBlur - Blur Manager
 * Core engine: scans documents for sensitive data, applies/clears decorations.
 */

import * as vscode from 'vscode';
import { PatternDef, getEnabledPatterns } from './patterns';
import { getDecorationType, BlurStyle } from './blurDecorations';
import * as config from './config';
import { StatusBar } from './statusBar';
import { minimatch } from './minimatch';

export class BlurManager {
  private blurredRanges = new Map<string, vscode.Range[]>();
  private manualRanges = new Map<string, vscode.Range[]>();
  private autoBlurEnabled = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private disposables: vscode.Disposable[] = [];

  constructor(private statusBar: StatusBar) {}

  /** Whether auto-blur scanning is active */
  get isAutoBlurEnabled(): boolean {
    return this.autoBlurEnabled;
  }

  /**
   * Toggle auto-blur on/off.
   */
  toggle(): void {
    this.autoBlurEnabled = !this.autoBlurEnabled;
    this.statusBar.active = this.autoBlurEnabled;

    if (this.autoBlurEnabled) {
      // Scan current editor
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        this.scanAndApply(editor);
      }
    } else {
      // Clear all auto-detected blurs (keep manual)
      this.clearAutoBlurs();
    }
  }

  /**
   * Run a one-shot auto-blur scan on the active editor.
   */
  runAutoBlur(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('ContextBlur: No active editor.');
      return;
    }
    this.scanAndApply(editor);
    vscode.window.showInformationMessage(
      `ContextBlur: Found ${this.getCount(editor.document.uri.toString())} sensitive items.`
    );
  }

  /**
   * Blur the current selection(s) manually.
   */
  blurSelection(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString();
    const existing = this.manualRanges.get(uri) || [];

    for (const sel of editor.selections) {
      if (!sel.isEmpty) {
        existing.push(new vscode.Range(sel.start, sel.end));
      }
    }

    this.manualRanges.set(uri, existing);
    this.applyDecorations(editor);
  }

  /**
   * Clear all blurs (auto + manual) in the active editor.
   */
  clearAll(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return; }

    const uri = editor.document.uri.toString();
    this.blurredRanges.delete(uri);
    this.manualRanges.delete(uri);
    this.applyDecorations(editor);
  }

  /**
   * Scan a document for sensitive patterns and apply decorations.
   */
  scanAndApply(editor: vscode.TextEditor): void {
    const doc = editor.document;
    const uri = doc.uri.toString();

    // Check exclude globs
    if (this.isExcluded(doc)) {
      return;
    }

    const enabledMap = config.getEnabledPatterns();
    const patterns = getEnabledPatterns(enabledMap);
    const ranges: vscode.Range[] = [];

    for (let lineIdx = 0; lineIdx < doc.lineCount; lineIdx++) {
      const line = doc.lineAt(lineIdx);
      const text = line.text;

      for (const pattern of patterns) {
        // Check file filter for this pattern
        if (pattern.fileFilter && !this.matchesFileFilter(doc, pattern.fileFilter)) {
          continue;
        }

        // Reset regex lastIndex for each line
        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          // For envValue pattern, blur only the value (capture group 1)
          if (pattern.key === 'envValue' && match[1]) {
            const valueStart = match.index + match[0].indexOf(match[1]);
            const startPos = new vscode.Position(lineIdx, valueStart);
            const endPos = new vscode.Position(lineIdx, valueStart + match[1].length);
            ranges.push(new vscode.Range(startPos, endPos));
          } else {
            const startPos = new vscode.Position(lineIdx, match.index);
            const endPos = new vscode.Position(lineIdx, match.index + match[0].length);
            ranges.push(new vscode.Range(startPos, endPos));
          }

          // Prevent infinite loop on zero-length matches
          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      }
    }

    this.blurredRanges.set(uri, ranges);
    this.applyDecorations(editor);
  }

  /**
   * Apply all decorations (auto + manual) to the editor.
   */
  private applyDecorations(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString();
    const autoRanges = this.blurredRanges.get(uri) || [];
    const manualRangesForUri = this.manualRanges.get(uri) || [];
    const allRanges = [...autoRanges, ...manualRangesForUri];

    const style = config.getStyle();
    const decorationType = getDecorationType(style);
    editor.setDecorations(decorationType, allRanges);

    this.statusBar.count = allRanges.length;
  }

  /**
   * Clear only auto-detected blurs across all documents.
   */
  private clearAutoBlurs(): void {
    this.blurredRanges.clear();

    // Reapply decorations (manual only will remain)
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      this.applyDecorations(editor);
    }
  }

  /**
   * Get total blur count for a document.
   */
  private getCount(uri: string): number {
    const auto = this.blurredRanges.get(uri)?.length || 0;
    const manual = this.manualRanges.get(uri)?.length || 0;
    return auto + manual;
  }

  /**
   * Check if a document matches exclude globs.
   */
  private isExcluded(doc: vscode.TextDocument): boolean {
    const globs = config.getExcludeGlobs();
    const fileName = doc.fileName;

    for (const glob of globs) {
      if (minimatch(fileName, glob)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a document matches a pattern's file filter.
   */
  private matchesFileFilter(doc: vscode.TextDocument, filters: string[]): boolean {
    const fileName = doc.fileName;
    for (const filter of filters) {
      if (minimatch(fileName, filter) || fileName.endsWith(filter.replace('*', ''))) {
        return true;
      }
    }
    return false;
  }

  /**
   * Register event listeners for editor changes.
   */
  registerListeners(): void {
    // Re-apply decorations when switching editors
    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor) {
          if (this.autoBlurEnabled) {
            this.scanAndApply(editor);
          } else {
            this.applyDecorations(editor);
          }
        }
      })
    );

    // Re-scan on document changes (debounced)
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!this.autoBlurEnabled) { return; }

        const editor = vscode.window.activeTextEditor;
        if (editor && editor.document === event.document) {
          if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
          }
          this.debounceTimer = setTimeout(() => {
            this.scanAndApply(editor);
          }, 500);
        }
      })
    );

    // Clean up ranges when document closes
    this.disposables.push(
      vscode.workspace.onDidCloseTextDocument((doc) => {
        const uri = doc.uri.toString();
        this.blurredRanges.delete(uri);
        this.manualRanges.delete(uri);
      })
    );

    // Re-scan on config change
    this.disposables.push(
      config.onConfigChange(() => {
        if (this.autoBlurEnabled) {
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            this.scanAndApply(editor);
          }
        } else {
          // Style may have changed — reapply existing decorations
          const editor = vscode.window.activeTextEditor;
          if (editor) {
            this.applyDecorations(editor);
          }
        }
      })
    );
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
