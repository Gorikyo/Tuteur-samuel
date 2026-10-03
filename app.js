const imageInput = document.querySelector("#imageInput");
const loadButton = document.querySelector("#loadButton");
const emptyLoadButton = document.querySelector("#emptyLoadButton");
const undoButton = document.querySelector("#undoButton");
const eraseButton = document.querySelector("#eraseButton");
const stylusButton = document.querySelector("#stylusButton");
const voiceButton = document.querySelector("#voiceButton");
const verifyButton = document.querySelector("#verifyButton");
const emptyState = document.querySelector("#emptyState");
const canvasWrap = document.querySelector("#canvasWrap");
const photoCanvas = document.querySelector("#photoCanvas");
const drawingCanvas = document.querySelector("#drawingCanvas");
const markerLayer = document.querySelector("#markerLayer");
const status = document.querySelector("#status");
const resultDialog = document.querySelector("#resultDialog");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");
const issueList = document.querySelector("#issueList");
const closeDialogButton = document.querySelector("#closeDialogButton");
const connectionButton = document.querySelector("#connectionButton");
const settingsDialog = document.querySelector("#settingsDialog");
const closeSettingsButton = document.querySelector("#closeSettingsButton");
const signedOutSettings = document.querySelector("#signedOutSettings");
const signedInSettings = document.querySelector("#signedInSettings");
const connectedAccount = document.querySelector("#connectedAccount");
const modelSelect = document.querySelector("#modelSelect");
const disconnectButton = document.querySelector("#disconnectButton");
const voiceDialog = document.querySelector("#voiceDialog");
const closeVoiceButton = document.querySelector("#closeVoiceButton");
const voiceStatus = document.querySelector("#voiceStatus");
const voiceTimer = document.querySelector("#voiceTimer");
const voiceAudio = document.querySelector("#voiceAudio");
const voiceOrb = document.querySelector("#voiceOrb");
const endVoiceButton = document.querySelector("#endVoiceButton");
const voiceHelp = document.querySelector("#voiceHelp");

const photoContext = photoCanvas.getContext("2d");
const drawingContext = drawingCanvas.getContext("2d");

let strokes = [];
let currentStroke = null;
let erasing = false;
let hasPhoto = false;
let stylusOnly = true;
let activePointerId = null;
let correctionIssues = [];
let lastCorrectionContext = "";
let configuration = { authConnected: false, provider: "none" };
let voicePeer = null;
let voiceEvents = null;
let voiceMicrophone = null;
let voiceStartedAt = 0;
let voiceTimerInterval = null;
let voiceLimitTimeout = null;
let voiceCloseTimeout = null;
let voiceActive = false;
let voiceConnecting = false;

function setStatus(message, busy = false) {
  status.lastChild.textContent = ` ${message}`;
  status.classList.toggle("busy", busy);
}

function openImagePicker() {
  imageInput.click();
}

loadButton.addEventListener("click", openImagePicker);
emptyLoadButton.addEventListener("click", openImagePicker);

imageInput.addEventListener("change", async () => {
  const [file] = imageInput.files;
  if (!file) return;

  setStatus("Ouverture de la photo…", true);
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 2400;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    for (const canvas of [photoCanvas, drawingCanvas]) {
      canvas.width = width;
      canvas.height = height;
    }

    photoContext.clearRect(0, 0, width, height);
    photoContext.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    strokes = [];
    correctionIssues = [];
    renderIssueMarkers();
    hasPhoto = true;
    emptyState.hidden = true;
    canvasWrap.hidden = false;
    updateControls();
    renderStrokes();
    setStatus("Photo chargée");
  } catch (error) {
    console.error(error);
    setStatus("Impossible d’ouvrir cette photo");
  } finally {
    imageInput.value = "";
  }
});

function pointFromEvent(event) {
  const rect = drawingCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (drawingCanvas.width / rect.width),
    y: (event.clientY - rect.top) * (drawingCanvas.height / rect.height),
    pressure: event.pressure > 0 ? event.pressure : 0.5,
  };
}

