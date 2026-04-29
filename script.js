document.addEventListener("DOMContentLoaded", () => {
  window.cvReady = window.cvReady || false;

  const states = { HOME: 'home-state', CAMERA: 'camera-state', REVIEW: 'review-state', PDF: 'pdf-state' };
  let stream = null;
  let images = [];
  let cropPoints = [];
  let draggingPoint = null;
  let currentCaptured = null;

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

  // --- GSAP ANIMATED STATE SWITCHER ---
  function setActiveState(newState) {
      const currentActive = document.querySelector('.state.active');
      const target = document.getElementById(newState);

      if (currentActive) {
          gsap.to(currentActive, { opacity: 0, y: -20, duration: 0.3, onComplete: () => {
              currentActive.classList.remove('active');
              gsap.set(target, { opacity: 0, y: 20 });
              target.classList.add('active');
              gsap.to(target, { opacity: 1, y: 0, duration: 0.4, ease: "power2.out" });
          }});
      } else {
          target.classList.add('active');
      }
  }

  async function startCamera() {
      try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
          elements.video.srcObject = stream;
          await new Promise(res => elements.video.onloadedmetadata = res);
          elements.video.play();
      } catch (err) { alert("Camera Permission Required"); }
  }

  function stopCamera() {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }

  function captureFrame() {
      const canvas = document.createElement('canvas');
      canvas.width = elements.video.videoWidth;
      canvas.height = elements.video.videoHeight;
      canvas.getContext('2d').drawImage(elements.video, 0, 0);
      return canvas;
  }

  // --- OPENCV LOGIC (KEPT YOUR REPAIRED VERSION) ---
  function orderPoints(pts) {
      pts.sort((a, b) => a.y - b.y);
      let top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
      let bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
      return [top[0], top[1], bottom[1], bottom[0]];
  }

  function autoDetect(canvas) {
      const w = canvas.width, h = canvas.height;
      cropPoints = [{x: w*0.1, y: h*0.1}, {x: w*0.9, y: h*0.1}, {x: w*0.9, y: h*0.9}, {x: w*0.1, y: h*0.9}];

      if (!window.cvReady || typeof cv === 'undefined') return;

      try {
          let src = cv.imread(canvas), gray = new cv.Mat(), blur = new cv.Mat(), edges = new cv.Mat();
          let contours = new cv.MatVector(), hierarchy = new cv.Mat();

          cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
          cv.GaussianBlur(gray, blur, new cv.Size(5,5), 0);
          cv.Canny(blur, edges, 75, 200);
          cv.findContours(edges, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

          let maxArea = 0, best = null;
          for (let i = 0; i < contours.size(); i++) {
              let cnt = contours.get(i), area = cv.contourArea(cnt);
              if (area < 15000) continue;
              let peri = cv.arcLength(cnt, true), approx = new cv.Mat();
              cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
              if (approx.rows === 4 && cv.isContourConvex(approx)) {
                  if (area > maxArea) { best = approx; maxArea = area; }
              }
          }
          if (best) {
              let pts = [];
              for (let i = 0; i < 4; i++) pts.push({ x: best.intPtr(i,0)[0], y: best.intPtr(i,0)[1] });
              cropPoints = orderPoints(pts);
          }
          src.delete(); gray.delete(); blur.delete(); edges.delete(); contours.delete(); hierarchy.delete();
      } catch (e) { console.warn("OpenCV Error, using fallback"); }
  }

  function drawCanvas(baseCanvas) {
      const canvas = elements.cropCanvas;
      canvas.width = baseCanvas.width;
      canvas.height = baseCanvas.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(baseCanvas, 0, 0);

      ctx.fillStyle = "rgba(99, 102, 241, 0.3)";
      ctx.beginPath();
      ctx.moveTo(cropPoints[0].x, cropPoints[0].y);
      cropPoints.forEach(p => ctx.lineTo(p.x,p.y));
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#6366f1";
      ctx.lineWidth = 6;
      ctx.stroke();

      cropPoints.forEach(p => {
          ctx.beginPath();
          ctx.arc(p.x, p.y, 15, 0, 2*Math.PI);
          ctx.fillStyle = "#fff";
          ctx.fill();
          ctx.stroke();
      });
  }

  // --- INTERACTION LOGIC ---
  function getPos(e) {
      const rect = elements.cropCanvas.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const scaleX = elements.cropCanvas.width / rect.width;
      const scaleY = elements.cropCanvas.height / rect.height;
      return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  const startDrag = (e) => {
      const pos = getPos(e);
      cropPoints.forEach((p,i) => {
          if (Math.hypot(p.x-pos.x, p.y-pos.y) < 40) draggingPoint = i;
      });
  };

  const moveDrag = (e) => {
      if (draggingPoint === null) return;
      e.preventDefault();
      const pos = getPos(e);
      cropPoints[draggingPoint] = pos;
      drawCanvas(currentCaptured);
  };

  elements.cropCanvas.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', () => draggingPoint = null);
  elements.cropCanvas.addEventListener('touchstart', startDrag);
  elements.cropCanvas.addEventListener('touchmove', moveDrag);
  elements.cropCanvas.addEventListener('touchend', () => draggingPoint = null);

  function getCroppedImage() {
      const xs = cropPoints.map(p=>p.x), ys = cropPoints.map(p=>p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const w = maxX-minX, h = maxY-minY;
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(currentCaptured, minX, minY, w, h, 0, 0, w, h);
      return canvas.toDataURL("image/png");
  }

  function renderList() {
      elements.imageList.innerHTML = '';
      images.forEach((img,i)=>{
          const div = document.createElement('div');
          div.className = 'list-item';
          div.innerHTML = `<img src="${img}"><div class="remove-btn" data-index="${i}">✕</div>`;
          div.querySelector('.remove-btn').onclick = () => {
              images.splice(i, 1);
              renderList();
          };
          elements.imageList.appendChild(div);
      });
  }

  // --- EVENT HANDLERS ---
  elements.scanBtn.onclick = async () => {
      setActiveState(states.CAMERA);
      await startCamera();
  };

  elements.captureBtn.onclick = () => {
      currentCaptured = captureFrame();
      autoDetect(currentCaptured);
      drawCanvas(currentCaptured);
      stopCamera();
      setActiveState(states.REVIEW);
  };

  elements.retakeBtn.onclick = async () => {
      setActiveState(states.CAMERA);
      await startCamera();
  };

  elements.nextBtn.onclick = async () => {
      images.push(getCroppedImage());
      setActiveState(states.CAMERA);
      await startCamera();
  };

  elements.finishBtn.onclick = () => {
      images.push(getCroppedImage());
      renderList();
      setActiveState(states.PDF);
  };

  elements.backBtn.onclick = () => {
      images = [];
      setActiveState(states.HOME);
  };

  elements.createPdfBtn.onclick = () => {
    if (!images.length) return alert("No images to save!");

    // UI Feedback
    const originalText = elements.createPdfBtn.innerText;
    elements.createPdfBtn.innerText = "Generating...";
    elements.createPdfBtn.disabled = true;

    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    
    script.onload = async () => {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF();
        
        images.forEach((img, i) => {
            if(i > 0) pdf.addPage();
            pdf.addImage(img, 'PNG', 10, 10, 190, 277);
        });

        const fileName = `Scanify_${Date.now()}.pdf`;

        // --- 1. FORCE AUTOMATIC DOWNLOAD ---
        // This ensures the user has a copy "right though" regardless of sharing
        pdf.save(fileName);

        // --- 2. TRIGGER WHATSAPP/SYSTEM SHARE ---
        try {
            const pdfBlob = pdf.output('blob');
            const file = new File([pdfBlob], fileName, { type: "application/pdf" });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Your Scan',
                    text: 'Scanned with Scanify Pro',
                });
            } else {
                console.log("Web Share not supported on this device/browser.");
            }
        } catch (err) {
            // User likely cancelled the share sheet, which is fine since we already downloaded it
            console.log("Share sheet dismissed.");
        }

        // Reset UI
        elements.createPdfBtn.innerText = originalText;
        elements.createPdfBtn.disabled = false;
    };

    document.head.appendChild(script);
};
});