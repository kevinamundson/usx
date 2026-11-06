(function () {
  const vscode = acquireVsCodeApi();
  const sheet = document.getElementById("sheet");
  const banner = document.getElementById("banner");
  const refEl = document.getElementById("ref");
  const pageButton = document.getElementById("mode-page");
  const featuresButton = document.getElementById("mode-features");
  let currentRef = "";

  function cssEscape(value) {
    if (window.CSS && typeof CSS.escape === "function") return CSS.escape(value);
    return value.replace(/["\\]/g, "\\$&");
  }

  function setFeatures(on) {
    document.body.classList.toggle("features", on);
    pageButton.setAttribute("aria-pressed", on ? "false" : "true");
    featuresButton.setAttribute("aria-pressed", on ? "true" : "false");
  }

  function mark(ref) {
    document.querySelectorAll(".is-current").forEach((element) => element.classList.remove("is-current"));
    if (!ref) return;
    const selector = `[data-sid="${cssEscape(ref)}"], [data-vid="${cssEscape(ref)}"]`;
    document.querySelectorAll(selector).forEach((element) => element.classList.add("is-current"));
  }

  function reveal(ref) {
    if (!ref) return;
    const selector = `[data-sid="${cssEscape(ref)}"], [data-vid="${cssEscape(ref)}"]`;
    const target = document.querySelector(selector);
    if (target) target.scrollIntoView({ block: "center" });
  }

  window.addEventListener("message", (event) => {
    const message = event.data || {};
    if (message.type === "features") setFeatures(!!message.value);
    if (message.type === "render") {
      const y = document.documentElement.scrollTop;
      sheet.innerHTML = message.html || "";
      if (message.error) {
        banner.hidden = false;
        banner.textContent = message.error;
      } else {
        banner.hidden = true;
        banner.textContent = "";
      }
      if (!currentRef && message.title) refEl.textContent = message.title;
      mark(currentRef);
      document.documentElement.scrollTop = y;
    }
    if (message.type === "reveal") {
      if (message.label) refEl.textContent = message.label;
      if (message.ref === currentRef) return;
      currentRef = message.ref || "";
      mark(currentRef);
      reveal(currentRef);
    }
  });

  pageButton.addEventListener("click", () => {
    setFeatures(false);
    vscode.postMessage({ type: "features", value: false });
  });

  featuresButton.addEventListener("click", () => {
    setFeatures(true);
    vscode.postMessage({ type: "features", value: true });
  });

  sheet.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest("a")) return;
    const element = target.closest("[data-sid], [data-vid]");
    if (!element) return;
    const ref = element.getAttribute("data-sid") || element.getAttribute("data-vid");
    if (ref) vscode.postMessage({ type: "open", ref });
  });

  vscode.postMessage({ type: "ready" });
})();
