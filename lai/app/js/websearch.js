(function () {
  const chkWebSearch = document.getElementById("chk-web-search");

  function isEnabled() {
    return chkWebSearch && chkWebSearch.checked && !chkWebSearch.disabled;
  }

  function bindToggle(onChange) {
    if (!chkWebSearch || typeof onChange !== "function") return;
    chkWebSearch.addEventListener("change", () => onChange(isEnabled()));
  }

  window.webSearchUI = {
    isEnabled,
    bindToggle,
  };
})();