function drawStroke(context, stroke) {
  if (!stroke.points.length) return;
  context.save();
  context.globalCompositeOperation = stroke.mode === "erase" ? "destination-out" : "source-over";
  context.strokeStyle = "#174f7a";
  context.lineCap = "round";
  context.lineJoin = "round";

  if (stroke.points.length === 1) {
    const point = stroke.points[0];
    context.beginPath();
    context.arc(point.x, point.y, stroke.mode === "erase" ? 18 : 3, 0, Math.PI * 2);
    context.fillStyle = context.strokeStyle;
    context.fill();
  } else {
    for (let index = 1; index < stroke.points.length; index += 1) {
      const previous = stroke.points[index - 1];
      const point = stroke.points[index];
      context.beginPath();
      context.moveTo(previous.x, previous.y);
      context.lineTo(point.x, point.y);
      context.lineWidth = stroke.mode === "erase" ? 42 : 4 + point.pressure * 5;
      context.stroke();
    }
  }
  context.restore();
}

function renderStrokes() {
  drawingContext.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
  strokes.forEach((stroke) => drawStroke(drawingContext, stroke));
  if (currentStroke) drawStroke(drawingContext, currentStroke);
}

drawingCanvas.addEventListener("pointerdown", (event) => {
  if (!hasPhoto || (event.pointerType === "mouse" && event.button !== 0)) return;
  if (stylusOnly && event.pointerType === "touch") {
    event.preventDefault();
    setStatus("Paume ignorée — écris avec le Pencil");
    return;
  }
  if (currentStroke || activePointerId !== null) return;
  event.preventDefault();
  drawingCanvas.setPointerCapture(event.pointerId);
  activePointerId = event.pointerId;
  currentStroke = {
    mode: erasing ? "erase" : "draw",
    points: [pointFromEvent(event)],
  };
  renderStrokes();
});

drawingCanvas.addEventListener("pointermove", (event) => {
  if (!currentStroke || event.pointerId !== activePointerId || !drawingCanvas.hasPointerCapture(event.pointerId)) return;
  event.preventDefault();
  const events = event.getCoalescedEvents?.() ?? [event];
  for (const coalescedEvent of events) {
    currentStroke.points.push(pointFromEvent(coalescedEvent));
  }
  renderStrokes();
});

function finishStroke(event) {
  if (!currentStroke || event.pointerId !== activePointerId) return;
  if (drawingCanvas.hasPointerCapture(event.pointerId)) {
    drawingCanvas.releasePointerCapture(event.pointerId);
  }
  strokes.push(currentStroke);
  currentStroke = null;
  activePointerId = null;
  renderStrokes();
  updateControls();
  setStatus(erasing ? "Gomme active" : "Écriture enregistrée");
}

drawingCanvas.addEventListener("pointerup", finishStroke);
drawingCanvas.addEventListener("pointercancel", finishStroke);

undoButton.addEventListener("click", () => {
  strokes.pop();
  renderStrokes();
  updateControls();
  setStatus(strokes.length ? "Dernier geste annulé" : "Feuille propre");
});

eraseButton.addEventListener("click", () => {
  erasing = !erasing;
  eraseButton.setAttribute("aria-pressed", String(erasing));
  drawingCanvas.classList.toggle("erasing", erasing);
  setStatus(erasing ? "Gomme active" : "Crayon actif");
});

stylusButton.addEventListener("click", () => {
  stylusOnly = !stylusOnly;
  stylusButton.setAttribute("aria-pressed", String(stylusOnly));
  stylusButton.lastChild.textContent = stylusOnly ? " Stylet seul" : " Doigt autorisé";
  setStatus(stylusOnly ? "Rejet de la paume actif" : "Écriture au doigt active");
});

function updateControls() {
  undoButton.disabled = strokes.length === 0;
  eraseButton.disabled = !hasPhoto;
  verifyButton.disabled = !hasPhoto;
}

