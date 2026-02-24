/**
 * ContextBlur - Minimal Glob Matcher
 * Lightweight glob matching without external dependencies.
 * Supports *, **, and ? wildcards.
 */

/**
 * Test if a file path matches a simple glob pattern.
 * Supports:
 *   - `*` matches any characters except path separator
 *   - `**` matches any characters including path separator
 *   - `?` matches a single character
 *   - `.env.*` style patterns
 */
export function minimatch(filePath: string, pattern: string): boolean {
  // Normalize path separators
  const normalizedPath = filePath.replace(/\\/g, '/');
  const normalizedPattern = pattern.replace(/\\/g, '/');

  // If pattern has no path separator, match against basename only
  const matchTarget = normalizedPattern.includes('/')
    ? normalizedPath
    : normalizedPath.split('/').pop() || normalizedPath;

  const regexStr = globToRegex(normalizedPattern);
  const regex = new RegExp(`^${regexStr}$`, 'i');
  return regex.test(matchTarget);
}

function globToRegex(glob: string): string {
  let result = '';
  let i = 0;

  while (i < glob.length) {
    const c = glob[i];

    if (c === '*') {
      if (glob[i + 1] === '*') {
        // ** matches everything including /
        result += '.*';
        i += 2;
        // Skip optional trailing /
        if (glob[i] === '/') { i++; }
      } else {
        // * matches everything except /
        result += '[^/]*';
        i++;
      }
    } else if (c === '?') {
      result += '[^/]';
      i++;
    } else if (c === '.') {
      result += '\\.';
      i++;
    } else if (c === '(' || c === ')' || c === '{' || c === '}' ||
               c === '[' || c === ']' || c === '+' || c === '^' ||
               c === '$' || c === '|') {
      result += '\\' + c;
      i++;
    } else {
      result += c;
      i++;
    }
  }

  return result;
}
