(() => {
  const root = document.documentElement;

  let storedTheme = null;
  try {
    const value = window.localStorage.getItem("theme");
    if (value === "dark" || value === "light") {
      storedTheme = value;
    }
  } catch {
    // Ignore localStorage failures.
  }

  if (storedTheme) {
    root.setAttribute("data-theme", storedTheme);
    return;
  }

  const prefersDark = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-color-scheme: dark)").matches;
  root.setAttribute("data-theme", prefersDark ? "dark" : "light");
})();