function exportComposite() {
  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = photoCanvas.width;
  exportCanvas.height = photoCanvas.height;
  const context = exportCanvas.getContext("2d");
  context.drawImage(photoCanvas, 0, 0);
  context.drawImage(drawingCanvas, 0, 0);
  return exportCanvas.toDataURL("image/jpeg", 0.9);
}

function renderIssueMarkers() {
  markerLayer.replaceChildren();
  correctionIssues.forEach((issue) => {
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = "issue-marker";
    marker.textContent = issue.id;
    marker.style.left = `${(issue.x / 999) * 100}%`;
    marker.style.top = `${(issue.y / 999) * 100}%`;
    marker.setAttribute("aria-label", `${issue.title} : ${issue.hint}`);
    marker.addEventListener("click", () => {
      resultDialog.showModal();
      requestAnimationFrame(() => document.querySelector(`[data-issue-id="${issue.id}"]`)?.focus());
    });
    markerLayer.append(marker);
  });
}

function showCorrection(result) {
  correctionIssues = Array.isArray(result.issues) ? result.issues : [];
  lastCorrectionContext = [
    result.summary || result.message || "",
    ...correctionIssues.map((issue) => `${issue.title} : ${issue.hint}`),
    result.nextAction || "",
  ].filter(Boolean).join("\n");
  renderIssueMarkers();
  resultTitle.textContent = ["chatgpt", "api-key"].includes(result.mode) ? "Voici mon conseil" : "Connexion presque prête";
  resultText.textContent = result.summary || result.message;
  issueList.replaceChildren();
  correctionIssues.forEach((issue) => {
    const item = document.createElement("li");
    item.dataset.issueId = issue.id;
    item.tabIndex = -1;
    item.innerHTML = `<span>${issue.id}</span><div><strong></strong><p></p></div>`;
    item.querySelector("strong").textContent = issue.title;
    item.querySelector("p").textContent = issue.hint;
    issueList.append(item);
  });
  if (result.nextAction) {
    const item = document.createElement("li");
    item.className = "next-action";
    item.innerHTML = "<span>→</span><div><strong>À toi de jouer</strong><p></p></div>";
    item.querySelector("p").textContent = result.nextAction;
    issueList.append(item);
  }
  issueList.hidden = issueList.children.length === 0;
  resultDialog.showModal();
}

verifyButton.addEventListener("click", async () => {
  verifyButton.disabled = true;
  setStatus("Préparation de la vérification…", true);

  try {
    const response = await fetch("/api/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        image: exportComposite(),
        annotationCount: strokes.length,
        model: modelSelect.value || undefined,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Erreur de vérification");
    showCorrection(result);
    setStatus("Devoir prêt");
  } catch (error) {
    resultTitle.textContent = "Vérification indisponible";
    resultText.textContent = "La feuille est prête, mais le service de vérification n’a pas répondu. Tu peux continuer à écrire et réessayer.";
    issueList.hidden = true;
    resultDialog.showModal();
    setStatus("Vérification indisponible");
    console.error(error);
  } finally {
    verifyButton.disabled = false;
  }
});

function updateVoiceTimer() {
  const elapsedSeconds = Math.min(20 * 60, Math.floor((Date.now() - voiceStartedAt) / 1000));
  const minutes = String(Math.floor(elapsedSeconds / 60)).padStart(2, "0");
  const seconds = String(elapsedSeconds % 60).padStart(2, "0");
  voiceTimer.textContent = `${minutes}:${seconds} / 20:00`;
}

function cleanupVoice(message = "Conversation terminée.") {
  clearInterval(voiceTimerInterval);
  clearTimeout(voiceLimitTimeout);
  clearTimeout(voiceCloseTimeout);
  voiceMicrophone?.getTracks().forEach((track) => track.stop());
  voiceEvents?.close();
  voicePeer?.close();
  voiceAudio.srcObject = null;
  voicePeer = null;
  voiceEvents = null;
  voiceMicrophone = null;
  voiceActive = false;
  voiceConnecting = false;
  endVoiceButton.disabled = true;
  voiceOrb.classList.remove("listening");
  voiceStatus.textContent = message;
  voiceButton.classList.remove("active");
  voiceButton.lastChild.textContent = " Parler";
}

function endVoiceConversation() {
  if (!voiceActive) return cleanupVoice();
  endVoiceButton.disabled = true;
  voiceStatus.textContent = "Fin de la conversation…";
  if (voiceEvents?.readyState === "open") {
    voiceEvents.send(JSON.stringify({ type: "session.close" }));
    voiceCloseTimeout = setTimeout(() => cleanupVoice(), 15_000);
  } else {
    cleanupVoice();
  }
}

async function waitForIce(connection) {
  if (connection.iceGatheringState === "complete") return;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      connection.removeEventListener("icegatheringstatechange", onChange);
      reject(new Error("Le micro n’a pas pu établir la connexion."));
    }, 10_000);
    function onChange() {
      if (connection.iceGatheringState !== "complete") return;
      clearTimeout(timeout);
      connection.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    }
    connection.addEventListener("icegatheringstatechange", onChange);
  });
}

