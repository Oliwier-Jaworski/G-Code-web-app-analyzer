(() => {
  const form = document.getElementById("upload-form");
  const fileInput = document.getElementById("file-input");
  const fileInfo = document.getElementById("file-info");
  const dropzone = document.getElementById("dropzone");
  const submitBtn = document.getElementById("submit-btn");
  const progressWrap = document.getElementById("progress-wrap");
  const progressBar = document.getElementById("progress-bar");
  const progressLabel = document.getElementById("progress-label");
  const errorBox = document.getElementById("error-box");
  const results = document.getElementById("results");
  const resultsFilename = document.getElementById("results-filename");
  const slicerSection = document.getElementById("slicer-meta");
  const viewerSection = document.getElementById("viewer");
  const viewerCanvas = document.getElementById("viewer-canvas");
  const viewerInfo = document.getElementById("viewer-info");
  const viewButtons = document.querySelectorAll(".view-btn");

  let viewerModule = null;
  let viewerReady = false;
  const ensureViewer = async () => {
    if (!viewerModule) {
      viewerModule = await import("./viewer.js");
    }
    if (!viewerReady) {
      viewerModule.initViewer(viewerCanvas);
      viewerReady = true;
    }
    return viewerModule;
  };

  const updateViewButtons = (active) => {
    viewButtons.forEach((btn) => {
      const isActive = btn.dataset.view === active;
      btn.classList.toggle("bg-indigo-600", isActive);
      btn.classList.toggle("text-white", isActive);
      btn.classList.toggle("border-indigo-500", isActive);
      btn.classList.toggle("bg-white", !isActive);
      btn.classList.toggle("border-slate-300", !isActive);
    });
  };

  viewButtons.forEach((btn) => {
    btn.addEventListener("click", async () => {
      updateViewButtons(btn.dataset.view);
      const v = await ensureViewer();
      v.setView(btn.dataset.view);
    });
  });
  const paramsSection = document.getElementById("params");
  const materialSelect = document.getElementById("material");
  const diameterSelect = document.getElementById("diameter");
  const speedRange = document.getElementById("speed-factor");
  const speedLabel = document.getElementById("speed-factor-label");
  const priceKgInput = document.getElementById("price-kg");
  const powerWInput = document.getElementById("power-w");
  const priceKwhInput = document.getElementById("price-kwh");
  const exportBtn = document.getElementById("export-btn");
  const layerControls = document.getElementById("layer-controls");
  const layerSlider = document.getElementById("layer-slider");
  const layerPlay = document.getElementById("layer-play");
  const layerLabel = document.getElementById("layer-label");
  const compareSection = document.getElementById("compare");
  const compareInput = document.getElementById("compare-input");
  const compareStatus = document.getElementById("compare-status");
  const compareTableWrap = document.getElementById("compare-table-wrap");

  const MATERIAL_PRESETS = {
    PLA: 1.24,
    PETG: 1.27,
    ABS: 1.04,
    ASA: 1.07,
    TPU: 1.21,
    Nylon: 1.14,
    PC: 1.2,
  };

  let lastData = null;
  let compareData = null;

  const fmtNumber = (n, digits = 1) =>
    Number.isFinite(n)
      ? n.toLocaleString("pl-PL", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        })
      : "—";

  const fmtBytes = (b) => {
    if (!Number.isFinite(b)) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${fmtNumber(b / 1024, 1)} KB`;
    return `${fmtNumber(b / (1024 * 1024), 2)} MB`;
  };

  const fmtTime = (s) => {
    if (!Number.isFinite(s) || s <= 0) return "—";
    // Zaokrąglij całość przed podziałem, inaczej 659.6s daje "10m 60s".
    const total = Math.round(s);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${sec}s`;
    return `${sec}s`;
  };

  const fmtDistance = (mm) => {
    if (!Number.isFinite(mm)) return "—";
    if (mm >= 1000) return `${fmtNumber(mm / 1000, 2)} m`;
    return `${fmtNumber(mm, 1)} mm`;
  };

  const fmtFilamentLength = (mm) => {
    if (!Number.isFinite(mm)) return "—";
    if (mm >= 1000) return `${fmtNumber(mm / 1000, 2)} m`;
    return `${fmtNumber(mm, 1)} mm`;
  };

  const fmtMass = (g) => {
    if (!Number.isFinite(g)) return "—";
    if (g >= 1000) return `${fmtNumber(g / 1000, 2)} kg`;
    return `${fmtNumber(g, 1)} g`;
  };

  const setMetric = (key, value) => {
    const el = document.querySelector(`[data-metric="${key}"]`);
    if (el) el.textContent = value;
  };

  const showError = (msg) => {
    errorBox.textContent = msg;
    errorBox.classList.remove("hidden");
  };
  const clearError = () => {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
  };

  const updateFileInfo = () => {
    const f = fileInput.files && fileInput.files[0];
    if (!f) {
      fileInfo.textContent = "Brak wybranego pliku";
      submitBtn.disabled = true;
      return;
    }
    fileInfo.textContent = `${f.name} · ${fmtBytes(f.size)}`;
    submitBtn.disabled = false;
  };

  fileInput.addEventListener("change", updateFileInfo);

  ["dragenter", "dragover"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add("dragover");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    dropzone.addEventListener(ev, (e) => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove("dragover");
    }),
  );
  dropzone.addEventListener("drop", (e) => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files[0]) {
      fileInput.files = dt.files;
      updateFileInfo();
    }
  });

  const getParams = () => {
    const material = materialSelect.value;
    const density =
      MATERIAL_PRESETS[material] ??
      parseFloat(
        materialSelect.selectedOptions[0]?.dataset.density || "1.24",
      );
    const diameter = parseFloat(diameterSelect.value) || 1.75;
    const speedFactor = Math.max(0.01, parseFloat(speedRange.value) / 100);
    const priceKg = Math.max(0, parseFloat(priceKgInput.value) || 0);
    const powerW = Math.max(0, parseFloat(powerWInput.value) || 0);
    const priceKwh = Math.max(0, parseFloat(priceKwhInput.value) || 0);
    return {
      material,
      density,
      diameter,
      speedFactor,
      priceKg,
      powerW,
      priceKwh,
    };
  };

  // Wspólne wyliczenia zależne od parametrów - używane przez kafelki,
  // eksport raportu i tabelę porównania.
  const computeDerived = (data, params) => {
    const crossSection = Math.PI * (params.diameter / 2) ** 2;
    const massG =
      (data.filamentMm || 0) * crossSection * params.density * 0.001;
    const baseTimeS = data.estimatedTimeS || 0;
    const scaledTimeS = baseTimeS / params.speedFactor;
    const costMaterial = (massG / 1000) * params.priceKg;
    const costEnergy =
      (scaledTimeS / 3600) * (params.powerW / 1000) * params.priceKwh;
    return {
      massG,
      baseTimeS,
      scaledTimeS,
      costMaterial,
      costEnergy,
      costTotal: costMaterial + costEnergy,
    };
  };

  const fmtMoney = (v) =>
    Number.isFinite(v) ? `${fmtNumber(v, 2)} zł` : "—";

  const renderTiles = () => {
    if (!lastData) return;
    const params = getParams();
    const d = computeDerived(lastData, params);

    setMetric("filament", fmtMass(d.massG));
    setMetric(
      "filamentDetail",
      `${fmtFilamentLength(
        lastData.filamentMm,
      )} · ${params.material}, ⌀${fmtNumber(params.diameter, 2)} mm, ${fmtNumber(
        params.density,
        2,
      )} g/cm³`,
    );

    const baseSpeed = lastData.avgPrintSpeedMmS;
    setMetric(
      "baseSpeed",
      Number.isFinite(baseSpeed)
        ? `Bazowa prędkość druku z gcode: ${fmtNumber(baseSpeed, 1)} mm/s`
        : "",
    );

    setMetric("estimatedTime", fmtTime(d.scaledTimeS));
    const pct = Math.round(params.speedFactor * 100);
    setMetric(
      "estimatedTimeDetail",
      pct === 100
        ? "Model trapezowy przyspieszeń (a=1500 mm/s²) — wartość orientacyjna."
        : `Mnożnik prędkości: ${pct}% · bazowo ${fmtTime(d.baseTimeS)}.`,
    );

    setMetric("cost", fmtMoney(d.costTotal));
    setMetric(
      "costDetail",
      `Materiał: ${fmtMoney(d.costMaterial)} · Energia: ${fmtMoney(
        d.costEnergy,
      )} (${fmtNumber(params.powerW, 0)} W)`,
    );

    renderCompare();
  };

  const renderResults = (data) => {
    lastData = data;
    compareData = null;
    compareStatus.textContent = "";
    resultsFilename.textContent = `${data.filename || ""} · ${fmtBytes(
      data.fileSizeBytes,
    )}`;

    renderTiles();

    setMetric("layers", String(data.layerCount ?? 0));
    setMetric(
      "layerHeight",
      data.layerHeightMm
        ? `Wysokość warstwy ≈ ${fmtNumber(data.layerHeightMm, 3)} mm`
        : "Brak wykrytej wysokości warstwy",
    );

    const sx = data.size?.x ?? 0;
    const sy = data.size?.y ?? 0;
    const sz = data.size?.z ?? 0;
    setMetric(
      "size",
      `${fmtNumber(sx, 1)} × ${fmtNumber(sy, 1)} × ${fmtNumber(sz, 1)} mm`,
    );
    const b = data.bounds || { x: [0, 0], y: [0, 0], z: [0, 0] };
    setMetric(
      "bounds",
      `X: ${fmtNumber(b.x[0], 1)}…${fmtNumber(b.x[1], 1)} · ` +
        `Y: ${fmtNumber(b.y[0], 1)}…${fmtNumber(b.y[1], 1)} · ` +
        `Z: ${fmtNumber(b.z[0], 1)}…${fmtNumber(b.z[1], 1)}`,
    );

    setMetric("totalDistance", fmtDistance(data.totalDistanceMm));
    setMetric(
      "distanceSplit",
      `Druk: ${fmtDistance(data.printDistanceMm)} · ` +
        `Przejazd: ${fmtDistance(data.travelDistanceMm)}`,
    );

    setMetric("fileSize", fmtBytes(data.fileSizeBytes));
    setMetric(
      "lineCount",
      `${(data.lineCount ?? 0).toLocaleString("pl-PL")} linii`,
    );

    renderSlicerMeta(data.slicer);
    renderViewer(data);

    results.classList.remove("hidden");
    paramsSection.classList.remove("hidden");
    compareSection.classList.remove("hidden");
  };

  // --- Suwak warstw + animacja druku ---
  let viewerLayerCount = 0;
  let layerAnimId = null;

  const stopLayerAnim = () => {
    if (layerAnimId !== null) {
      cancelAnimationFrame(layerAnimId);
      layerAnimId = null;
    }
    layerPlay.textContent = "▶";
  };

  const setLayerUI = (n) => {
    layerSlider.value = String(n);
    layerLabel.textContent = `Warstwa ${n} / ${viewerLayerCount}`;
  };

  const applyLayerLimit = async (n) => {
    const v = await ensureViewer();
    v.setLayerLimit(n);
  };

  layerSlider.addEventListener("input", () => {
    stopLayerAnim();
    const n = parseInt(layerSlider.value, 10) || 1;
    setLayerUI(n);
    applyLayerLimit(n);
  });

  const startLayerAnim = () => {
    if (viewerLayerCount < 2) return;
    layerPlay.textContent = "⏸";
    // Pełny przebieg w ~4-20 s zależnie od liczby warstw.
    const totalMs = Math.min(Math.max(viewerLayerCount * 80, 4000), 20000);
    let from = parseInt(layerSlider.value, 10) || 1;
    if (from >= viewerLayerCount) from = 1;
    const rate = viewerLayerCount / totalMs; // warstwy / ms
    const startTs = performance.now();
    let lastShown = -1;
    const step = (ts) => {
      const n = Math.min(
        viewerLayerCount,
        Math.max(1, Math.floor(from + (ts - startTs) * rate)),
      );
      if (n !== lastShown) {
        lastShown = n;
        setLayerUI(n);
        applyLayerLimit(n);
      }
      if (n >= viewerLayerCount) {
        stopLayerAnim();
        return;
      }
      layerAnimId = requestAnimationFrame(step);
    };
    layerAnimId = requestAnimationFrame(step);
  };

  layerPlay.addEventListener("click", () => {
    if (layerAnimId !== null) stopLayerAnim();
    else startLayerAnim();
  });

  const setupLayerControls = (tp) => {
    stopLayerAnim();
    viewerLayerCount = (tp.extrusionLayerOffsets?.length || 1) - 1;
    if (viewerLayerCount > 1) {
      layerControls.classList.remove("hidden");
      layerControls.classList.add("flex");
      layerSlider.min = "1";
      layerSlider.max = String(viewerLayerCount);
      setLayerUI(viewerLayerCount);
    } else {
      layerControls.classList.add("hidden");
      layerControls.classList.remove("flex");
    }
  };

  const renderViewer = async (data) => {
    if (!data.toolpath) {
      viewerSection.classList.add("hidden");
      return;
    }
    viewerSection.classList.remove("hidden");
    const tp = data.toolpath;
    viewerInfo.textContent =
      `${tp.sampledSegments.toLocaleString("pl-PL")} / ` +
      `${tp.totalSegments.toLocaleString("pl-PL")} segmentów` +
      (tp.decimationStep > 1 ? ` (co ${tp.decimationStep})` : "");
    try {
      const v = await ensureViewer();
      v.renderToolpath(tp, data.bounds);
      setupLayerControls(tp);
    } catch (err) {
      console.error("Viewer init failed:", err);
      viewerSection.classList.add("hidden");
    }
  };

  const fmtSignedTime = (deltaSec) => {
    const sign = deltaSec >= 0 ? "+" : "−";
    return `${sign}${fmtTime(Math.abs(deltaSec))}`;
  };

  const fmtSignedAmount = (delta, suffix, digits = 1) => {
    const sign = delta >= 0 ? "+" : "−";
    return `${sign}${fmtNumber(Math.abs(delta), digits)} ${suffix}`;
  };

  const renderSlicerMeta = (slicer) => {
    if (!slicer) {
      slicerSection.classList.add("hidden");
      return;
    }
    const hasAny =
      slicer.name != null ||
      slicer.timeS != null ||
      slicer.filamentMm != null ||
      slicer.filamentG != null ||
      slicer.layerHeightMm != null;
    if (!hasAny) {
      slicerSection.classList.add("hidden");
      return;
    }
    slicerSection.classList.remove("hidden");

    setMetric("slicerName", slicer.name ? slicer.name : "");

    if (Number.isFinite(slicer.timeS) && lastData?.estimatedTimeS != null) {
      const ours = lastData.estimatedTimeS;
      const diff = ours - slicer.timeS;
      setMetric(
        "slicerTime",
        `${fmtTime(slicer.timeS)} (nasze: ${fmtTime(ours)}, ${fmtSignedTime(diff)})`,
      );
    } else if (Number.isFinite(slicer.timeS)) {
      setMetric("slicerTime", fmtTime(slicer.timeS));
    } else {
      setMetric("slicerTime", "—");
    }

    if (Number.isFinite(slicer.filamentMm) && lastData?.filamentMm != null) {
      const diff = lastData.filamentMm - slicer.filamentMm;
      setMetric(
        "slicerFilamentLength",
        `${fmtFilamentLength(slicer.filamentMm)} (${fmtSignedAmount(
          diff,
          "mm",
          1,
        )})`,
      );
    } else if (Number.isFinite(slicer.filamentMm)) {
      setMetric("slicerFilamentLength", fmtFilamentLength(slicer.filamentMm));
    } else {
      setMetric("slicerFilamentLength", "—");
    }

    if (Number.isFinite(slicer.filamentG)) {
      setMetric("slicerFilamentMass", fmtMass(slicer.filamentG));
    } else {
      setMetric("slicerFilamentMass", "—");
    }

    if (Number.isFinite(slicer.layerHeightMm)) {
      setMetric(
        "slicerLayerHeight",
        `${fmtNumber(slicer.layerHeightMm, 3)} mm`,
      );
    } else {
      setMetric("slicerLayerHeight", "—");
    }
  };

  materialSelect.addEventListener("change", renderTiles);
  diameterSelect.addEventListener("change", renderTiles);
  speedRange.addEventListener("input", () => {
    speedLabel.textContent = `${speedRange.value}%`;
    renderTiles();
  });
  priceKgInput.addEventListener("input", renderTiles);
  powerWInput.addEventListener("input", renderTiles);
  priceKwhInput.addEventListener("input", renderTiles);

  exportBtn.addEventListener("click", () => {
    if (!lastData) return;
    const params = getParams();
    const d = computeDerived(lastData, params);
    // Toolpath pomijamy - to setki kilobajtów geometrii, nie raport.
    const { toolpath, ...metrics } = lastData;
    const report = {
      exportedAt: new Date().toISOString(),
      parameters: params,
      derived: {
        filamentMassG: d.massG,
        estimatedTimeS: d.scaledTimeS,
        costMaterialPln: d.costMaterial,
        costEnergyPln: d.costEnergy,
        costTotalPln: d.costTotal,
      },
      metrics,
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = (lastData.filename || "gcode").replace(/\.[^.]+$/, "");
    a.download = `${base}.report.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  const uploadWithProgress = (file, { withToolpath = true, onProgress } = {}) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        "POST",
        withToolpath ? "/api/analyze?toolpath=1" : "/api/analyze",
      );
      xhr.responseType = "json";

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable || !onProgress) return;
        onProgress(Math.round((e.loaded / e.total) * 100));
      });

      xhr.onerror = () => reject(new Error("Błąd sieci."));
      xhr.onload = () => {
        const body = xhr.response;
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(body);
        } else {
          const detail =
            (body && (body.detail || body.error)) ||
            `Błąd serwera (${xhr.status}).`;
          reject(new Error(detail));
        }
      };

      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    });

  // --- Porównanie dwóch plików ---
  const escHtml = (s) =>
    String(s).replace(
      /[&<>"]/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]),
    );

  const deltaCell = (delta, fmt) => {
    if (delta == null || !Number.isFinite(delta) || !fmt) {
      return '<span class="text-slate-400">—</span>';
    }
    const cls =
      delta < 0
        ? "text-emerald-600"
        : delta > 0
          ? "text-rose-600"
          : "text-slate-400";
    return `<span class="${cls}">${escHtml(fmt(delta))}</span>`;
  };

  const renderCompare = () => {
    if (!compareData || !lastData) {
      compareTableWrap.classList.add("hidden");
      compareTableWrap.innerHTML = "";
      return;
    }
    const params = getParams();
    const a = computeDerived(lastData, params);
    const b = computeDerived(compareData, params);
    const fmtSizeOf = (data) =>
      `${fmtNumber(data.size?.x ?? 0, 1)} × ${fmtNumber(
        data.size?.y ?? 0,
        1,
      )} × ${fmtNumber(data.size?.z ?? 0, 1)} mm`;

    const rows = [
      [
        "Czas druku",
        fmtTime(a.scaledTimeS),
        fmtTime(b.scaledTimeS),
        b.scaledTimeS - a.scaledTimeS,
        fmtSignedTime,
      ],
      [
        "Filament — masa",
        fmtMass(a.massG),
        fmtMass(b.massG),
        b.massG - a.massG,
        (d) => fmtSignedAmount(d, "g", 1),
      ],
      [
        "Filament — długość",
        fmtFilamentLength(lastData.filamentMm),
        fmtFilamentLength(compareData.filamentMm),
        (compareData.filamentMm || 0) - (lastData.filamentMm || 0),
        (d) => fmtSignedAmount(d / 1000, "m", 2),
      ],
      [
        "Szacowany koszt",
        fmtMoney(a.costTotal),
        fmtMoney(b.costTotal),
        b.costTotal - a.costTotal,
        (d) => fmtSignedAmount(d, "zł", 2),
      ],
      [
        "Liczba warstw",
        String(lastData.layerCount ?? 0),
        String(compareData.layerCount ?? 0),
        (compareData.layerCount || 0) - (lastData.layerCount || 0),
        (d) => `${d >= 0 ? "+" : "−"}${Math.abs(d)}`,
      ],
      [
        "Wymiary (X × Y × Z)",
        fmtSizeOf(lastData),
        fmtSizeOf(compareData),
        null,
        null,
      ],
      [
        "Droga druku",
        fmtDistance(lastData.printDistanceMm),
        fmtDistance(compareData.printDistanceMm),
        (compareData.printDistanceMm || 0) - (lastData.printDistanceMm || 0),
        (d) => fmtSignedAmount(d / 1000, "m", 2),
      ],
      [
        "Droga przejazdów",
        fmtDistance(lastData.travelDistanceMm),
        fmtDistance(compareData.travelDistanceMm),
        (compareData.travelDistanceMm || 0) -
          (lastData.travelDistanceMm || 0),
        (d) => fmtSignedAmount(d / 1000, "m", 2),
      ],
    ];

    const head =
      '<thead><tr class="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">' +
      '<th class="px-4 py-3 font-medium">Metryka</th>' +
      `<th class="px-4 py-3 font-medium">${escHtml(
        lastData.filename || "Plik A",
      )}</th>` +
      `<th class="px-4 py-3 font-medium">${escHtml(
        compareData.filename || "Plik B",
      )}</th>` +
      '<th class="px-4 py-3 font-medium">Δ (B − A)</th></tr></thead>';
    const body = rows
      .map(
        ([label, va, vb, delta, fmt]) =>
          '<tr class="border-b border-slate-100 last:border-0">' +
          `<td class="px-4 py-2.5 text-slate-500">${escHtml(label)}</td>` +
          `<td class="px-4 py-2.5 font-medium">${escHtml(va)}</td>` +
          `<td class="px-4 py-2.5 font-medium">${escHtml(vb)}</td>` +
          `<td class="px-4 py-2.5">${deltaCell(delta, fmt)}</td></tr>`,
      )
      .join("");
    compareTableWrap.innerHTML =
      `<table class="w-full min-w-[560px] text-sm">${head}<tbody>${body}</tbody></table>`;
    compareTableWrap.classList.remove("hidden");
  };

  compareInput.addEventListener("change", async () => {
    const f = compareInput.files && compareInput.files[0];
    if (!f || !lastData) return;
    compareStatus.textContent = `Analizuję ${f.name}…`;
    try {
      compareData = await uploadWithProgress(f, { withToolpath: false });
      compareStatus.textContent = "";
    } catch (err) {
      compareData = null;
      compareStatus.textContent = err.message || String(err);
    } finally {
      compareInput.value = "";
      renderCompare();
    }
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;

    submitBtn.disabled = true;
    submitBtn.textContent = "Analizuję...";
    progressWrap.classList.remove("hidden");
    progressBar.style.width = "0%";
    progressLabel.textContent = "0%";

    try {
      const data = await uploadWithProgress(f, {
        onProgress: (pct) => {
          progressBar.style.width = `${pct}%`;
          progressLabel.textContent =
            pct < 100 ? `Wysyłanie: ${pct}%` : "Analiza...";
        },
      });
      renderResults(data);
    } catch (err) {
      showError(err.message || String(err));
      results.classList.add("hidden");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Analizuj";
      progressWrap.classList.add("hidden");
    }
  });
})();
