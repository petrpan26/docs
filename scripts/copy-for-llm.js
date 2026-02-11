(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // "Copy for LLM" button — extracts the current doc page as clean markdown-ish
  // text and copies it to the clipboard so users can paste it into ChatGPT /
  // Claude / etc.
  // ---------------------------------------------------------------------------

  var BUTTON_ID = "copy-for-llm-btn";

  // Mintlify re-renders content on client-side navigation, so we use a
  // MutationObserver to re-inject the button whenever the page changes.

  function extractPageText() {
    // Mintlify renders the main article inside <article> or the element with
    // id "content-area".  Fall back to the first <main> tag.
    var root =
      document.querySelector("article") ||
      document.getElementById("content-area") ||
      document.querySelector("main");

    if (!root) return "";

    // Clone so we can mutate without affecting the real DOM
    var clone = root.cloneNode(true);

    // ---- Reveal hidden tab panels (CodeGroup) BEFORE cleanup ----
    // Mintlify's <CodeGroup> renders all language tabs in the DOM but hides
    // inactive ones with aria-hidden="true" and/or the hidden attribute.
    // We want ALL code variants (cURL, Python, JS) in the LLM output, so
    // reveal them before the general aria-hidden purge below.

    // 1. Standard role="tabpanel" panels
    clone.querySelectorAll('[role="tabpanel"]').forEach(function (panel) {
      panel.removeAttribute("aria-hidden");
      panel.removeAttribute("hidden");
      panel.style.removeProperty("display");
    });

    // 2. Any other hidden element that contains a code block
    clone.querySelectorAll('[aria-hidden="true"]').forEach(function (el) {
      if (el.querySelector("pre") || el.tagName.toLowerCase() === "pre") {
        el.removeAttribute("aria-hidden");
        el.removeAttribute("hidden");
        el.style.removeProperty("display");
      }
    });

    // Remove elements that are not useful for LLM context
    var selectors = [
      "nav",
      "header",
      "footer",
      "[aria-hidden='true']",          // safe now — code panels already revealed
      ".copy-for-llm-btn-wrapper",
      "button",                       // copy-code buttons, tab buttons, etc.
      "svg",                          // icons
      ".sr-only",
      "[data-testid='table-of-contents']",
    ];
    selectors.forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (el) {
        el.remove();
      });
    });

    // --- Build a clean text representation ---
    var lines = [];

    // Page title from <h1> or the frontmatter title shown by Mintlify
    var titleEl =
      document.querySelector("article h1") ||
      document.querySelector("main h1") ||
      document.querySelector("h1");
    if (titleEl) {
      lines.push("# " + titleEl.textContent.trim());
      lines.push("");
    }

    // Walk the cloned tree and convert to text
    function walk(node, depth) {
      if (node.nodeType === Node.TEXT_NODE) {
        var txt = node.textContent;
        if (txt.trim()) lines.push(txt);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      var tag = node.tagName.toLowerCase();

      // Headings
      if (/^h[2-6]$/.test(tag)) {
        var level = parseInt(tag[1], 10);
        lines.push("");
        lines.push("#".repeat(level) + " " + node.textContent.trim());
        lines.push("");
        return; // don't recurse into heading children
      }

      // Code blocks — preserve as fenced blocks
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

      // Inline code
      if (tag === "code" && node.parentElement && node.parentElement.tagName.toLowerCase() !== "pre") {
        lines.push("`" + node.textContent.trim() + "`");
        return;
      }

      // Paragraphs
      if (tag === "p") {
        lines.push("");
        for (var i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i], depth);
        }
        lines.push("");
        return;
      }

      // List items
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

      // Tables
      if (tag === "table") {
        var rows = node.querySelectorAll("tr");
        rows.forEach(function (row, ri) {
          var cells = row.querySelectorAll("th, td");
          var vals = Array.from(cells).map(function (c) {
            return c.textContent.trim();
          });
          lines.push("| " + vals.join(" | ") + " |");
          if (ri === 0) {
            lines.push("| " + vals.map(function () { return "---"; }).join(" | ") + " |");
          }
        });
        lines.push("");
        return;
      }

      // Blockquotes / callouts
      if (tag === "blockquote") {
        lines.push("");
        var bqText = node.textContent.trim().split("\n").map(function (l) {
          return "> " + l;
        }).join("\n");
        lines.push(bqText);
        lines.push("");
        return;
      }

      // Strong / bold
      if (tag === "strong" || tag === "b") {
        lines.push("**" + node.textContent.trim() + "**");
        return;
      }

      // Links
      if (tag === "a") {
        var href = node.getAttribute("href") || "";
        lines.push("[" + node.textContent.trim() + "](" + href + ")");
        return;
      }

      // Generic: recurse into children
      for (var j = 0; j < node.childNodes.length; j++) {
        walk(node.childNodes[j], depth + 1);
      }
    }

    // Skip the h1 we already captured
    var children = clone.children;
    for (var k = 0; k < children.length; k++) {
      var child = children[k];
      if (child.tagName && child.tagName.toLowerCase() === "h1") continue;
      walk(child, 0);
    }

    // Clean up excessive blank lines
    var text = lines
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    // Prepend page URL for reference
    text = "Source: " + window.location.href + "\n\n" + text;

    return text;
  }

  function createButton() {
    if (document.getElementById(BUTTON_ID)) return;

    var wrapper = document.createElement("div");
    wrapper.className = "copy-for-llm-btn-wrapper";
    wrapper.style.cssText =
      "position:fixed;bottom:24px;right:24px;z-index:9999;";

    var btn = document.createElement("button");
    btn.id = BUTTON_ID;
    btn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right:6px;vertical-align:middle"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>' +
      '<span style="vertical-align:middle">Copy for LLM</span>';
    btn.style.cssText = [
      "display:inline-flex",
      "align-items:center",
      "padding:10px 16px",
      "border:1px solid rgba(200,255,0,0.4)",
      "border-radius:8px",
      "background:rgba(14,14,16,0.85)",
      "color:#c8ff00",
      "font-size:13px",
      "font-weight:500",
      "font-family:inherit",
      "cursor:pointer",
      "backdrop-filter:blur(12px)",
      "-webkit-backdrop-filter:blur(12px)",
      "box-shadow:0 2px 12px rgba(0,0,0,0.3)",
      "transition:all 0.2s ease",
    ].join(";");

    btn.addEventListener("mouseenter", function () {
      btn.style.borderColor = "rgba(200,255,0,0.8)";
      btn.style.boxShadow = "0 2px 20px rgba(200,255,0,0.15)";
    });
    btn.addEventListener("mouseleave", function () {
      btn.style.borderColor = "rgba(200,255,0,0.4)";
      btn.style.boxShadow = "0 2px 12px rgba(0,0,0,0.3)";
    });

    btn.addEventListener("click", function () {
      var text = extractPageText();
      if (!text) {
        btn.querySelector("span").textContent = "Nothing to copy";
        setTimeout(function () {
          btn.querySelector("span").textContent = "Copy for LLM";
        }, 2000);
        return;
      }

      navigator.clipboard.writeText(text).then(function () {
        btn.querySelector("span").textContent = "Copied!";
        btn.style.borderColor = "#c8ff00";
        setTimeout(function () {
          btn.querySelector("span").textContent = "Copy for LLM";
          btn.style.borderColor = "rgba(200,255,0,0.4)";
        }, 2000);
      }).catch(function () {
        // Fallback for older browsers
        var ta = document.createElement("textarea");
        ta.value = text;
        ta.style.cssText = "position:fixed;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);

        btn.querySelector("span").textContent = "Copied!";
        setTimeout(function () {
          btn.querySelector("span").textContent = "Copy for LLM";
        }, 2000);
      });
    });

    wrapper.appendChild(btn);
    document.body.appendChild(wrapper);
  }

  // Inject on initial load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createButton);
  } else {
    createButton();
  }

  // Re-inject after Mintlify client-side navigations (SPA)
  var observer = new MutationObserver(function () {
    createButton();
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
