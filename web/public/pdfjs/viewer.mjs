import * as pdfjsLib from "./pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdf.worker.min.mjs";

const PAGE_RENDER_ROOT_MARGIN = "1000px 0px";
const MODE_STORAGE_KEY = "lecture_pdf_viewer_mode";

const els = {
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  modePagedBtn: document.getElementById("modePagedBtn"),
  modeScrollBtn: document.getElementById("modeScrollBtn"),
  zoomOutBtn: document.getElementById("zoomOutBtn"),
  zoomInBtn: document.getElementById("zoomInBtn"),
  pageMeta: document.getElementById("pageMeta"),
  zoomMeta: document.getElementById("zoomMeta"),
  openLink: document.getElementById("openLink"),
  message: document.getElementById("message"),
  single: document.getElementById("single"),
  singlePage: document.getElementById("singlePage"),
  pages: document.getElementById("pages"),
  main: document.querySelector(".main"),
};

function showMessage(text) {
  els.message.textContent = text;
  els.message.classList.add("show");
  els.single.setAttribute("hidden", "");
  els.pages.setAttribute("hidden", "");
}

function hideMessage() {
  els.message.textContent = "";
  els.message.classList.remove("show");
  els.single.removeAttribute("hidden");
  els.pages.removeAttribute("hidden");
}

function isAllowedFileUrl(fileUrl) {
  return typeof fileUrl === "string" && fileUrl.startsWith("/assets/");
}

const state = {
  mode: "paged", // "paged" | "scroll"
  pdf: null,
  numPages: 0,
  currentPage: 1,
  scale: 1.2,
  fileUrl: null,
  pageObserver: null,
  visibleRatios: new Map(), // pageNumber -> intersectionRatio
  rendered: new Set(), // pageNumber
  renderPromises: new Map(), // pageNumber -> Promise<void>
  renderTasks: new Map(), // pageNumber -> { renderTask?, textLayer? }
  placeholderSize: null, // { width, height } for scroll placeholders
  pagedTask: null, // { renderTask?, textLayer?, pageNumber? }
  pagedPromise: null,
};

function normalizeMode(mode) {
  return mode === "scroll" ? "scroll" : "paged";
}

function loadInitialMode() {
  try {
    return normalizeMode(localStorage.getItem(MODE_STORAGE_KEY));
  } catch {
    return "paged";
  }
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch {
    // ignore
  }
}

function updateModeButtons() {
  const paged = state.mode === "paged";
  els.modePagedBtn.classList.toggle("btnActive", paged);
  els.modeScrollBtn.classList.toggle("btnActive", !paged);
}

function applyMode(mode) {
  state.mode = normalizeMode(mode);
  document.documentElement.dataset.mode = state.mode;
  updateModeButtons();
  saveMode(state.mode);
  updateToolbar();
}

function updateToolbar() {
  const hasPdf = !!state.pdf;
  els.prevBtn.disabled = !hasPdf || state.currentPage <= 1;
  els.nextBtn.disabled = !hasPdf || state.currentPage >= state.numPages;
  els.zoomOutBtn.disabled = !hasPdf;
  els.zoomInBtn.disabled = !hasPdf;

  if (!hasPdf) {
    els.pageMeta.textContent = "加载中…";
    els.zoomMeta.textContent = `${Math.round(state.scale * 100)}%`;
    return;
  }

  els.pageMeta.textContent = `第 ${state.currentPage} / ${state.numPages} 页`;
  els.zoomMeta.textContent = `${Math.round(state.scale * 100)}%`;
}

function getPageEl(pageNumber) {
  return els.pages.querySelector(`.page[data-page-number="${pageNumber}"]`);
}

function resetPageLayers(pageEl) {
  const prevCanvas = pageEl.querySelector("canvas");
  const prevTextLayer = pageEl.querySelector(".textLayer");

  const canvas = document.createElement("canvas");
  canvas.className = "pageCanvas";

  const textLayerDiv = document.createElement("div");
  textLayerDiv.className = "textLayer";

  // Important: always render into a *fresh* canvas/text layer.
  // PDF.js throws if the same canvas is used by multiple in-flight render() operations.
  if (prevCanvas) {
    prevCanvas.replaceWith(canvas);
  } else {
    pageEl.appendChild(canvas);
  }

  if (prevTextLayer) {
    prevTextLayer.replaceWith(textLayerDiv);
  } else {
    pageEl.appendChild(textLayerDiv);
  }

  return { canvas, textLayerDiv };
}

