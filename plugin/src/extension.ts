import * as vscode from 'vscode';
import { ITranslateRegistry, KnowledgePack } from './types';
import { DaiguaTranslate } from './daigua-translate';
import { KnowledgeLoader, PackLoadReport, resolvePackPaths } from './knowledge-loader';

let loadedByPath = new Map<string, KnowledgePack>();
let loadedPacks: KnowledgePack[] = [];
let reloadRequestId = 0;
let output: vscode.OutputChannel | undefined;

async function reloadPacks(notify = false): Promise<PackLoadReport | null> {
  const requestId = ++reloadRequestId;
  const paths = vscode.workspace.getConfiguration('daiguaTranslate').get<string[]>('packPaths', []);
  const active = new Set(resolvePackPaths(paths));
  // Removed paths stop being queryable immediately, including during slow I/O.
  loadedByPath = new Map([...loadedByPath].filter(([file]) => active.has(file)));
  loadedPacks = [...loadedByPath.values()];
  const report = await new KnowledgeLoader().loadWithReport(paths, loadedByPath);
  if (requestId !== reloadRequestId) return null;
  loadedByPath = report.byPath;
  loadedPacks = report.packs;
  const retained = report.failures.filter(f => f.retained).length;
  const count = loadedPacks.reduce((sum, pack) => sum + pack.entries.length, 0);
  const summary = `呆瓜翻译器：加载成功 ${report.loadedCount} 个包，保留旧包 ${retained} 个，当前有效 ${count} 条词条。`;
  output?.appendLine(summary);
  for (const failure of report.failures) {
    output?.appendLine(`[失败] ${failure.path}\n${failure.reason}\n${failure.retained ? '保留上一次有效内容' : '首次加载失败，已跳过'}`);
  }
  if (report.failures.length) {
    void vscode.window.showWarningMessage(`${summary} 失败路径：${report.failures.map(f => f.path).join('；')}。详情见“呆瓜翻译器”输出。`);
  } else if (notify) void vscode.window.showInformationMessage(summary);
  return report;
}

export async function activate(context: vscode.ExtensionContext) {
  output = vscode.window.createOutputChannel('呆瓜翻译器');
  context.subscriptions.push(output);
  context.subscriptions.push(
    vscode.commands.registerCommand('daiguaTranslate.reloadPacks', () => reloadPacks(true)),
    vscode.workspace.onDidChangeConfiguration(async event => {
      if (event.affectsConfiguration('daiguaTranslate.packPaths')) await reloadPacks();
    })
  );
  // Observe settings changes even while the first file read is still pending.
  await reloadPacks();
  return {
    extendTranslate: (registry: ITranslateRegistry) => {
      registry('daigua', class extends DaiguaTranslate {
        constructor() { super(() => loadedPacks); }
      });
    }
  };
}

export function deactivate() {
  ++reloadRequestId;
  loadedByPath.clear();
  loadedPacks = [];
  output = undefined;
}
