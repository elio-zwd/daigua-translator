import * as vscode from 'vscode';
import { ITranslateRegistry, KnowledgePack } from './types';
import { DaiguaTranslate } from './daigua-translate';
import { KnowledgeLoader } from './knowledge-loader';

/**
 * MTranCode creates its own translator instance after extendTranslate().
 * The shared variable is read on every request, so existing instances see
 * a new knowledge-pack snapshot after reload.
 */
let loadedPacks: KnowledgePack[] = [];
let reloadRequestId = 0;

async function reloadPacks(): Promise<number | null> {
  const requestId = ++reloadRequestId;
  const config = vscode.workspace.getConfiguration('daiguaTranslate');
  const paths = config.get<string[]>('packPaths', []);
  const loader = new KnowledgeLoader();
  const nextPacks = await loader.loadFromPaths(paths);

  // A slow, older reload must never overwrite a more recent configuration.
  if (requestId !== reloadRequestId) {
    return null;
  }
  loadedPacks = nextPacks;
  return loadedPacks.reduce((sum, pack) => sum + pack.entries.length, 0);
}

export async function activate(context: vscode.ExtensionContext) {
  await reloadPacks();

  context.subscriptions.push(
    vscode.commands.registerCommand('daiguaTranslate.reloadPacks', async () => {
      const count = await reloadPacks();
      if (count !== null) {
        vscode.window.showInformationMessage(
          '呆瓜翻译器：已重新加载 ' + count + ' 条词条。'
        );
      }
    }),
    vscode.workspace.onDidChangeConfiguration(async (event) => {
      if (event.affectsConfiguration('daiguaTranslate.packPaths')) {
        await reloadPacks();
      }
    })
  );

  return {
    extendTranslate: (registry: ITranslateRegistry) => {
      registry('daigua', class extends DaiguaTranslate {
        constructor() {
          // Do not pass a snapshot array: MTranCode keeps this instance alive.
          super(() => loadedPacks);
        }
      });
    }
  };
}

export function deactivate() {
  ++reloadRequestId;
  loadedPacks = [];
}
