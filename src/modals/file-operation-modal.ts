import { App, Modal, Setting, Notice } from 'obsidian';
import * as fs from 'fs';
import * as path from 'path';
import { VaultRegistry } from '../vault-registry';
import { Indexer } from '../indexer/indexer';

export class FileOperationModal extends Modal {
  private vaultRegistry: VaultRegistry;
  private indexer: Indexer;
  
  private targetVaultId: string = "";
  private operation: 'move' | 'copy' = 'move';

  constructor(app: App, vaultRegistry: VaultRegistry, indexer: Indexer) {
    super(app);
    this.vaultRegistry = vaultRegistry;
    this.indexer = indexer;
  }

  onOpen() {
    const { contentEl } = this;
    const activeFile = this.app.workspace.getActiveFile();

    if (!activeFile) {
      contentEl.createEl("h2", { text: "No active file" });
      contentEl.createEl("p", { text: "Please open a file first before moving or copying." });
      return;
    }

    contentEl.createEl("h2", { text: "Move / Copy File to Another Vault" });
    contentEl.createEl("p", { text: `File: ${activeFile.path}` });

    const vaults = this.vaultRegistry.getVaults();
    const currentVaultId = this.vaultRegistry.getCurrentVaultId();
    const otherVaults = vaults.filter(v => v.id !== currentVaultId);

    if (otherVaults.length === 0) {
      contentEl.createEl("p", { text: "No other vaults configured. Please add vaults in settings." });
      return;
    }

    // Inbox Router Logic: Recommend target vault based on tags
    this.targetVaultId = otherVaults[0].id;
    let recommendedVaultId = "";
    
    const fileCache = this.app.metadataCache.getFileCache(activeFile);
    const fileTags: string[] = [];
    if (fileCache?.tags) fileTags.push(...fileCache.tags.map(t => t.tag.replace('#', '').toLowerCase()));
    if (fileCache?.frontmatter?.tags) {
       const fmTags: unknown = fileCache.frontmatter.tags;
       if (Array.isArray(fmTags)) fileTags.push(...fmTags.map(t => typeof t === 'string' ? t.toLowerCase() : String(t)));
       else if (typeof fmTags === 'string') fileTags.push(...fmTags.split(',').map(t => t.trim().toLowerCase()));
    }

    if (fileTags.length > 0) {
       const vaultScores = new Map<string, number>();
       const allFiles = this.indexer.getIndexedFiles();
       
       for (const f of allFiles) {
          if (f.vaultId === currentVaultId) continue;
          if (!f.tags) continue;
          
          let score = 0;
          f.tags.forEach(t => {
             if (fileTags.includes(t.toLowerCase())) score++;
          });
          
          if (score > 0) {
             vaultScores.set(f.vaultId, (vaultScores.get(f.vaultId) || 0) + score);
          }
       }
       
       let bestVault = "";
       let maxScore = 0;
       for (const [vId, score] of vaultScores.entries()) {
          if (score > maxScore) {
             maxScore = score;
             bestVault = vId;
          }
       }
       
       if (bestVault) {
          recommendedVaultId = bestVault;
          this.targetVaultId = bestVault;
       }
    }

    new Setting(contentEl)
      .setName("Target Vault")
      .addDropdown(drop => {
        otherVaults.forEach(v => {
           const label = v.id === recommendedVaultId ? `✨ ${v.name} (Recommended)` : v.name;
           drop.addOption(v.id, label);
        });
        drop.setValue(this.targetVaultId);
        drop.onChange(value => {
          this.targetVaultId = value;
        });
      });

    new Setting(contentEl)
      .setName("Operation")
      .addDropdown(drop => drop
        .addOption('move', 'Move File')
        .addOption('copy', 'Copy File')
        .setValue('move')
        .onChange(value => {
          this.operation = value as 'move' | 'copy';
        })
      );

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Execute")
        .setCta()
        .onClick(async () => {
          const targetVault = this.vaultRegistry.getVaults().find(v => v.id === this.targetVaultId);
          if (!targetVault) return;

          const adapter = this.app.vault.adapter;
          let sourcePath = '';
          interface FileSystemAdapterWithBasePath { getBasePath(): string; }
          if ('getBasePath' in adapter && typeof (adapter as unknown as FileSystemAdapterWithBasePath).getBasePath === 'function') {
             sourcePath = path.join((adapter as unknown as FileSystemAdapterWithBasePath).getBasePath(), activeFile.path);
          } else {
             new Notice("Error: Adapter doesn't support getBasePath().");
             return;
          }
          const targetPath = path.join(targetVault.path, activeFile.name);

          try {
            if (fs.existsSync(targetPath)) {
               new Notice(`File ${activeFile.name} already exists in target vault!`);
               return;
            }

            if (this.operation === 'copy') {
               fs.copyFileSync(sourcePath, targetPath);
               new Notice(`Copied to ${targetVault.name}`);
            } else {
               fs.copyFileSync(sourcePath, targetPath); // safe move
               await this.app.fileManager.trashFile(activeFile);
               new Notice(`Moved to ${targetVault.name}`);
            }
            
            // Trigger background re-index so search is updated
            void this.indexer.buildFullIndex(true);
            
            this.close();
          } catch (_e: unknown) {
            const msg = _e instanceof Error ? _e.message : String(_e);
            new Notice(`Failed to ${this.operation} file: ${msg}`);
          }
        })
      );
  }

  onClose() {
    this.contentEl.empty();
  }
}
