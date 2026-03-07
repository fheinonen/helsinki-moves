function registerThemeController(app, env = {}) {
  const runtimeGlobal = typeof globalThis === "undefined" ? {} : globalThis;
  const windowRef = env.windowRef || runtimeGlobal.window || {};
  const documentRef = env.documentRef || windowRef.document || {};
  const btn = documentRef.getElementById?.("themeToggle");
  if (!btn) return app;

  const { api } = app;
  const root = documentRef.documentElement;
  const darkSchemeQuery = windowRef.matchMedia?.("(prefers-color-scheme: dark)");

  function getStoredTheme() {
    const value = api.getStorageItem("theme");
    return value === "dark" || value === "light" ? value : null;
  }

  function applyEffectiveTheme(theme) {
    root?.setAttribute?.("data-theme", theme === "light" ? "light" : "dark");
  }

  function applyCurrentTheme() {
    const storedTheme = getStoredTheme();
    if (storedTheme) {
      applyEffectiveTheme(storedTheme);
      return;
    }
    applyEffectiveTheme(darkSchemeQuery?.matches ? "dark" : "light");
  }

  function handleSystemThemeChange(event) {
    if (getStoredTheme()) return;
    applyEffectiveTheme(event.matches ? "dark" : "light");
  }

  applyCurrentTheme();
  darkSchemeQuery?.addEventListener?.("change", handleSystemThemeChange);
  darkSchemeQuery?.addListener?.(handleSystemThemeChange);

  btn.addEventListener("click", () => {
    const nextTheme = root?.getAttribute?.("data-theme") === "dark" ? "light" : "dark";
    applyEffectiveTheme(nextTheme);
    api.setStorageItem("theme", nextTheme);
  });

  return app;
}

module.exports = {
  registerThemeController,
};
