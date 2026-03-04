/**
 * ContextBlur - Configuration Wrapper
 * Reads and watches contextblur.* settings from workspace configuration.
 */

import * as vscode from 'vscode';
import { BlurStyle } from './blurDecorations';

const SECTION = 'contextblur';

/**
 * Get the current blur style setting.
 */
export function getStyle(): BlurStyle {
  const config = vscode.workspace.getConfiguration(SECTION);
  const style = config.get<string>('style', 'blackout');
  if (style === 'highlight' || style === 'fade') {
    return style;
  }
  return 'blackout';
}

/**
 * Check if the extension is enabled.
 */
export function isEnabled(): boolean {
  const config = vscode.workspace.getConfiguration(SECTION);
  return config.get<boolean>('enabled', true);
}

/**
 * Get a map of pattern keys to their enabled/disabled state.
 */
export function getEnabledPatterns(): Record<string, boolean> {
  const config = vscode.workspace.getConfiguration(SECTION);
  const patterns = config.get<Record<string, boolean>>('patterns', {});

  // Default all patterns to true if not explicitly set
  const defaults: Record<string, boolean> = {
    email: true,
    phone: true,
    ssn: true,
    creditCard: true,
    personnummer: true,
    apiKey: true,
    awsKey: true,
    jwt: true,
    connectionString: true,
    privateKey: true,
    envValue: true,
  };

  return { ...defaults, ...patterns };
}

/**
 * Get glob patterns for files to exclude from auto-blur.
 */
export function getExcludeGlobs(): string[] {
  const config = vscode.workspace.getConfiguration(SECTION);
  return config.get<string[]>('excludeFiles', ['*.min.js', '*.lock', '*.map']);
}

/**
 * Show proactive nudges when sensitive patterns are detected and auto-blur is off.
 */
export function isRiskNudgeEnabled(): boolean {
  const config = vscode.workspace.getConfiguration(SECTION);
  return config.get<boolean>('nudgeOnRisk', true);
}

/**
 * Register a listener for configuration changes.
 * Returns a disposable to unsubscribe.
 */
export function onConfigChange(
  callback: (e: vscode.ConfigurationChangeEvent) => void
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration(SECTION)) {
      callback(e);
    }
  });
}
