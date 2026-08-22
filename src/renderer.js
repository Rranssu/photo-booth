/** ---------------- ELEMENT SELECTORS ---------------- **/
const video = document.getElementById('video');
const overlay = document.getElementById('overlay');
const ctx = overlay.getContext('2d');
const captureBtn = document.getElementById('capture-btn');
const countdownEl = document.getElementById('countdown');
const effectsToggle = document.getElementById('effects-toggle');
const effectsDrawer = document.getElementById('effects-drawer');

const btnGrid = document.getElementById('btn-mode-grid');
const btnPhoto = document.getElementById('btn-mode-photo');
const btnVideo = document.getElementById('btn-mode-video');

const cameraView = document.getElementById('camera-view');
const reviewView = document.getElementById('review-view');
const filmstripContainer = document.getElementById('filmstrip-container');
const largePhotoDisplay = document.getElementById('large-photo-display');
const filmstripTrack = document.getElementById('filmstrip-track');

const recordingIndicator = document.getElementById('recording-indicator');
const videoTimer = document.getElementById('video-timer');

/** ---------------- APP STATE ---------------- **/
let currentEffect = 'normal';
let appMode = 'photo';
let modelsLoaded = false;
let displaySize = { width: 0, height: 0 };
let latestDetections = [];
let hearts = [];

// Gallery State
let allMediaFiles = [];
let currentIndex = 0;

// Recording State
let mediaRecorder;
let recordedChunks = [];
let isRecording = false;
let timerInterval;
let secondsElapsed = 0;

/** ---------------- CAMERA & AI INIT ---------------- **/
async function init() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: 1280, height: 720 }, 
            audio: true 
        });
        
        // FIX: Mute the video preview to prevent microphone feedback/echo
        video.muted = true; 
        
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            video.play();
            updateCanvasSize();
            loadFaceModels();
        };
    } catch (err) { console.error(err); }
}

async function loadFaceModels() {
    const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
        modelsLoaded = true;
        detectFaces();
        renderLoop();
    } catch (e) { console.error(e); }
}

function updateCanvasSize() {
    displaySize = { 
        width: video.clientWidth || video.videoWidth, 
        height: video.clientHeight || video.videoHeight 
    };
    
    if (displaySize.width === 0 || displaySize.height === 0) return;
    
    overlay.width = displaySize.width;
    overlay.height = displaySize.height;
    if (modelsLoaded) faceapi.matchDimensions(overlay, displaySize);
}
window.onresize = updateCanvasSize;

async function detectFaces() {
    if (modelsLoaded && video.readyState >= 2 && appMode !== 'review' && appMode !== 'grid') {
        const detections = await faceapi.detectAllFaces(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }));
        latestDetections = faceapi.resizeResults(detections, displaySize);
    }
    setTimeout(detectFaces, 100);
}

function spawnHearts(cx, cy) {
    if (Math.random() > 0.85) {
        hearts.push({ x: cx + (Math.random() - 0.5) * 80, y: cy, size: 15 + Math.random() * 20, life: 1.0, wobble: Math.random() * 10 });
    }
}

function drawHearts() {
    ctx.fillStyle = 'rgba(255, 105, 180, 0.9)';
    for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i];
        const x = h.x + Math.sin(h.life * 8 + h.wobble) * 15;
        const y = h.y - (1 - h.life) * 150;
        const size = h.size * h.life;
        ctx.beginPath();
        ctx.moveTo(x, y + size * 0.3);
        ctx.bezierCurveTo(x, y, x - size, y, x - size, y + size * 0.3);
        ctx.bezierCurveTo(x - size, y + size * 0.8, x, y + size * 1.2, x, y + size * 1.6);
        ctx.bezierCurveTo(x, y + size * 1.2, x + size, y + size * 0.8, x + size, y + size * 0.3);
        ctx.bezierCurveTo(x + size, y, x, y, x, y + size * 0.3);
        ctx.fill();
        h.life -= 0.015;
        if (h.life <= 0) hearts.splice(i, 1);
    }
}

