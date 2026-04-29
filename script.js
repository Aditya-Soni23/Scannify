// script.js
document.addEventListener("DOMContentLoaded", () => {
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

  function setActiveState(newState) {
      document.querySelectorAll('.state').forEach(el => {
          el.classList.remove('active');
          setTimeout(() => { if(el.id === newState) el.classList.add('active'); }, 50);
      });
  }

  async function startCamera() {
      try {
          stream = await navigator.mediaDevices.getUserMedia({
              video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
          });
          elements.video.srcObject = stream;
          elements.video.play();
      } catch (err) {
          console.error("Camera access denied");
      }
  }

  function captureFrame() {
      const canvas = document.createElement('canvas');
      canvas.width = elements.video.videoWidth;
      canvas.height = elements.video.videoHeight;
      canvas.getContext('2d').drawImage(elements.video, 0, 0);
      return canvas;
  }

  // Advanced Point Ordering
  function orderPoints(pts) {
      const center = pts.reduce((acc, p) => ({ x: acc.x + p.x/4, y: acc.y + p.y/4 }), { x: 0, y: 0 });
      const sorted = [...pts].sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
      return sorted;
  }

  function autoDetect(canvas) {
      const w = canvas.width, h = canvas.height;
      cropPoints = [{x: w*0.2, y: h*0.2}, {x: w*0.8, y: h*0.2}, {x: w*0.8, y: h*0.8}, {x: w*0.2, y: h*0.8}];

      if (typeof cv !== 'undefined') {
          try {
              let src = cv.imread(canvas);
              let dst = new cv.Mat();
              cv.cvtColor(src, dst, cv.COLOR_RGBA2GRAY);
              cv.Canny(dst, dst, 50, 150);
              let contours = new cv.MatVector();
              let hierarchy = new cv.Mat();
              cv.findContours(dst, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

              let maxArea = 0, bestCnt = null;
              for (let i = 0; i < contours.size(); i++) {
                  let cnt = contours.get(i);
                  let area = cv.contourArea(cnt);
                  if (area > maxArea) {
                      let peri = cv.arcLength(cnt, true);
                      let approx = new cv.Mat();
                      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);
                      if (approx.rows === 4) {
                          maxArea = area;
                          bestCnt = approx;
                      }
                  }
              }

              if (bestCnt) {
                  let pts = [];
                  for (let i = 0; i < 4; i++) {
                      pts.push({ x: bestCnt.data32S[i * 2], y: bestCnt.data32S[i * 2 + 1] });
                  }
                  cropPoints = orderPoints(pts);
              }
              src.delete(); dst.delete(); contours.delete(); hierarchy.delete();
          } catch (e) { console.log("CV logic error"); }
      }
  }

  function drawUI() {
      const ctx = elements.cropCanvas.getContext('2d');
      elements.cropCanvas.width = currentCaptured.width;
      elements.cropCanvas.height = currentCaptured.height;
      ctx.drawImage(currentCaptured, 0, 0);

      // Draw tactical overlay
      ctx.strokeStyle = '#00f2ff';
      ctx.lineWidth = 6;
      ctx.fillStyle = 'rgba(0, 242, 255, 0.2)';
      ctx.beginPath();
      ctx.moveTo(cropPoints[0].x, cropPoints[0].y);
      cropPoints.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      cropPoints.forEach(p => {
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
          ctx.fill();
      });
  }

  // Touch/Mouse interactions for dragging
  const handleMove = (e) => {
      if (draggingPoint === null) return;
      const rect = elements.cropCanvas.getBoundingClientRect();
      const scaleX = elements.cropCanvas.width / rect.width;
      const scaleY = elements.cropCanvas.height / rect.height;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      cropPoints[draggingPoint] = {
          x: (clientX - rect.left) * scaleX,
          y: (clientY - rect.top) * scaleY
      };
      drawUI();
  };

  elements.cropCanvas.onmousedown = (e) => {
      const rect = elements.cropCanvas.getBoundingClientRect();
      const scaleX = elements.cropCanvas.width / rect.width;
      const scaleY = elements.cropCanvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      cropPoints.forEach((p, i) => {
          if (Math.hypot(p.x - x, p.y - y) < 40) draggingPoint = i;
      });
  };

  window.onmousemove = handleMove;
  window.onmouseup = () => draggingPoint = null;
  elements.cropCanvas.ontouchstart = (e) => elements.cropCanvas.onmousedown(e.touches[0]);
  elements.cropCanvas.ontouchmove = handleMove;
  elements.cropCanvas.ontouchend = () => draggingPoint = null;

  // Navigation & Logic
  elements.scanBtn.onclick = () => { setActiveState(states.CAMERA); startCamera(); };
  
  elements.captureBtn.onclick = () => {
      currentCaptured = captureFrame();
      autoDetect(currentCaptured);
      drawUI();
      if(stream) stream.getTracks().forEach(t => t.stop());
      setActiveState(states.REVIEW);
  };

  elements.nextBtn.onclick = () => {
      images.push(elements.cropCanvas.toDataURL());
      setActiveState(states.CAMERA);
      startCamera();
  };

  elements.finishBtn.onclick = () => {
      images.push(elements.cropCanvas.toDataURL());
      renderList();
      setActiveState(states.PDF);
  };

  function renderList() {
      elements.imageList.innerHTML = '';
      images.forEach((img, i) => {
          const item = document.createElement('div');
          item.className = 'list-item';
          item.innerHTML = `<img src="${img}"><div class="remove-btn" onclick="removeImage(${i})">×</div>`;
          elements.imageList.appendChild(item);
      });
  }

  window.removeImage = (i) => { images.splice(i, 1); renderList(); };

  elements.createPdfBtn.onclick = () => {
      const { jsPDF } = window.jspdf || { jsPDF: null };
      if (!jsPDF) {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = () => elements.createPdfBtn.click();
          document.head.appendChild(s);
          return;
      }
      const doc = new jsPDF();
      images.forEach((img, i) => {
          if (i > 0) doc.addPage();
          doc.addImage(img, 'PNG', 10, 10, 190, 277);
      });
      doc.save("Diamond_Scan.pdf");
  };
});