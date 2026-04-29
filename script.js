document.addEventListener("DOMContentLoaded", () => {

  const states = {
    HOME: 'home-state',
    CAMERA: 'camera-state',
    REVIEW: 'review-state',
    PDF: 'pdf-state'
  };

  let currentState = states.HOME;
  let stream = null;
  let images = [];
  let cropPoints = [];
  let draggingPoint = null;

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

  // ---------- STATE ----------
  function setActiveState(newState) {
    ['home-state','camera-state','review-state','pdf-state'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('active');
    });

    const activeEl = document.getElementById(newState);
    if (activeEl) activeEl.classList.add('active');
  }

  // ---------- CAMERA ----------
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      elements.video.srcObject = stream;

      await new Promise(res => {
        elements.video.onloadedmetadata = res;
      });

      elements.video.play();

    } catch (err) {
      alert("Camera error");
      console.error(err);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
  }

  // ---------- CAPTURE ----------
  function captureFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = elements.video.videoWidth;
    canvas.height = elements.video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(elements.video, 0, 0);

    return canvas;
  }

  // ---------- AUTO DETECT ----------
  function autoDetect(canvas) {
    if (typeof cv === 'undefined') {
      console.warn("OpenCV not loaded");
      return;
    }

    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let edges = new cv.Mat();
    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5,5), 0);
    cv.Canny(gray, edges, 75, 200);

    cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let biggest = null;
    let maxArea = 0;

    for (let i = 0; i < contours.size(); i++) {
      let cnt = contours.get(i);
      let area = cv.contourArea(cnt);

      if (area > 1000) {
        let peri = cv.arcLength(cnt, true);
        let approx = new cv.Mat();
        cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

        if (approx.rows === 4 && area > maxArea) {
          biggest = approx;
          maxArea = area;
        }
      }
    }

    if (biggest) {
      cropPoints = [];

      for (let i = 0; i < 4; i++) {
        cropPoints.push({
          x: biggest.intPtr(i,0)[0],
          y: biggest.intPtr(i,0)[1]
        });
      }
    } else {
      // fallback (center rectangle)
      cropPoints = [
        {x:50,y:50},
        {x:canvas.width-50,y:50},
        {x:canvas.width-50,y:canvas.height-50},
        {x:50,y:canvas.height-50}
      ];
    }

    src.delete(); gray.delete(); edges.delete();
    contours.delete(); hierarchy.delete();
  }

  // ---------- DRAW ----------
  function drawCanvas(baseCanvas) {
    const canvas = elements.cropCanvas;
    canvas.width = baseCanvas.width;
    canvas.height = baseCanvas.height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(baseCanvas, 0, 0);

    ctx.strokeStyle = "lime";
    ctx.lineWidth = 3;

    ctx.beginPath();
    ctx.moveTo(cropPoints[0].x, cropPoints[0].y);
    for (let i=1;i<4;i++){
      ctx.lineTo(cropPoints[i].x, cropPoints[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    cropPoints.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x,p.y,8,0,2*Math.PI);
      ctx.fillStyle="red";
      ctx.fill();
    });
  }

  // ---------- DRAG ----------
  elements.cropCanvas.addEventListener('mousedown', e => {
    const rect = elements.cropCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    cropPoints.forEach((p,i)=>{
      if (Math.hypot(p.x-x,p.y-y)<15) draggingPoint=i;
    });
  });

  elements.cropCanvas.addEventListener('mousemove', e => {
    if (draggingPoint!==null) {
      const rect = elements.cropCanvas.getBoundingClientRect();
      cropPoints[draggingPoint].x = e.clientX - rect.left;
      cropPoints[draggingPoint].y = e.clientY - rect.top;

      drawCanvas(currentCaptured);
    }
  });

  window.addEventListener('mouseup', ()=> draggingPoint=null);

  let currentCaptured = null;

  // ---------- FINAL CROP ----------
  function getCroppedImage() {
    const src = currentCaptured;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // simple bounding box crop (can upgrade to perspective later)
    const xs = cropPoints.map(p=>p.x);
    const ys = cropPoints.map(p=>p.y);

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const w = maxX-minX;
    const h = maxY-minY;

    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(src, minX, minY, w, h, 0, 0, w, h);

    return canvas.toDataURL("image/png");
  }

  // ---------- PDF ----------
  function generatePdf() {
    if (!images.length) return alert("No images");

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';

    script.onload = () => {
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF();

      images.forEach((img,i)=>{
        if (i>0) pdf.addPage();
        pdf.addImage(img,'PNG',10,10,180,260);
      });

      pdf.save("scanify.pdf");
    };

    document.head.appendChild(script);
  }

  // ---------- EVENTS ----------
  elements.scanBtn.onclick = async ()=>{
    setActiveState(states.CAMERA);
    await startCamera();
  };

  elements.captureBtn.onclick = ()=>{
    currentCaptured = captureFrame();
    autoDetect(currentCaptured);
    drawCanvas(currentCaptured);

    stopCamera();
    setActiveState(states.REVIEW);
  };

  elements.retakeBtn.onclick = async ()=>{
    setActiveState(states.CAMERA);
    await startCamera();
  };

  elements.nextBtn.onclick = async ()=>{
    images.push(getCroppedImage());
    setActiveState(states.CAMERA);
    await startCamera();
  };

  elements.finishBtn.onclick = ()=>{
    images.push(getCroppedImage());
    renderList();
    setActiveState(states.PDF);
  };

  elements.backBtn.onclick = ()=>{
    images=[];
    setActiveState(states.HOME);
  };

  elements.createPdfBtn.onclick = generatePdf;

  // ---------- RENDER ----------
  function renderList() {
    elements.imageList.innerHTML = '';

    images.forEach((img,i)=>{
      const div=document.createElement('div');
      div.className='list-item';

      const image=document.createElement('img');
      image.src=img;

      const remove=document.createElement('div');
      remove.className='remove-btn';
      remove.innerText='×';

      remove.onclick=()=>{
        images.splice(i,1);
        renderList();
      };

      div.appendChild(image);
      div.appendChild(remove);
      elements.imageList.appendChild(div);
    });
  }

});