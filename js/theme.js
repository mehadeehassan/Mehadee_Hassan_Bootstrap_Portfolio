(function () {
  const storageKey = "portfolio-theme";
  const savedTheme = localStorage.getItem(storageKey);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = savedTheme || (prefersDark ? "dark" : "light");

  function updateToggle(button) {
    const isDark = document.documentElement.dataset.theme === "dark";
    button.innerHTML = `<i class="fas ${isDark ? "fa-sun" : "fa-moon"}" aria-hidden="true"></i>`;
    button.setAttribute("aria-label", isDark ? "Switch to light mode" : "Switch to dark mode");
    button.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
  }

  function initializeToggle() {
    const button = document.querySelector(".theme-toggle");
    if (!button) return;
    updateToggle(button);
    button.addEventListener("click", function () {
      const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = nextTheme;
      localStorage.setItem(storageKey, nextTheme);
      updateToggle(button);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeToggle);
  } else {
    initializeToggle();
  }
})();