async function startVoiceConversation() {
  if (voiceConnecting || voiceActive) return;
  if (!voiceDialog.open) voiceDialog.showModal();
  voiceTimer.textContent = "00:00 / 20:00";
  voiceHelp.textContent = "La conversation s’arrête automatiquement après 20 minutes.";
  if (!configuration.liveConfigured) {
    voiceStatus.textContent = "La clé API vocale n’est pas encore chargée sur le serveur.";
    return;
  }
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    voiceStatus.textContent = "Le microphone est bloqué sur cette adresse HTTP.";
    voiceHelp.textContent = "Utilise localhost sur le Mac. Pour l’iPad, il faut d’abord une adresse HTTPS.";
    return;
  }

  voiceStatus.textContent = "Autorise le microphone…";
  voiceConnecting = true;
  voiceButton.classList.add("active");
  voiceButton.lastChild.textContent = " En direct";
  try {
    const connection = new RTCPeerConnection();
    voicePeer = connection;
    connection.addEventListener("track", (event) => {
      voiceAudio.srcObject = new MediaStream([event.track]);
      voiceAudio.play().catch(() => {
        voiceStatus.textContent = "Touchez l’écran pour entendre le tuteur.";
      });
    });
    voiceMicrophone = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    for (const track of voiceMicrophone.getAudioTracks()) connection.addTrack(track, voiceMicrophone);

    voiceEvents = connection.createDataChannel("oai-events");
    voiceEvents.addEventListener("message", ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === "session.started") {
        voiceConnecting = false;
        voiceActive = true;
        voiceStartedAt = Date.now();
        endVoiceButton.disabled = false;
        voiceStatus.textContent = "Je t’écoute… commence à parler.";
        voiceOrb.classList.add("listening");
        updateVoiceTimer();
        voiceTimerInterval = setInterval(updateVoiceTimer, 1_000);
        voiceLimitTimeout = setTimeout(endVoiceConversation, 20 * 60_000);
      } else if (event.type === "session.closed") {
        cleanupVoice("Conversation terminée.");
      } else if (event.type === "error" || event.type === "session.error") {
        cleanupVoice(event.message || "La conversation a rencontré un problème.");
      }
    });
    voiceEvents.addEventListener("close", () => {
      if (voiceActive || voiceConnecting) cleanupVoice("La conversation a été interrompue.");
    });

    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    await waitForIce(connection);
    const response = await fetch("/api/live/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sdp: connection.localDescription?.sdp, context: lastCorrectionContext }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || result.error?.message || "Connexion Live impossible.");
    await connection.setRemoteDescription({ type: "answer", sdp: result.transport.sdp });
    voiceStatus.textContent = "Connexion au tuteur…";
  } catch (error) {
    cleanupVoice(error.name === "NotAllowedError" ? "Le microphone n’a pas été autorisé." : error.message || "Connexion Live impossible.");
  }
}

