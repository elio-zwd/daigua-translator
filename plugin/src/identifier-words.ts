/** Keep in sync with phonetics/tool.py; shared fixtures exercise both implementations. */
export function splitIdentifier(symbol: string): string[] {
  return symbol.replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .match(/[A-Za-z]+|[0-9]+/g) || [];
}

export function isNamingPrefix(symbol: string, token: string, index: number): boolean {
  return index === 0 && symbol.startsWith(token) && /^[A-Z]/.test(symbol.slice(token.length));
}
