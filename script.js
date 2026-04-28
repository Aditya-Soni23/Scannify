// SCREEN MANAGEMENT
const screens = {
    home: document.getElementById("home"),
    camera: document.getElementById("cameraScreen"),
    crop: document.getElementById("cropScreen"),
    pages: document.getElementById("pagesScreen")
  };
  
  function show(screen) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screen.classList.add("active");
  }
  
  // ELEMENTS
  const video = document.getElementById("video");
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  
  let stream = null;
  let pages = [];
  
  // =======================
  // 📷 START CAMERA
  // =======================
  async function startCamera() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false
      });
  
      video.srcObject = stream;
    } catch (err) {
      console.error(err);
      alert("Camera permission denied or not available.");
    }
  }
  
  // =======================
  // 🛑 STOP CAMERA
  // =======================
  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      stream = null;
    }
  }
  
  // =======================
  // SCAN BUTTON
  // =======================
  document.getElementById("scanBtn").onclick = async () => {
    show(screens.camera);
    await startCamera();
  };
  
  // =======================
  // 📸 CAPTURE IMAGE
  // =======================
  document.getElementById("captureBtn").onclick = () => {
    if (!video.videoWidth) {
      alert("Camera not ready yet!");
      return;
    }
  
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  
    ctx.drawImage(video, 0, 0);
  
    stopCamera();
  
    detectDocument(); // process image
    show(screens.crop);
  };
  
  // =======================
  // 🧠 DOCUMENT DETECTION
  // =======================
  function detectDocument() {
    // ⚠️ NO CAMERA CODE HERE
  
    try {
      if (typeof cv === "undefined") {
        console.log("OpenCV not loaded yet");
        return;
      }
  
      let src = cv.imread(canvas);
      let gray = new cv.Mat();
      let edges = new cv.Mat();
  
      // Convert to grayscale
      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
  
      // Edge detection
      cv.Canny(gray, edges, 50, 150);
  
      // Show result (for now)
      cv.imshow(canvas, edges);
  
      src.delete();
      gray.delete();
      edges.delete();
  
    } catch (e) {
      console.log("Detection failed, using original image");
    }
  }
  
  // =======================
  // 🔄 RETAKE
  // =======================
  document.getElementById("retakeBtn").onclick = async () => {
    show(screens.camera);
    await startCamera();
  };
  
  // =======================
  // ✅ CONFIRM PAGE
  // =======================
  document.getElementById("confirmBtn").onclick = () => {
    pages.push(canvas.toDataURL("image/jpeg", 0.7));
    renderPages();
    show(screens.pages);
  };
  
  // =======================
  // 🖼 RENDER PAGES
  // =======================
  function renderPages() {
    const container = document.getElementById("pagesContainer");
    container.innerHTML = "";
  
    pages.forEach((p, i) => {
      let img = document.createElement("img");
      img.src = p;
      img.className = "page-thumb";
  
      img.onclick = () => {
        if (confirm("Delete this page?")) {
          pages.splice(i, 1);
          renderPages();
        }
      };
  
      container.appendChild(img);
    });
  }
  
  // =======================
  // ➕ ADD PAGE
  // =======================
  document.getElementById("addPageBtn").onclick = async () => {
    show(screens.camera);
    await startCamera();
  };
  
  // =======================
  // 📄 GENERATE PDF
  // =======================
  document.getElementById("finishBtn").onclick = () => {
    if (pages.length === 0) {
      alert("No pages to export!");
      return;
    }
  
    const { jsPDF } = window.jspdf;
    let pdf = new jsPDF();
  
    pages.forEach((img, i) => {
      if (i > 0) pdf.addPage();
      pdf.addImage(img, "JPEG", 0, 0, 210, 297);
    });
  
    pdf.save("scanify.pdf");
  };
  
  // =======================
  // ⚙️ PWA
  // =======================
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js');
  }