voiceButton.addEventListener("click", () => {
  if (voiceActive || voiceConnecting) {
    if (!voiceDialog.open) voiceDialog.showModal();
  } else {
    startVoiceConversation();
  }
});
endVoiceButton.addEventListener("click", endVoiceConversation);
closeVoiceButton.addEventListener("click", () => {
  if (voiceActive) endVoiceConversation();
  else if (voiceConnecting) cleanupVoice("Connexion annulée.");
  voiceDialog.close();
});
voiceDialog.addEventListener("cancel", (event) => {
  if (!voiceActive) return;
  event.preventDefault();
  endVoiceConversation();
});
window.addEventListener("pagehide", () => {
  if (voiceActive) endVoiceConversation();
});

closeDialogButton.addEventListener("click", () => resultDialog.close());
resultDialog.addEventListener("click", (event) => {
  if (event.target === resultDialog) resultDialog.close();
});

updateControls();

async function loadModels() {
  modelSelect.innerHTML = '<option value="">Chargement…</option>';
  try {
    const response = await fetch("/api/models");
    const result = await response.json();
    modelSelect.innerHTML = "";
    for (const model of result.models || []) {
      const option = document.createElement("option");
      option.value = model.slug;
      option.textContent = model.slug === result.selected ? `${model.displayName} — recommandé` : model.displayName;
      modelSelect.append(option);
    }
    const remembered = localStorage.getItem("tuteur-samuel-analysis-model");
    if (remembered && [...modelSelect.options].some((option) => option.value === remembered)) {
      modelSelect.value = remembered;
    } else if (result.selected) {
      modelSelect.value = result.selected;
    }
    if (!modelSelect.options.length) {
      modelSelect.add(new Option("Aucun modèle disponible", ""));
    }
  } catch {
    modelSelect.innerHTML = '<option value="">Modèles indisponibles</option>';
  }
}

async function loadConfiguration() {
  try {
    const response = await fetch("/api/status");
    configuration = await response.json();
    signedOutSettings.hidden = configuration.authConnected;
    signedInSettings.hidden = !configuration.authConnected;
    if (configuration.authConnected) {
      connectionButton.textContent = configuration.name || "ChatGPT connecté";
      connectedAccount.textContent = configuration.email || "Ton abonnement ChatGPT est prêt.";
      setStatus("ChatGPT connecté");
      await loadModels();
    } else if (configuration.provider === "api-key") {
      connectionButton.textContent = "Réglages IA";
      setStatus("IA connectée");
    } else {
      connectionButton.textContent = "Connecter ChatGPT";
      setStatus("Mode prototype");
    }
  } catch {
    setStatus("Prêt");
  }
}

modelSelect.addEventListener("change", () => localStorage.setItem("tuteur-samuel-analysis-model", modelSelect.value));
connectionButton.addEventListener("click", () => settingsDialog.showModal());
closeSettingsButton.addEventListener("click", () => settingsDialog.close());
settingsDialog.addEventListener("click", (event) => {
  if (event.target === settingsDialog) settingsDialog.close();
});
disconnectButton.addEventListener("click", async () => {
  disconnectButton.disabled = true;
  await fetch("/auth/openai/logout", { method: "POST" });
  localStorage.removeItem("tuteur-samuel-analysis-model");
  settingsDialog.close();
  await loadConfiguration();
  disconnectButton.disabled = false;
});

const pageParameters = new URLSearchParams(location.search);
if (pageParameters.has("connected")) {
  history.replaceState({}, "", location.pathname);
  setTimeout(() => settingsDialog.showModal(), 100);
}
if (pageParameters.has("auth_error")) {
  history.replaceState({}, "", location.pathname);
  resultTitle.textContent = "Connexion non terminée";
  resultText.textContent = pageParameters.get("auth_error");
  setTimeout(() => resultDialog.showModal(), 150);
}

loadConfiguration();
