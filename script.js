const state = {
  pages: [],
  currentStream: null,
  rawImage: null, // HTMLImageElement
  corners: [], // [{x, y}, ...]
};

// UI Elements
const screens = document.querySelectorAll('.screen');
const loader = document.getElementById('loader');
const editorCanvas = document.getElementById('editor-canvas');

// --- Navigation ---
function showScreen(id) {
  screens.forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// --- Camera Logic ---
document.getElementById('btn-start-scan').onclick = async () => {
  try {
      state.currentStream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: "environment" }, 
          audio: false 
      });
      document.getElementById('camera-feed').srcObject = state.currentStream;
      showScreen('screen-camera');
  } catch (err) {
      alert("Camera access denied or not available.");
  }
};

document.getElementById('btn-capture').onclick = () => {
  const video = document.getElementById('camera-feed');
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  
  // Stop camera
  state.currentStream.getTracks().forEach(t => t.stop());
  
  processCapturedImage(canvas.toDataURL('image/jpeg'));
};

// --- Image Processing & Auto Edge Detection ---
function processCapturedImage(dataUrl) {
  loader.classList.remove('hidden');
  const img = new Image();
  img.onload = () => {
      state.rawImage = img;
      detectEdges(img);
      renderEditor();
      loader.classList.add('hidden');
      showScreen('screen-editor');
  };
  img.src = dataUrl;
}

function detectEdges(img) {
  // Basic auto-detection using OpenCV.js
  // If OpenCV is loaded, we attempt to find the largest contour
  try {
      let src = cv.imread(img);
      let gray = new cv.Mat();
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
      cv.Canny(gray, gray, 75, 200);
      
      let contours = new cv.MatVector();
      let hierarchy = new cv.Mat();
      cv.findContours(gray, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      // Logic to find the largest 4-sided polygon would go here
      // Fallback: Default margins (Smart Crop simulation)
      const w = img.width;
      const h = img.height;
      state.corners = [
          {x: w*0.1, y: h*0.1}, {x: w*0.9, y: h*0.1},
          {x: w*0.9, y: h*0.9}, {x: w*0.1, y: h*0.9}
      ];

      src.delete(); gray.delete(); contours.delete(); hierarchy.delete();
  } catch (e) {
      console.error("OpenCV not ready or error:", e);
      // Fallback crop
      state.corners = [{x:50,y:50}, {x:img.width-50,y:50}, {x:img.width-50,y:img.height-50}, {x:50,y:img.height-50}];
  }
}

// --- Manual Cropping UI ---
function renderEditor() {
  const ctx = editorCanvas.getContext('2d');
  editorCanvas.width = state.rawImage.width;
  editorCanvas.height = state.rawImage.height;
  ctx.drawImage(state.rawImage, 0, 0);
  
  // Position physical handles based on canvas size/display
  updateHandlePositions();
}

function updateHandlePositions() {
  const rect = editorCanvas.getBoundingClientRect();
  const scaleX = rect.width / editorCanvas.width;
  const scaleY = rect.height / editorCanvas.height;
  
  const ids = ['h-tl', 'h-tr', 'h-br', 'h-bl'];
  state.corners.forEach((c, i) => {
      const el = document.getElementById(ids[i]);
      el.style.left = (c.x * scaleX + editorCanvas.offsetLeft) + 'px';
      el.style.top = (c.y * scaleY + editorCanvas.offsetTop) + 'px';
      
      // Simple drag logic (for brevity, desktop mouse + touch)
      el.onpointermove = (e) => {
          if (e.buttons !== 1) return;
          const containerRect = editorCanvas.parentElement.getBoundingClientRect();
          c.x = (e.clientX - containerRect.left) / scaleX;
          c.y = (e.clientY - containerRect.top) / scaleY;
          updateHandlePositions();
          drawCropLines();
      };
  });
}

function drawCropLines() {
  const ctx = editorCanvas.getContext('2d');
  ctx.clearRect(0,0, editorCanvas.width, editorCanvas.height);
  ctx.drawImage(state.rawImage, 0, 0);
  ctx.strokeStyle = "#3d5afe";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(state.corners[0].x, state.corners[0].y);
  state.corners.forEach(c => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.stroke();
}

// --- Apply Perspective & Save ---
document.getElementById('btn-apply-crop').onclick = () => {
  // In a full implementation, use cv.getPerspectiveTransform here.
  // For this version, we'll draw the cropped canvas to the review list.
  const finalCanvas = document.createElement('canvas');
  finalCanvas.width = 800; // Standardize page size
  finalCanvas.height = 1100;
  
  // Simulate processed image
  const ctx = finalCanvas.getContext('2d');
  ctx.filter = 'contrast(1.2) brightness(1.1)'; // Simple "Magic Color" filter
  ctx.drawImage(state.rawImage, 0, 0, finalCanvas.width, finalCanvas.height);
  
  state.pages.push(finalCanvas.toDataURL('image/jpeg', 0.8));
  renderReviewGrid();
  showScreen('screen-review');
};

function renderReviewGrid() {
  const grid = document.getElementById('pages-grid');
  grid.innerHTML = '';
  state.pages.forEach((p, i) => {
      const div = document.createElement('div');
      div.className = 'page-thumb';
      div.innerHTML = `<img src="${p}"><button class="delete-btn" onclick="deletePage(${i})">✕</button>`;
      grid.appendChild(div);
  });
}

window.deletePage = (i) => {
  state.pages.splice(i, 1);
  renderReviewGrid();
};

document.getElementById('btn-add-page').onclick = () => {
  document.getElementById('btn-start-scan').click();
};

// --- PDF Generation & Sharing ---
document.getElementById('btn-finish').onclick = async () => {
  if (state.pages.length === 0) return;
  loader.classList.remove('hidden');

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();

  state.pages.forEach((data, i) => {
      if (i > 0) doc.addPage();
      doc.addImage(data, 'JPEG', 0, 0, width, height);
  });

  const pdfBlob = doc.output('blob');
  const file = new File([pdfBlob], "Scanify_Document.pdf", { type: "application/pdf" });

  loader.classList.add('hidden');

  if (navigator.share) {
      try {
          await navigator.share({
              files: [file],
              title: 'Scanify Document',
              text: 'Check out my scanned document!'
          });
      } catch (e) {
          doc.save('Scanify_Document.pdf');
      }
  } else {
      doc.save('Scanify_Document.pdf');
  }
};