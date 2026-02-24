/**
 * ContextBlur - Decoration Type Factory
 * Creates VS Code TextEditorDecorationType instances for each blur style.
 */

import * as vscode from 'vscode';

export type BlurStyle = 'blackout' | 'highlight' | 'fade';

/**
 * Style definitions for each blur mode.
 */
const STYLE_OPTIONS: Record<BlurStyle, vscode.DecorationRenderOptions> = {
  blackout: {
    backgroundColor: '#1a1a2e',
    color: '#1a1a2e',
    borderRadius: '3px',
    overviewRulerColor: '#8b5cf6',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  },
  highlight: {
    backgroundColor: 'rgba(139, 92, 246, 0.35)',
    color: 'transparent',
    borderRadius: '3px',
    overviewRulerColor: '#8b5cf6',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  },
  fade: {
    opacity: '0.08',
    overviewRulerColor: '#8b5cf6',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
  },
};

let currentDecorationType: vscode.TextEditorDecorationType | null = null;
let currentStyle: BlurStyle | null = null;

/**
 * Get or create a decoration type for the given style.
 * Disposes the previous one if the style changed.
 */
export function getDecorationType(style: BlurStyle): vscode.TextEditorDecorationType {
  if (currentDecorationType && currentStyle === style) {
    return currentDecorationType;
  }

  // Dispose old decoration type
  if (currentDecorationType) {
    currentDecorationType.dispose();
  }

  currentStyle = style;
  currentDecorationType = vscode.window.createTextEditorDecorationType(STYLE_OPTIONS[style]);
  return currentDecorationType;
}

/**
 * Dispose the current decoration type (cleanup on deactivate).
 */
export function disposeDecorationType(): void {
  if (currentDecorationType) {
    currentDecorationType.dispose();
    currentDecorationType = null;
    currentStyle = null;
  }
}
