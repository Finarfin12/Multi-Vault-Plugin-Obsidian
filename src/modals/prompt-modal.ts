import { App, Modal, Setting } from 'obsidian';

export class PromptModal extends Modal {
  private result: string;
  private onSubmit: (result: string) => void;
  private message: string;
  private defaultText: string;

  constructor(app: App, message: string, defaultText: string, onSubmit: (result: string) => void) {
    super(app);
    this.message = message;
    this.defaultText = defaultText;
    this.result = defaultText;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.message });

    new Setting(contentEl)
      .addText(text => {
        text.setValue(this.defaultText);
        text.onChange(value => {
          this.result = value;
        });
        text.inputEl.addEventListener('keydown', (e) => {
           if (e.key === 'Enter') {
             this.close();
             this.onSubmit(this.result);
           }
        });
        // Auto focus
        window.setTimeout(() => text.inputEl.focus(), 50);
      });

    new Setting(contentEl)
      .addButton(btn => btn
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          this.close();
          this.onSubmit(this.result);
        }));
  }

  onClose() {
    this.contentEl.empty();
  }
}