function computeCurrentPageFromVisibleRatios() {
  if (!state.pdf || state.visibleRatios.size === 0) return;
  let bestPage = state.currentPage;
  let bestRatio = -1;
  for (const [p, ratio] of state.visibleRatios.entries()) {
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestPage = p;
    }
  }
  if (bestPage !== state.currentPage) {
    state.currentPage = bestPage;
    updateToolbar();
  }
}

async function renderSinglePage(pageNumber) {
  if (!state.pdf) return;
  if (state.rendered.has(pageNumber)) return;

  const existingPromise = state.renderPromises.get(pageNumber);
  if (existingPromise) return existingPromise;

  const pageEl = getPageEl(pageNumber);
  if (!pageEl) return;

  const { canvas, textLayerDiv } = resetPageLayers(pageEl);

  const p = (async () => {
    try {
      // Cancel any previous task (e.g. after zoom) for this page.
      const existing = state.renderTasks.get(pageNumber);
      if (existing?.renderTask) {
        try {
          existing.renderTask.cancel();
        } catch {
          // ignore
        }
      }
      if (existing?.textLayer) {
        try {
          existing.textLayer.cancel();
        } catch {
          // ignore
        }
      }
      state.renderTasks.delete(pageNumber);

      const page = await state.pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: state.scale });

      // Don't force alpha=false: PDFs may contain transparency (e.g. images/masks),
      // and disabling alpha can cause incorrect rendering (e.g. black boxes).
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.imageSmoothingEnabled = true;

      // Ensure wrapper matches page size (for overlay selection).
      pageEl.style.width = `${Math.floor(viewport.width)}px`;
      pageEl.style.height = `${Math.floor(viewport.height)}px`;

      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      const renderTask = page.render({ canvasContext: ctx, viewport, transform });
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });

      state.renderTasks.set(pageNumber, { renderTask, textLayer });

      await Promise.all([renderTask.promise, textLayer.render()]);

      state.renderTasks.delete(pageNumber);
      state.rendered.add(pageNumber);
    } catch (err) {
      // RenderingCancelledException is expected in race/zoom scenarios; don't surface to user.
      const name = err?.name;
      const message = err instanceof Error ? err.message : String(err);
      if (name === "RenderingCancelledException" || message.includes("Rendering cancelled")) {
        return;
      }
      throw err;
    } finally {
      state.renderPromises.delete(pageNumber);
    }
  })();

  state.renderPromises.set(pageNumber, p);
  return p;
}

async function renderPagedPage(pageNumber) {
  if (!state.pdf) return;

  const key = `page:${pageNumber}@${state.scale}`;
  if (state.pagedPromise?.key === key) return state.pagedPromise.promise;

  // Cancel any in-flight paged render (switching pages quickly is expected).
  if (state.pagedTask?.renderTask) {
    try {
      state.pagedTask.renderTask.cancel();
    } catch {
      // ignore
    }
  }
  if (state.pagedTask?.textLayer) {
    try {
      state.pagedTask.textLayer.cancel();
    } catch {
      // ignore
    }
  }
  state.pagedTask = null;

  // Ensure CSS variable is present for TextLayer sizing.
  els.singlePage.style.setProperty("--total-scale-factor", String(state.scale));
  els.singlePage.style.setProperty("--scale-round-x", "1px");
  els.singlePage.style.setProperty("--scale-round-y", "1px");

  const promise = (async () => {
    try {
      els.singlePage.dataset.pageNumber = String(pageNumber);

      const { canvas, textLayerDiv } = resetPageLayers(els.singlePage);

      const page = await state.pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale: state.scale });

      // Don't force alpha=false: PDFs may contain transparency (e.g. images/masks),
      // and disabling alpha can cause incorrect rendering (e.g. black boxes).
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      ctx.imageSmoothingEnabled = true;

      els.singlePage.style.width = `${Math.floor(viewport.width)}px`;
      els.singlePage.style.height = `${Math.floor(viewport.height)}px`;

      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      const renderTask = page.render({ canvasContext: ctx, viewport, transform });
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });

      state.pagedTask = { renderTask, textLayer, pageNumber };
      await Promise.all([renderTask.promise, textLayer.render()]);
      state.pagedTask = null;
    } catch (err) {
      const name = err?.name;
      const message = err instanceof Error ? err.message : String(err);
      if (name === "RenderingCancelledException" || message.includes("Rendering cancelled")) {
        return;
      }
      throw err;
    } finally {
      if (state.pagedPromise?.key === key) state.pagedPromise = null;
    }
  })();

  state.pagedPromise = { key, promise };
  return promise;
}