function renderLoop() {
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (currentEffect === 'lovestruck' && modelsLoaded && (appMode === 'photo' || appMode === 'video')) {
        latestDetections.slice(0, 2).forEach(det => {
            const { x, y, width } = det.box;
            spawnHearts(x + width / 2, y - 20);
        });
    }
    drawHearts();
    requestAnimationFrame(renderLoop);
}

/** ---------------- GALLERY & REVIEW LOGIC ---------------- **/
async function loadFilmstrip() {
    filmstripTrack.innerHTML = '';
    allMediaFiles = await window.api.getPhotos();
    
    if (allMediaFiles.length === 0) return;

    allMediaFiles.forEach((filePath, index) => {
        const item = document.createElement('div');
        item.className = 'strip-item' + (index === currentIndex ? ' active' : '');
        
        if (filePath.toLowerCase().endsWith('.webm')) {
            item.innerHTML = `<video src="file://${filePath}" muted></video>`;
        } else {
            item.style.backgroundImage = `url('file://${filePath}')`;
        }

        item.onclick = () => {
            currentIndex = index;
            updateReviewDisplay();
        };
        filmstripTrack.appendChild(item);
    });

    const activeItem = filmstripTrack.children[currentIndex];
    if (activeItem) {
        activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
}

function updateReviewDisplay() {
    const filePath = allMediaFiles[currentIndex];
    if (!filePath) return;

    largePhotoDisplay.classList.add('hidden');
    let revVideo = reviewView.querySelector('.review-video');
    if (revVideo) revVideo.remove();

    if (filePath.toLowerCase().endsWith('.webm')) {
        const videoEl = document.createElement('video');
        videoEl.className = 'review-video';
        videoEl.src = `file://${filePath}`;
        videoEl.controls = true;
        videoEl.autoplay = true;
        reviewView.appendChild(videoEl);
    } else {
        largePhotoDisplay.src = `file://${filePath}`;
        largePhotoDisplay.classList.remove('hidden');
    }

    loadFilmstrip();
}

/** ---------------- MODE SWITCHING ---------------- **/
async function setMode(mode) {
    if (isRecording) stopRecording();
    appMode = mode;

    [btnGrid, btnPhoto, btnVideo].forEach(b => b.classList.remove('active'));
    document.body.className = `mode-${mode}`;

    cameraView.classList.add('hidden');
    reviewView.classList.add('hidden');
    filmstripContainer.classList.add('hidden');

    if (mode === 'grid') {
        btnGrid.classList.add('active');
        allMediaFiles = await window.api.getPhotos();
        if (allMediaFiles.length > 0) {
            currentIndex = 0;
            appMode = 'review';
            reviewView.classList.remove('hidden');
            filmstripContainer.classList.remove('hidden');
            updateReviewDisplay();
        } else {
            setMode('photo');
        }
    } else {
        cameraView.classList.remove('hidden');
        if (mode === 'photo') btnPhoto.classList.add('active');
        if (mode === 'video') btnVideo.classList.add('active');
        updateCanvasSize();
    }
}

window.addEventListener('keydown', (e) => {
    if (appMode !== 'review') return;

    if (e.key === 'ArrowRight') {
        if (currentIndex < allMediaFiles.length - 1) {
            currentIndex++;
            updateReviewDisplay();
        }
    } else if (e.key === 'ArrowLeft') {
        if (currentIndex > 0) {
            currentIndex--;
            updateReviewDisplay();
        }
    }
});

btnGrid.onclick = () => setMode('grid');
btnPhoto.onclick = () => setMode('photo');
btnVideo.onclick = () => setMode('video');

/** ---------------- CAPTURE / RECORDING ---------------- **/
captureBtn.onclick = () => {
    if (appMode === 'photo') startCountdown();
    else if (appMode === 'video') {
        if (isRecording) stopRecording();
        else startRecording();
    }
};

function startCountdown() {
    let count = 3;
    countdownEl.classList.remove('hidden');
    countdownEl.innerText = count;
    const t = setInterval(() => {
        count--;
        if (count > 0) countdownEl.innerText = count;
        else { clearInterval(t); countdownEl.classList.add('hidden'); takePhoto(); }
    }, 1000);
}

const compositingCanvas = document.createElement('canvas');
const compositingCtx = compositingCanvas.getContext('2d');

function getCompositedCanvas() {
    if (compositingCanvas.width !== video.videoWidth || compositingCanvas.height !== video.videoHeight) {
        compositingCanvas.width = video.videoWidth; 
        compositingCanvas.height = video.videoHeight;
    }
    
    compositingCtx.save();
    compositingCtx.clearRect(0, 0, compositingCanvas.width, compositingCanvas.height);
    
    if (currentEffect === 'mirrored') { 
        compositingCtx.translate(compositingCanvas.width, 0); 
        compositingCtx.scale(-1, 1); 
    }
    if (currentEffect === 'bw') {
        compositingCtx.filter = 'grayscale(100%)';
    }
    
    compositingCtx.drawImage(video, 0, 0);
    compositingCtx.restore();
    
    if (overlay.width > 0 && overlay.height > 0) {
        const scaleX = video.videoWidth / overlay.width;
        const scaleY = video.videoHeight / overlay.height;
        compositingCtx.save(); 
        compositingCtx.scale(scaleX, scaleY); 
        compositingCtx.drawImage(overlay, 0, 0); 
        compositingCtx.restore();
    }
    
    return compositingCanvas;
}

async function takePhoto() {
    const flash = document.getElementById('flash');
    flash.style.display = 'block'; setTimeout(() => flash.style.display = 'none', 100);
    const composited = getCompositedCanvas();
    await window.api.saveImage(composited.toDataURL('image/png'));
}

function startRecording() {
    recordedChunks = [];
    isRecording = true;
    const recordCanvas = document.createElement('canvas');
    recordCanvas.width = video.videoWidth; recordCanvas.height = video.videoHeight;
    const rctx = recordCanvas.getContext('2d');
    
    rctx.drawImage(getCompositedCanvas(), 0, 0);

    const stream = recordCanvas.captureStream(30);
    const audioTrack = video.srcObject?.getAudioTracks()[0];
    if (audioTrack) stream.addTrack(audioTrack);
    
    let mimeType = 'video/webm; codecs=vp9';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'video/webm; codecs=vp8';
        if (!MediaRecorder.isTypeSupported(mimeType)) {
            mimeType = 'video/webm';
        }
    }

    mediaRecorder = new MediaRecorder(stream, { mimeType });
    mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = async () => {
        const blob = new Blob(recordedChunks, { type: mimeType });
        const buffer = await blob.arrayBuffer();
        window.api.saveVideo(buffer);
    };
    mediaRecorder.start();
    const drawToRecord = () => { if (!isRecording) return; rctx.drawImage(getCompositedCanvas(), 0, 0); requestAnimationFrame(drawToRecord); };
    drawToRecord();
    recordingIndicator.classList.remove('hidden');
    captureBtn.style.backgroundColor = "white";
    startTimer();
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;
        recordingIndicator.classList.add('hidden');
        captureBtn.style.backgroundColor = "";
        clearInterval(timerInterval);
    }
}

function startTimer() {
    secondsElapsed = 0; videoTimer.innerText = "00:00";
    timerInterval = setInterval(() => {
        secondsElapsed++;
        const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
        const secs = (secondsElapsed % 60).toString().padStart(2, '0');
        videoTimer.innerText = `${mins}:${secs}`;
    }, 1000);
}

/** ---------------- EFFECTS ---------------- **/
effectsToggle.onclick = (e) => { e.stopPropagation(); effectsDrawer.classList.toggle('drawer-hidden'); };
document.querySelectorAll('.effect-item').forEach(item => {
    item.onclick = () => {
        document.querySelector('.effect-item.active')?.classList.remove('active');
        item.classList.add('active');
        currentEffect = item.dataset.effect;
        document.getElementById('video-wrapper').className = 'video-container effect-' + currentEffect;
        if (currentEffect !== 'lovestruck') hearts = [];
        effectsDrawer.classList.add('drawer-hidden');
    };
});
document.addEventListener('click', () => effectsDrawer.classList.add('drawer-hidden'));

init();