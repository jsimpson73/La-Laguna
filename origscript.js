const ALLOWED_PARENTS = new Set([
  "https://super.myninja.ai",
]);

function getParentOrigin() {
  try {
    if (window.self === window.top) return null;
    const ref = document.referrer || "";
    if (!ref) return null;
    const origin = new URL(ref).origin;
    return ALLOWED_PARENTS.has(origin) ? origin : null;
  } catch {
    return null;
  }
}

function initDomainSpecificContent() {
  const hostname = window.location.hostname;
  const baseUrl = "https://sites.super.myninja.ai";
  const bannerName = "ninja-daytona-banner";
  const footerName = "ninja-badge";

  function createBanner() {
    if (!document.body) {
      setTimeout(createBanner, 100);
      return;
    }

    const banner = document.createElement("div");
    fetch(`${baseUrl}/_assets/${bannerName}.html`)
      .then((response) => response.text())
      .then((html) => {
        banner.innerHTML = html;
        document.body.appendChild(banner);
        const ninjaBanner = document.getElementById(bannerName);
        if (!ninjaBanner) return;
        document.body.style.paddingTop = "40px";
      })
      .catch((error) => {
        console.error("Error fetching banner content:", error);
      });
  }

  function createFooter() {
    if (!document.body) {
      setTimeout(createFooter, 100);
      return;
    }

    fetch(`${baseUrl}/_assets/${footerName}.html`)
      .then((r) => r.text())
      .then((html) => {
        document.querySelectorAll("#ninja-badge").forEach((el) => el.remove());
        document.body.insertAdjacentHTML("beforeend", html);
      })
      .catch((error) => {
        console.error("Error fetching footer content:", error);
      });
  }

  if (hostname.includes("daytona.work")) {
    createBanner();
  } else if (hostname.includes("myninja.ai")) {
    createFooter();
  }
}

const attrs = (el) =>
  el ? Array.from(el.attributes).map(a => `${a.name}="${a.value}"`).join(" ") : "";

function takeSnapshot() {
  const doctype = document.doctype
    ? new XMLSerializer().serializeToString(document.doctype)
    : "<!DOCTYPE html>";
  return {
    doctype,
    htmlAttrs: attrs(document.documentElement),
    headHTML: document.head ? document.head.innerHTML : "",
    bodyAttrs: attrs(document.body),
  };
}

function cleanHeadToWhitelist(rawHeadHTML) {
  const wrapper = document.createElement("div");
  wrapper.innerHTML = rawHeadHTML.replace(/<base[^>]*>/gi, "");
  const ALLOW = new Set(["META", "TITLE", "LINK", "STYLE", "SCRIPT"]);
  const BLACKLIST = /(grapesjs|min\.css|beautify)/i;
  const cleaned = [];
  const seen = new Set();
  for (const node of Array.from(wrapper.childNodes)) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      const src = node.getAttribute("src") || "";
      const href = node.getAttribute("href") || "";
      if (!ALLOW.has(tag)) continue;
      if (BLACKLIST.test(src + href)) continue;
      const html = node.outerHTML;
      if (!seen.has(html)) { cleaned.push(html); seen.add(html); }
    } else if (node.nodeType === Node.TEXT_NODE && /\S/.test(node.nodeValue)) {
      cleaned.push(node.nodeValue.trim());
    }
  }
  return cleaned.join("\n");
}

function collapseBlankLines(html) {
  return html.replace(/\n{2,}/g, "\n\n");
}

let SNAPSHOT = null;
let ORIGINAL_BODY_SCRIPTS = "";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });
}

function addCDNs(onReady) {
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://unpkg.com/grapesjs@0.21.9/dist/css/grapes.min.css";
  document.head.appendChild(css);

  loadScript("https://cdn.jsdelivr.net/npm/js-beautify@1.14.11/js/lib/beautify-html.js")
    .then(() => loadScript("https://unpkg.com/grapesjs@0.21.9/dist/grapes.min.js"))
    .then(onReady)
    .catch(() => {
      console.warn("Beautify failed to load, continuing without it.");
      loadScript("https://unpkg.com/grapesjs@0.21.9/dist/grapes.min.js").then(onReady);
    });
}