function clampScale(value) {
  return Math.min(2.2, Math.max(0.6, Number(value.toFixed(2))));
}

els.prevBtn.addEventListener("click", async () => {
  if (!state.pdf) return;
  const target = Math.max(1, state.currentPage - 1);
  state.currentPage = target;
  updateToolbar();

  if (state.mode === "scroll") {
    const el = getPageEl(target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  await renderPagedPage(target);
});

els.nextBtn.addEventListener("click", async () => {
  if (!state.pdf) return;
  const target = Math.min(state.numPages, state.currentPage + 1);
  state.currentPage = target;
  updateToolbar();

  if (state.mode === "scroll") {
    const el = getPageEl(target);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
    return;
  }
  await renderPagedPage(target);
});

els.zoomOutBtn.addEventListener("click", async () => {
  if (!state.pdf) return;
  state.scale = clampScale(state.scale - 0.1);
  updateToolbar();
  if (state.mode === "scroll") {
    await rerenderAll();
    return;
  }
  await renderPagedPage(state.currentPage);
});

els.zoomInBtn.addEventListener("click", async () => {
  if (!state.pdf) return;
  state.scale = clampScale(state.scale + 0.1);
  updateToolbar();
  if (state.mode === "scroll") {
    await rerenderAll();
    return;
  }
  await renderPagedPage(state.currentPage);
});

function disconnectObservers() {
  if (state.pageObserver) {
    state.pageObserver.disconnect();
    state.pageObserver = null;
  }
  state.visibleRatios.clear();
}

function setupObservers() {
  disconnectObservers();
  if (state.mode !== "scroll") return;

  // 1) Observe pages: render lazily.
  const root = els.main ?? null;
  state.pageObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const pageEl = entry.target;
        const pageNumber = Number(pageEl.dataset.pageNumber);
        if (!Number.isFinite(pageNumber) || pageNumber < 1) continue;

        // Track visible ratios to update toolbar current page.
        if (entry.isIntersecting) {
          state.visibleRatios.set(pageNumber, entry.intersectionRatio);
        } else {
          state.visibleRatios.delete(pageNumber);
        }
      }

      computeCurrentPageFromVisibleRatios();

      // Trigger renders after we updated current page.
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const pageNumber = Number(entry.target.dataset.pageNumber);
        if (!Number.isFinite(pageNumber) || pageNumber < 1) continue;
        // Fire and forget; it’s safe because we dedupe via state.rendered.
        void renderSinglePage(pageNumber);
      }
    },
    {
      root,
      rootMargin: PAGE_RENDER_ROOT_MARGIN,
      threshold: [0, 0.15, 0.3, 0.6, 0.9],
    },
  );

  for (const pageEl of els.pages.querySelectorAll(".page")) {
    state.pageObserver.observe(pageEl);
  }
}

async function computePlaceholderSize() {
  if (!state.pdf) return;
  const page1 = await state.pdf.getPage(1);
  const viewport = page1.getViewport({ scale: state.scale });
  state.placeholderSize = {
    width: Math.floor(viewport.width),
    height: Math.floor(viewport.height),
  };
}

function buildPagePlaceholders() {
  els.pages.innerHTML = "";
  state.rendered.clear();
  state.renderPromises.clear();
  state.renderTasks.clear();

  for (let i = 1; i <= state.numPages; i++) {
    const pageEl = document.createElement("div");
    pageEl.className = "page";
    pageEl.dataset.pageNumber = String(i);
    // PDF.js TextLayer uses CSS variables (see pdf_viewer.css) to compute sizes.
    // We only need --total-scale-factor for our minimal viewer.
    pageEl.style.setProperty("--total-scale-factor", String(state.scale));
    pageEl.style.setProperty("--scale-round-x", "1px");
    pageEl.style.setProperty("--scale-round-y", "1px");
    if (state.placeholderSize) {
      pageEl.style.width = `${state.placeholderSize.width}px`;
      pageEl.style.height = `${state.placeholderSize.height}px`;
    }

    const canvas = document.createElement("canvas");
    canvas.className = "pageCanvas";

    const textLayer = document.createElement("div");
    textLayer.className = "textLayer";

    pageEl.appendChild(canvas);
    pageEl.appendChild(textLayer);
    els.pages.appendChild(pageEl);
  }
}

