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
  const paramsSection = document.getElementById("params");
  const materialSelect = document.getElementById("material");
  const diameterSelect = document.getElementById("diameter");
  const speedRange = document.getElementById("speed-factor");
  const speedLabel = document.getElementById("speed-factor-label");

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
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.round(s % 60);
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
    return { material, density, diameter, speedFactor };
  };

  const renderTiles = () => {
    if (!lastData) return;
    const { material, density, diameter, speedFactor } = getParams();

    const crossSection = Math.PI * (diameter / 2) ** 2;
    const massG =
      (lastData.filamentMm || 0) * crossSection * density * 0.001;
    setMetric("filament", fmtMass(massG));
    setMetric(
      "filamentDetail",
      `${fmtFilamentLength(
        lastData.filamentMm,
      )} · ${material}, ⌀${fmtNumber(diameter, 2)} mm, ${fmtNumber(
        density,
        2,
      )} g/cm³`,
    );

    const baseTime = lastData.estimatedTimeS || 0;
    const scaledTime = baseTime / speedFactor;
    setMetric("estimatedTime", fmtTime(scaledTime));
    const pct = Math.round(speedFactor * 100);
    setMetric(
      "estimatedTimeDetail",
      pct === 100
        ? "Bez modelu akceleracji — wartość orientacyjna."
        : `Mnożnik prędkości: ${pct}% · bazowo ${fmtTime(baseTime)}.`,
    );
  };

  const renderResults = (data) => {
    lastData = data;
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

    results.classList.remove("hidden");
    paramsSection.classList.remove("hidden");
  };

  materialSelect.addEventListener("change", renderTiles);
  diameterSelect.addEventListener("change", renderTiles);
  speedRange.addEventListener("input", () => {
    speedLabel.textContent = `${speedRange.value}%`;
    renderTiles();
  });

  const uploadWithProgress = (file) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/analyze");
      xhr.responseType = "json";

      xhr.upload.addEventListener("progress", (e) => {
        if (!e.lengthComputable) return;
        const pct = Math.round((e.loaded / e.total) * 100);
        progressBar.style.width = `${pct}%`;
        progressLabel.textContent =
          pct < 100 ? `Wysyłanie: ${pct}%` : "Analiza...";
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
      const data = await uploadWithProgress(f);
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