function makeBodyEditable() {
  if (document.getElementById("gjs-controls")) return;

  const controls = document.createElement("div");
  controls.id = "gjs-controls";
  Object.assign(controls.style, {
    position: "fixed", bottom: "20px", left: "20px",
    zIndex: "2147483647", display: "flex", gap: "8px",
  });

  const styleBtn = (btn) => Object.assign(btn.style, {
    padding: "10px 16px", background: "#764ba2", color: "#fff",
    border: "none", borderRadius: "8px", fontWeight: "bold",
    cursor: "pointer", boxShadow: "0 4px 12px rgba(0,0,0,.2)",
  });

  const btnEdit = document.createElement("button");
  btnEdit.textContent = "âœï¸ Edit";
  styleBtn(btnEdit);

  const btnSave = document.createElement("button");
  btnSave.textContent = "ðŸ’¾ Save";
  styleBtn(btnSave);
  btnSave.disabled = true; btnSave.style.opacity = "0.6"; btnSave.style.cursor = "not-allowed";

  controls.append(btnEdit, btnSave);
  document.body.appendChild(controls);

  let editor = null;
  let originalHtml = "";

  btnEdit.onclick = () => {
    if (editor) return;
    if (!SNAPSHOT) SNAPSHOT = takeSnapshot();

    const BLACKLIST = /(grapesjs|beautify)/i;
    ORIGINAL_BODY_SCRIPTS = Array.from(document.body.querySelectorAll("script"))
      .filter(s => !BLACKLIST.test(s.getAttribute("src") || ""))
      .map(s => s.outerHTML)
      .join("\n");

    controls.remove();
    originalHtml = document.body.innerHTML;
    document.body.innerHTML = '<div id="gjs" style="height:100vh"></div>';
    document.body.appendChild(controls);

    editor = grapesjs.init({
      container: "#gjs",
      height: "100vh",
      storageManager: false,
      avoidInlineStyle: false,
      deviceManager: {
        devices: [
          { id: "Desktop", name: "Desktop", width: "" },
          { id: "Tablet",  name: "Tablet",  width: "768px" },
          { id: "Mobile",  name: "Mobile",  width: "320px" },
        ],
      },
      richTextEditor: { actions: ["bold", "italic", "underline"] },
      canvas: {
        styles: [...document.querySelectorAll('link[rel="stylesheet"][href]')].map(l => l.href),
      },
    });

    // Hide all gray GrapesJS UI (panels/gutters) and make canvas full width
    editor.on("load", () => {
      const style = document.createElement("style");
      style.textContent = `
        .gjs-pn-panels,
        .gjs-pn-views-container,
        .gjs-pn-views,
        .gjs-pn-options,
        .gjs-pn-devices,
        .gjs-pn-panel,
        .gjs-blocks-c,
        .gjs-sm-sectors,
        .gjs-trt-traits,
        .gjs-layers { display: none !important; }
        .gjs-editor, .gjs-cv-canvas { background: transparent !important; left: 0 !important; right: 0 !important; width: 100% !important; }
        .gjs-frame { background: transparent !important; }
      `;
      document.head.appendChild(style);
    });

    editor.setComponents(originalHtml);

    const lockFooter = () => {
      const res = editor.getWrapper().find('#ninja-badge');
      if (!res.length) return;
      const footer = res[0];

      const lock = (cmp) => {
        cmp.set({
          selectable: false,
          hoverable: false,
          badgable: false,
          highlightable: false,
          draggable: false,
          droppable: false,
          editable: false,
          copyable: false,
          removable: false,
          layerable: false,
          stylable: false,
        });
        cmp.components().forEach(child => lock(child));
      };

      lock(footer);
    };

    lockFooter();
    
    btnEdit.disabled = true;
    btnEdit.style.opacity = "0.6";
    btnEdit.style.cursor = "not-allowed";
    btnSave.disabled = false;
    btnSave.style.opacity = "1";
    btnSave.style.cursor = "pointer";
  };

  btnSave.onclick = () => {
    if (!editor) return;

    let rawFragment = editor.getHtml()
      .replace(/<\/?body[^>]*>/gi, "")
      .replace(/<script[^>]*(grapesjs|beautify)[^>]*><\/script>/gi, "")
      .replace(/<link[^>]*(grapesjs|min\.css)[^>]*>/gi, "");

    const htmlBeautify = window.html_beautify || ((s) => s);
    const BEAUTIFY_OPTS = { indent_size: 2, wrap_line_length: 120, preserve_newlines: true, max_preserve_newlines: 1, extra_liners: [] };
    const fragment = htmlBeautify(rawFragment, BEAUTIFY_OPTS);

    document.body.innerHTML = fragment;
    document.body.appendChild(controls);

    const snap = SNAPSHOT || takeSnapshot();
    const cleanHeadHTML = cleanHeadToWhitelist(snap.headHTML);
    const bodyOpen = snap.bodyAttrs && snap.bodyAttrs.trim() ? `<body ${snap.bodyAttrs}>` : `<body>`;
    let fullHtml = `${snap.doctype}
      <html ${snap.htmlAttrs}>
      <head>
      ${cleanHeadHTML}
      </head>
      ${bodyOpen}
      ${fragment}
      ${ORIGINAL_BODY_SCRIPTS}
      </body>
      </html>`;
    fullHtml = fullHtml.replace(/<base[^>]*>/gi, "");
    fullHtml = collapseBlankLines(htmlBeautify(fullHtml, BEAUTIFY_OPTS));

    editor.destroy();
    editor = null;

    btnEdit.disabled = false; btnEdit.style.opacity = "1"; btnEdit.style.cursor = "pointer";
    btnSave.disabled = true;  btnSave.style.opacity = "0.6"; btnSave.style.cursor = "not-allowed";

    const origin = getParentOrigin();
    const target = origin || "*"; // fallback for environments without referrer
    const message = {
      source: "grapesjs",
      type: "GRAPESJS_SAVE_FILE",
      payload: { path: "/index.html", content: fullHtml },
    };
    console.log("[GrapesJS] postMessage", { target, type: message.type, bytes: fullHtml.length });
    window.top.postMessage(message, target);
  };
}

(function startWhenReady() {
  function start() {
    const isHtml = !document.contentType || /text\/html/i.test(document.contentType);
    if (!isHtml) return;

    const isTopLevel = window.self === window.top;
    // Allow init even if referrer is missing; weâ€™ll fallback to '*' on save
    if (!isTopLevel) {
      if (!window.SNAPSHOT) window.SNAPSHOT = takeSnapshot();
      addCDNs(makeBodyEditable);
    }
    initDomainSpecificContent();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    setTimeout(start, 10);
  }
})();
