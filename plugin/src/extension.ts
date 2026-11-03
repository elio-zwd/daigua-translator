import * as vscode from 'vscode';
import { ITranslateRegistry, KnowledgePack } from './types';
import { DaiguaTranslate } from './daigua-translate';
import { KnowledgeLoader } from './knowledge-loader';

/** 全局持有的知识包缓存与翻译实例 */
let loadedPacks: KnowledgePack[] = [];
let translateInstance: DaiguaTranslate | null = null;

/**
 * 重新读取配置并加载知识包
 */
async function reloadPacks(): Promise<void> {
  const config = vscode.workspace.getConfiguration('daiguaTranslate');
  const packPaths = config.get<string[]>('packPaths', []);
  const loader = new KnowledgeLoader();

  console.log('[呆瓜翻译器] 开始加载配置中的知识包...', packPaths);
  loadedPacks = await loader.loadFromPaths(packPaths);

  if (translateInstance) {
    translateInstance.setPacks(loadedPacks);
  }
}

/**
 * 扩展激活入口
 */
export async function activate(context: vscode.ExtensionContext) {
  console.log('[呆瓜翻译器] 插件激活中...');

  // 初始化翻译单例与知识包
  translateInstance = new DaiguaTranslate(loadedPacks);
  await reloadPacks();

  // 注册重新加载知识包命令
  context.subscriptions.push(
    vscode.commands.registerCommand('daiguaTranslate.reloadPacks', async () => {
      await reloadPacks();
      const count = loadedPacks.reduce((acc, p) => acc + (p.entries?.length || 0), 0);
      vscode.window.showInformationMessage(`呆瓜翻译器：知识包重新加载完成，共载入 ${count} 条词条。`);
    })
  );

  // 监听配置变更自动重新加载
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration('daiguaTranslate.packPaths')) {
        await reloadPacks();
      }
    })
  );

  // 向 MTranCode 暴露注册接口
  return {
    extendTranslate: function (registry: ITranslateRegistry) {
      console.log('[呆瓜翻译器] 注册到 MTranCode 翻译管理器...');
      registry(
        'daigua',
        class extends DaiguaTranslate {
          constructor() {
            super(loadedPacks);
          }
        }
      );
    },
  };
}

/**
 * 扩展释放入口
 */
export function deactivate() {
  loadedPacks = [];
  translateInstance = null;
}
