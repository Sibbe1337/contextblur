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

type RiskLevel = 'safe' | 'warning' | 'critical';

interface RiskReport {
  level: RiskLevel;
  totalMatches: number;
  highMatches: number;
  criticalMatches: number;
}

interface ScanResult {
  ranges: vscode.Range[];
  risk: RiskReport;
}

export class BlurManager {
  private blurredRanges = new Map<string, vscode.Range[]>();
  private manualRanges = new Map<string, vscode.Range[]>();
  private riskByUri = new Map<string, RiskReport>();
  private nudgedUris = new Set<string>();
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
   * Force-on mode before screen sharing: enable auto blur + scan + clear warning nudges.
   */
  goLiveMode(): void {
    this.autoBlurEnabled = true;
    this.statusBar.active = true;
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('ContextBlur: Go Live enabled. Open a file to scan.');
      return;
    }

    this.scanAndApply(editor);
    const uri = editor.document.uri.toString();
    const report = this.riskByUri.get(uri);
    const count = this.getCount(uri);
    const suffix =
      report?.level === 'critical'
        ? ' Critical patterns found and blurred.'
        : report?.level === 'warning'
          ? ' Sensitive patterns found and blurred.'
          : ' No sensitive patterns detected.';
    vscode.window.showInformationMessage(`ContextBlur: Go Live ready (${count} blurred).${suffix}`);
    this.nudgedUris.delete(uri);
  }

  /**
   * One-shot risk scan without changing blur mode.
   */
  runRiskScan(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showInformationMessage('ContextBlur: No active editor.');
      return;
    }

    const scan = this.analyzeDocument(editor.document);
    this.riskByUri.set(editor.document.uri.toString(), scan.risk);
    this.statusBar.risk = scan.risk.level;
    if (scan.risk.level === 'critical') {
      vscode.window.showWarningMessage(
        `ContextBlur: Critical risk (${scan.risk.criticalMatches} critical matches). Run Go Live Mode.`,
        'Go Live Mode'
      ).then((action) => {
        if (action === 'Go Live Mode') {
          this.goLiveMode();
        }
      });
      return;
    }

    const label = scan.risk.level === 'warning' ? 'Warning' : 'Safe';
    vscode.window.showInformationMessage(
      `ContextBlur: ${label} (${scan.risk.totalMatches} matches, ${scan.risk.highMatches} high-risk).`
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
    this.riskByUri.set(uri, {
      level: 'safe',
      totalMatches: 0,
      highMatches: 0,
      criticalMatches: 0,
    });
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
      this.riskByUri.set(uri, {
        level: 'safe',
        totalMatches: 0,
        highMatches: 0,
        criticalMatches: 0,
      });
      this.statusBar.risk = 'safe';
      return;
    }

    const scan = this.analyzeDocument(doc);
    this.blurredRanges.set(uri, scan.ranges);
    this.riskByUri.set(uri, scan.risk);
    this.applyDecorations(editor);
  }

  /**
   * Apply all decorations (auto + manual) to the editor.
   */
  private analyzeDocument(doc: vscode.TextDocument): ScanResult {
    const enabledMap = config.getEnabledPatterns();
    const patterns = getEnabledPatterns(enabledMap);
    const ranges: vscode.Range[] = [];

    let totalMatches = 0;
    let highMatches = 0;
    let criticalMatches = 0;

    for (let lineIdx = 0; lineIdx < doc.lineCount; lineIdx++) {
      const line = doc.lineAt(lineIdx);
      const text = line.text;

      for (const pattern of patterns) {
        if (pattern.fileFilter && !this.matchesFileFilter(doc, pattern.fileFilter)) {
          continue;
        }

        const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          totalMatches++;
          if (pattern.severity === 'critical') {
            criticalMatches++;
          } else if (pattern.severity === 'high') {
            highMatches++;
          }

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

          if (match[0].length === 0) {
            regex.lastIndex++;
          }
        }
      }
    }

    const level = this.computeRiskLevel(totalMatches, highMatches, criticalMatches);
    return {
      ranges,
      risk: { level, totalMatches, highMatches, criticalMatches },
    };
  }

  private computeRiskLevel(total: number, high: number, critical: number): RiskLevel {
    if (critical > 0 || high >= 3) {
      return 'critical';
    }
    if (high > 0 || total > 0) {
      return 'warning';
    }
    return 'safe';
  }

  private applyDecorations(editor: vscode.TextEditor): void {
    const uri = editor.document.uri.toString();
    const autoRanges = this.blurredRanges.get(uri) || [];
    const manualRangesForUri = this.manualRanges.get(uri) || [];
    const allRanges = [...autoRanges, ...manualRangesForUri];

    const style = config.getStyle();
    const decorationType = getDecorationType(style);
    editor.setDecorations(decorationType, allRanges);

    this.statusBar.count = allRanges.length;
    this.statusBar.risk = this.riskByUri.get(uri)?.level || 'safe';
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
            const scan = this.analyzeDocument(editor.document);
            this.riskByUri.set(editor.document.uri.toString(), scan.risk);
            this.applyDecorations(editor);
            this.maybeNudgeForRisk(editor, scan.risk);
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
            if (this.autoBlurEnabled) {
              this.scanAndApply(editor);
            } else {
              const scan = this.analyzeDocument(editor.document);
              this.riskByUri.set(editor.document.uri.toString(), scan.risk);
              this.applyDecorations(editor);
              this.maybeNudgeForRisk(editor, scan.risk);
            }
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
        this.riskByUri.delete(uri);
        this.nudgedUris.delete(uri);
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

  /**
   * Analyze currently active editor on startup.
   */
  primeActiveEditor(): void {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return;
    }
    const scan = this.analyzeDocument(editor.document);
    this.riskByUri.set(editor.document.uri.toString(), scan.risk);
    this.applyDecorations(editor);
    this.maybeNudgeForRisk(editor, scan.risk);
  }

  private maybeNudgeForRisk(editor: vscode.TextEditor, risk: RiskReport): void {
    if (!config.isRiskNudgeEnabled() || this.autoBlurEnabled) {
      return;
    }
    if (risk.level === 'safe') {
      return;
    }
    const uri = editor.document.uri.toString();
    if (this.nudgedUris.has(uri)) {
      return;
    }

    this.nudgedUris.add(uri);
    const severity = risk.level === 'critical' ? 'Critical' : 'Sensitive';
    vscode.window
      .showWarningMessage(
        `ContextBlur: ${severity} data detected in this file. Enable Go Live Mode before screen sharing?`,
        'Go Live Mode',
        'Run Risk Scan'
      )
      .then((action) => {
        if (action === 'Go Live Mode') {
          this.goLiveMode();
        } else if (action === 'Run Risk Scan') {
          this.runRiskScan();
        }
      });
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
