// Keeps the single fixed AHA header from overlapping the page content.
(function () {
  "use strict";

  function syncFixedHeaderHeight() {
    const header = document.querySelector(".aha-fixed-header");
    const main = document.querySelector(".aha-main");
    if (!header || !main) return;

    const height = Math.ceil(header.getBoundingClientRect().height);
    const next = `${height}px`;
    document.documentElement.style.setProperty("--aha-fixed-header-height", next);
    main.style.paddingTop = `calc(${next} + 10px)`;
  }

  function init() {
    syncFixedHeaderHeight();
    window.addEventListener("resize", syncFixedHeaderHeight);
    window.addEventListener("orientationchange", syncFixedHeaderHeight);

    if ("ResizeObserver" in window) {
      const header = document.querySelector(".aha-fixed-header");
      if (header) new ResizeObserver(syncFixedHeaderHeight).observe(header);
    }

    window.setTimeout(syncFixedHeaderHeight, 0);
    window.setTimeout(syncFixedHeaderHeight, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