async function rerenderAll() {
  if (!state.pdf) return;

  await computePlaceholderSize();

  // Cancel all in-flight work.
  for (const task of state.renderTasks.values()) {
    try {
      task.renderTask?.cancel();
    } catch {
      // ignore
    }
    try {
      task.textLayer?.cancel();
    } catch {
      // ignore
    }
  }
  state.renderTasks.clear();
  state.rendered.clear();
  state.renderPromises.clear();

  // Clear layers.
  for (const pageEl of els.pages.querySelectorAll(".page")) {
    const canvas = pageEl.querySelector("canvas");
    const textLayerDiv = pageEl.querySelector(".textLayer");
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas.removeAttribute("style");
    }
    if (textLayerDiv) {
      textLayerDiv.innerHTML = "";
    }
    pageEl.removeAttribute("style");
    pageEl.style.setProperty("--total-scale-factor", String(state.scale));
    pageEl.style.setProperty("--scale-round-x", "1px");
    pageEl.style.setProperty("--scale-round-y", "1px");
    if (state.placeholderSize) {
      pageEl.style.width = `${state.placeholderSize.width}px`;
      pageEl.style.height = `${state.placeholderSize.height}px`;
    }
  }

  // Render current page first (avoid races with IntersectionObserver).
  await renderSinglePage(state.currentPage);
  setupObservers();
}

async function main() {
  const params = new URLSearchParams(window.location.search);
  const fileUrl = params.get("file");
  const initialPageParam = Number(params.get("page"));
  const initialPage = Number.isFinite(initialPageParam) ? Math.floor(initialPageParam) : null;

  if (!isAllowedFileUrl(fileUrl)) {
    showMessage(
      [
        "PDF viewer 参数不合法：仅允许同域名 /assets/…",
        "",
        `file = ${fileUrl ?? "(missing)"}`,
      ].join("\n"),
    );
    updateToolbar();
    return;
  }

  state.fileUrl = fileUrl;
  els.openLink.href = fileUrl;
  applyMode(loadInitialMode());

  els.modePagedBtn.addEventListener("click", async () => {
    if (!state.pdf) {
      applyMode("paged");
      return;
    }
    applyMode("paged");
    disconnectObservers();
    await renderPagedPage(state.currentPage);
  });
  els.modeScrollBtn.addEventListener("click", async () => {
    if (!state.pdf) {
      applyMode("scroll");
      return;
    }
    applyMode("scroll");
    await computePlaceholderSize();
    buildPagePlaceholders();
    setupObservers();
    await renderSinglePage(state.currentPage);
    const el = getPageEl(state.currentPage);
    if (el) {
      el.scrollIntoView({ behavior: "auto", block: "start" });
    }
  });

  try {
    hideMessage();
    updateToolbar();

    const task = pdfjsLib.getDocument({
      url: fileUrl,
      cMapUrl: "./cmaps/",
      cMapPacked: true,
      standardFontDataUrl: "./standard_fonts/",
      iccUrl: "./iccs/",
      wasmUrl: "./wasm/",
    });

    state.pdf = await task.promise;
    state.numPages = state.pdf.numPages;
    if (initialPage && initialPage >= 1) {
      state.currentPage = Math.min(initialPage, state.numPages);
    } else {
      state.currentPage = Math.min(Math.max(1, state.currentPage), state.numPages);
    }

    updateToolbar();
    if (state.mode === "scroll") {
      await computePlaceholderSize();
      buildPagePlaceholders();
      await renderSinglePage(state.currentPage);
      setupObservers();
      const el = getPageEl(state.currentPage);
      if (el) {
        el.scrollIntoView({ behavior: "auto", block: "start" });
      }
    } else {
      await renderPagedPage(state.currentPage);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    showMessage(
      [
        "PDF 加载失败。",
        "",
        message,
        "",
        "常见原因：",
        "- MinIO 没有该 object / 网关无法访问",
        "- 本地未配置 /assets 代理或缺少对应静态文件",
        "- object key 不在 ASSET_ALLOWED_PREFIXES 范围内",
      ].join("\n"),
    );
    updateToolbar();
  }
}

updateToolbar();
main();
