import { ProjectWorkspace, ScanResult } from '@/types/bundler';
import { FrameworkAdapter } from './types';
import { VanillaAdapter } from './vanilla-adapter';
import { NodeAdapter } from './node-adapter';
import { NextJsAdapter } from './nextjs-adapter';

export class FrameworkAdapterRegistry {
  private static adapters: FrameworkAdapter[] = [
    new NextJsAdapter(),
    new NodeAdapter(),
    new VanillaAdapter(),
  ];

  public static async selectAdapter(
    workspace: ProjectWorkspace,
    scan: ScanResult
  ): Promise<FrameworkAdapter> {
    for (const adapter of this.adapters) {
      const detection = await adapter.detect(workspace, scan);
      if (detection.confidence >= 0.7) {
        return adapter;
      }
    }
    // Default to VanillaAdapter if no specialized framework detected
    return new VanillaAdapter();
  }
}
