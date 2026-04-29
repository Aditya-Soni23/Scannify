document.addEventListener("DOMContentLoaded", () => {

  // --- State Management ---
  const states = {
    HOME: 'home-state',
    CAMERA: 'camera-state',
    REVIEW: 'review-state',
    PDF: 'pdf-state'
  };

  let currentState = states.HOME;

  // --- State Variables ---
  let stream = null;
  let images = [];

  // --- UI Elements ---
  const elements = {
    scanBtn: document.getElementById('scan-btn'),
    captureBtn: document.getElementById('capture-btn'),
    video: document.getElementById('video'),
    cropCanvas: document.getElementById('crop-canvas'),
    retakeBtn: document.getElementById('retake-btn'),
    nextBtn: document.getElementById('next-btn'),
    finishBtn: document.getElementById('finish-btn'),
    imageList: document.getElementById('image-list'),
    createPdfBtn: document.getElementById('create-pdf-btn'),
    backBtn: document.getElementById('back-btn')
  };

  // --- Safe State Switching ---
  function setActiveState(newState) {
    currentState = newState;

    const allStates = ['home-state', 'camera-state', 'review-state', 'pdf-state'];

    allStates.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    const activeEl = document.getElementById(newState);
    if (activeEl) {
      activeEl.classList.add('active');
    } else {
      console.error("State not found:", newState);
    }
  }

  // --- Camera Handling ---
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false
      });

      elements.video.srcObject = stream;

      // Wait for video metadata (important fix)
      await new Promise(resolve => {
        elements.video.onloadedmetadata = () => resolve();
      });

      elements.video.play();

    } catch (error) {
      console.error('Camera error:', error);
      alert('Camera permission denied or not available');
      setActiveState(states.HOME);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }

  // --- Capture + Crop ---
  function captureAndCrop() {
    const video = elements.video;

    if (!video.videoWidth) {
      alert("Camera not ready");
      return;
    }

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = video.videoWidth;
    tempCanvas.height = video.videoHeight;

    const ctx = tempCanvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // --- Simple center crop (demo) ---
    const cropFactor = 0.85;
    const w = tempCanvas.width * cropFactor;
    const h = tempCanvas.height * cropFactor;

    const x = (tempCanvas.width - w) / 2;
    const y = (tempCanvas.height - h) / 2;

    const finalCanvas = elements.cropCanvas;
    finalCanvas.width = w;
    finalCanvas.height = h;

    const fctx = finalCanvas.getContext('2d');
    fctx.drawImage(tempCanvas, x, y, w, h, 0, 0, w, h);
  }

  // --- PDF Generation ---
  function generatePdf() {
    if (images.length === 0) {
      alert('No images added');
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

    script.onload = () => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();

      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();

      images.forEach((img, i) => {
        if (i > 0) pdf.addPage();

        const margin = 10;
        pdf.addImage(img, 'PNG', margin, margin, pdfW - 2 * margin, pdfH - 2 * margin);
      });

      const blob = pdf.output('blob');
      const url = URL.createObjectURL(blob);

      window.open(url, '_blank');
    };

    document.head.appendChild(script);
  }

  // --- Render Image List ---
  function renderImageList() {
    elements.imageList.innerHTML = '';

    images.forEach((imgData, index) => {
      const div = document.createElement('div');
      div.className = 'list-item';

      const img = document.createElement('img');
      img.src = imgData;

      const remove = document.createElement('div');
      remove.className = 'remove-btn';
      remove.innerText = '×';

      remove.onclick = () => {
        images.splice(index, 1);
        renderImageList();
      };

      div.appendChild(img);
      div.appendChild(remove);
      elements.imageList.appendChild(div);
    });
  }

  // --- Events ---

  // Scan
  elements.scanBtn.addEventListener('click', async () => {
    setActiveState(states.CAMERA);
    await startCamera();
  });

  // Capture
  elements.captureBtn.addEventListener('click', () => {
    captureAndCrop();
    stopCamera();
    setActiveState(states.REVIEW);
  });

  // Retake
  elements.retakeBtn.addEventListener('click', async () => {
    setActiveState(states.CAMERA);
    await startCamera();
  });

  // Next
  elements.nextBtn.addEventListener('click', async () => {
    const imgData = elements.cropCanvas.toDataURL('image/png');
    images.push(imgData);

    setActiveState(states.CAMERA);
    await startCamera();
  });

  // Finish
  elements.finishBtn.addEventListener('click', () => {
    const imgData = elements.cropCanvas.toDataURL('image/png');
    images.push(imgData);

    renderImageList();
    setActiveState(states.PDF);
  });

  // Back
  elements.backBtn.addEventListener('click', () => {
    images = [];
    setActiveState(states.HOME);
  });

  // Create PDF
  elements.createPdfBtn.addEventListener('click', generatePdf);

});