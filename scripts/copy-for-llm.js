(function () {
  "use strict";

  var BUTTON_ID = "copy-for-llm-btn";
  var debounceTimer = null;

  function extractPageText() {
    var root =
      document.querySelector("article") ||
      document.getElementById("content-area") ||
      document.querySelector("main");

    if (!root) return "";

    var clone = root.cloneNode(true);

    clone.querySelectorAll('[role="tabpanel"]').forEach(function (panel) {
      panel.removeAttribute("aria-hidden");
      panel.removeAttribute("hidden");
      panel.style.removeProperty("display");
    });

    clone.querySelectorAll('[aria-hidden="true"]').forEach(function (el) {
      if (el.querySelector("pre") || el.tagName.toLowerCase() === "pre") {
        el.removeAttribute("aria-hidden");
        el.removeAttribute("hidden");
        el.style.removeProperty("display");
      }
    });

    var selectors = [
      "nav",
      "header",
      "footer",
      "[aria-hidden='true']",
      ".copy-for-llm-btn-wrapper",
      "button",
      "svg",
      ".sr-only",
      "[data-testid='table-of-contents']",
    ];
    selectors.forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (el) {
        el.remove();
      });
    });

    var lines = [];

    var titleEl =
      document.querySelector("article h1") ||
      document.querySelector("main h1") ||
      document.querySelector("h1");
    if (titleEl) {
      lines.push("# " + titleEl.textContent.trim());
      lines.push("");
    }

    function walk(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        var txt = node.textContent;
        if (txt.trim()) lines.push(txt);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      var tag = node.tagName.toLowerCase();

      if (/^h[2-6]$/.test(tag)) {
        var level = parseInt(tag[1], 10);
        lines.push("");
        lines.push("#".repeat(level) + " " + node.textContent.trim());
        lines.push("");
        return;
      }

      if (tag === "pre") {
        var codeEl = node.querySelector("code");
        var lang = "";
        if (codeEl) {
          var cls = codeEl.className || "";
          var m = cls.match(/language-(\w+)/);
          if (m) lang = m[1];
        }
        var code = (codeEl || node).textContent.trim();
        lines.push("");
        lines.push("```" + lang);
        lines.push(code);
        lines.push("```");
        lines.push("");
        return;
      }

      if (
        tag === "code" &&
        node.parentElement &&
        node.parentElement.tagName.toLowerCase() !== "pre"
      ) {
        lines.push("`" + node.textContent.trim() + "`");
        return;
      }

      if (tag === "p") {
        lines.push("");
        for (var i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
        }
        lines.push("");
        return;
      }

      if (tag === "li") {
        var bullet = "- ";
        var parent = node.parentElement;
        if (parent && parent.tagName.toLowerCase() === "ol") {
          var idx = Array.from(parent.children).indexOf(node) + 1;
          bullet = idx + ". ";
        }
        lines.push(bullet + node.textContent.trim());
        return;
      }

      if (tag === "table") {
        var rows = node.querySelectorAll("tr");
        rows.forEach(function (row, ri) {
          var cells = row.querySelectorAll("th, td");
          var vals = Array.from(cells).map(function (c) {
            return c.textContent.trim();
          });
          lines.push("| " + vals.join(" | ") + " |");
          if (ri === 0) {
            lines.push(
              "| " +
                vals
                  .map(function () {
                    return "---";
                  })
                  .join(" | ") +
                " |"
            );
          }
        });
        lines.push("");
        return;
      }

      if (tag === "blockquote") {
        lines.push("");
        var bqText = node.textContent
          .trim()
          .split("\n")
          .map(function (l) {
            return "> " + l;
          })
          .join("\n");
        lines.push(bqText);
        lines.push("");
        return;
      }

      if (tag === "strong" || tag === "b") {
        lines.push("**" + node.textContent.trim() + "**");
        return;
      }

      if (tag === "a") {
        var href = node.getAttribute("href") || "";
        lines.push("[" + node.textContent.trim() + "](" + href + ")");
        return;
      }

      for (var j = 0; j < node.childNodes.length; j++) {
        walk(node.childNodes[j]);
      }
    }

    var children = clone.children;
    for (var k = 0; k < children.length; k++) {
      var child = children[k];
      if (child.tagName && child.tagName.toLowerCase() === "h1") continue;
      walk(child);
    }

    var text = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    text = "Source: " + window.location.href + "\n\n" + text;
    return text;
  }

  var ICON_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ' +
    'style="margin-right:6px;flex-shrink:0">' +
    '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>' +
    '<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
    "</svg>";

  function handleCopy(btn) {
    var text = extractPageText();
    var span = btn.querySelector("span");

    if (!text) {
      span.textContent = "Nothing to copy";
      setTimeout(function () {
        span.textContent = "Copy page for agent";
      }, 2000);
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      span.textContent = "Copy not supported";
      setTimeout(function () {
        span.textContent = "Copy page for agent";
      }, 2000);
      return;
    }

    navigator.clipboard
      .writeText(text)
      .then(function () {
        span.textContent = "Copied!";
        setTimeout(function () {
          span.textContent = "Copy page for agent";
        }, 2000);
      })
      .catch(function () {
        span.textContent = "Copy failed";
        setTimeout(function () {
          span.textContent = "Copy page for agent";
        }, 2000);
      });
  }

  var COLOR_DARK = "#00FF41";
  var COLOR_LIGHT = "#006B24";
  var RGBA_DARK = "0,255,65";
  var RGBA_LIGHT = "0,107,36";
  var EASING = "cubic-bezier(0.16,1,0.3,1)";

  function isDarkMode() {
    return (
      document.documentElement.classList.contains("dark") ||
      document.documentElement.getAttribute("data-theme") === "dark"
    );
  }

  function accentColor() {
    return isDarkMode() ? COLOR_DARK : COLOR_LIGHT;
  }

  function accentRgba() {
    return isDarkMode() ? RGBA_DARK : RGBA_LIGHT;
  }

  function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  function transitionValue() {
    if (prefersReducedMotion()) return "none";
    return (
      "background 0.15s " + EASING + "," +
      "color 0.15s " + EASING + "," +
      "border-color 0.15s " + EASING
    );
  }

  function applyBtnStyles(btn) {
    var c = accentColor();
    var rgba = accentRgba();
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "padding:8px 14px",
      "border:1px solid " + c,
      "border-radius:2px",
      "background:rgba(" + rgba + ",0.08)",
      "color:" + c,
      "font-size:0.72rem",
      "font-weight:600",
      "font-family:inherit",
      "cursor:pointer",
      "transition:" + transitionValue(),
      "width:fit-content",
      "box-sizing:border-box",
      "letter-spacing:0.02em",
    ].join(";");
  }

  function makeBtnEl(id) {
    var btn = document.createElement("button");
    btn.id = id;
    btn.type = "button";
    btn.innerHTML =
      ICON_SVG + '<span aria-live="polite">Copy page for agent</span>';
    applyBtnStyles(btn);

    btn.addEventListener("mouseenter", function () {
      btn.style.background = accentColor();
      btn.style.color = "#000";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.background = "rgba(" + accentRgba() + ",0.08)";
      btn.style.color = accentColor();
    });
    btn.addEventListener("click", function () {
      handleCopy(btn);
    });

    return btn;
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    var contentArea = document.getElementById("content-area");
    if (!contentArea) return;

    var wrapper = document.createElement("div");
    wrapper.className = "copy-for-llm-btn-wrapper";
    wrapper.appendChild(makeBtnEl(BUTTON_ID));
    contentArea.insertBefore(wrapper, contentArea.firstChild);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButton);
  } else {
    createButton();
  }

  function debouncedCreate() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(createButton, 200);
  }

  new MutationObserver(debouncedCreate).observe(document.body, {
    childList: true,
    subtree: true,
  });

  function refreshBtnColors() {
    var btn = document.getElementById(BUTTON_ID);
    if (btn) applyBtnStyles(btn);
  }

  new MutationObserver(refreshBtnColors).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "data-theme"],
  });

  function fixTryItIcons() {
    document.querySelectorAll(".tryit-button").forEach(function (btn) {
      var computed = getComputedStyle(btn);
      var btnColor = computed.color;
      btn.querySelectorAll('[data-component-part="icon-svg"], svg[style*="mask-image"]').forEach(function (icon) {
        icon.style.setProperty("background-color", btnColor, "important");
      });
    });
  }

  new MutationObserver(function () {
    setTimeout(fixTryItIcons, 100);
  }).observe(document.body, { childList: true, subtree: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      setTimeout(fixTryItIcons, 500);
    });
  } else {
    setTimeout(fixTryItIcons, 500);
  }
})();
