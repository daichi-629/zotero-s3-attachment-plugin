interface SettingHandler {
  initializePrefsUI(): void;
  updatePrefsUI(): void;
  saveSettings(): void;
  clearSettings(): void;
  bindPrefEvents(): void;
}

export { SettingHandler };
