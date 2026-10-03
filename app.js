const imageInput = document.querySelector("#imageInput");
const loadButton = document.querySelector("#loadButton");
const emptyLoadButton = document.querySelector("#emptyLoadButton");
const undoButton = document.querySelector("#undoButton");
const eraseButton = document.querySelector("#eraseButton");
const verifyButton = document.querySelector("#verifyButton");
const emptyState = document.querySelector("#emptyState");
const canvasWrap = document.querySelector("#canvasWrap");
const photoCanvas = document.querySelector("#photoCanvas");
const drawingCanvas = document.querySelector("#drawingCanvas");
const status = document.querySelector("#status");
const resultDialog = document.querySelector("#resultDialog");
const resultTitle = document.querySelector("#resultTitle");
const resultText = document.querySelector("#resultText");
const closeDialogButton = document.querySelector("#closeDialogButton");

const photoContext = photoCanvas.getContext("2d");
const drawingContext = drawingCanvas.getContext("2d");

let strokes = [];
let currentStroke = null;
let erasing = false;
let hasPhoto = false;

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
  event.preventDefault();
  drawingCanvas.setPointerCapture(event.pointerId);
  currentStroke = {
    mode: erasing ? "erase" : "draw",
    points: [pointFromEvent(event)],
  };
  renderStrokes();
});

drawingCanvas.addEventListener("pointermove", (event) => {
  if (!currentStroke || !drawingCanvas.hasPointerCapture(event.pointerId)) return;
  event.preventDefault();
  const events = event.getCoalescedEvents?.() ?? [event];
  for (const coalescedEvent of events) {
    currentStroke.points.push(pointFromEvent(coalescedEvent));
  }
  renderStrokes();
});

function finishStroke(event) {
  if (!currentStroke) return;
  if (drawingCanvas.hasPointerCapture(event.pointerId)) {
    drawingCanvas.releasePointerCapture(event.pointerId);
  }
  strokes.push(currentStroke);
  currentStroke = null;
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
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || "Erreur de vérification");
    resultTitle.textContent = result.mode === "openai" ? "Voici mon conseil" : "Connexion presque prête";
    resultText.textContent = result.message;
    resultDialog.showModal();
    setStatus("Devoir prêt");
  } catch (error) {
    resultText.textContent = "La feuille est prête, mais le service de vérification n’a pas répondu. Tu peux continuer à écrire et réessayer.";
    resultDialog.showModal();
    setStatus("Vérification indisponible");
    console.error(error);
  } finally {
    verifyButton.disabled = false;
  }
});

closeDialogButton.addEventListener("click", () => resultDialog.close());
resultDialog.addEventListener("click", (event) => {
  if (event.target === resultDialog) resultDialog.close();
});

updateControls();

fetch("/api/status")
  .then((response) => response.json())
  .then((configuration) => {
    setStatus(configuration.aiConfigured ? "IA connectée" : "Mode prototype");
  })
  .catch(() => setStatus("Prêt"));
