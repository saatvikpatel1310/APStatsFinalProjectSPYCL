const words = [
  "Beach",
  "Light",
  "Train",
  "House",
  "Smart",
  "Water",
  "Plant",
  "Smile",
  "Bread",
  "Cloud"
];

const stepOrder = [
  "home",
  "treatment",
  "instructions",
  "memorization",
  "video",
  "recall",
  "results"
];

let selectedTreatment = null;
let instructionCountdown = 10;
let memorizationCountdown = 30;
let videoCountdown = 60;
let instructionTimerId = null;
let memorizationTimerId = null;
let videoTimerId = null;
let videoTimerActive = false;
let videoPlayerState = null;
let videoTimerPausedByPlayer = false;
let currentVideoId = null;
// Experiment state & monitoring
let experimentStarted = false;
let tabSwitchCount = 0;
let pausedForVisibility = false;
let pausedForFullscreen = false;
// YouTube player state
let player = null;
let ytReady = false;
let pendingVideoId = null;

const startButton = document.getElementById("startButton");
const treatmentButtons = document.querySelectorAll("[data-treatment]");
const instructionTimerElement = document.getElementById("instructionTimer");
const memorizationTimerElement = document.getElementById("memorizationTimer");
const videoTimerElement = document.getElementById("videoTimer");
const wordGrid = document.getElementById("wordGrid");
const experimentVideo = document.getElementById("experimentVideo");
const submitButton = document.getElementById("submitButton");
const recallInput = document.getElementById("recallInput");
const scoreValue = document.getElementById("scoreValue");
const confettiLayer = document.getElementById("confettiLayer");
const stepDots = document.querySelectorAll(".step-dot");
const warningOverlay = document.getElementById("warningOverlay");
const warningTitle = document.getElementById("warningTitle");
const warningBody = document.getElementById("warningBody");
const returnFsBtn = document.getElementById("returnFsBtn");
const mobilePlayOverlay = document.getElementById("mobilePlayOverlay");
const mobilePlayButton = document.getElementById("mobilePlayButton");

const screens = {};
stepOrder.forEach((step) => {
  screens[step] = document.querySelector(`.page[data-step="${step}"]`);
});

startButton.addEventListener("click", () => {
  // mark experiment started, request fullscreen, and move forward
  experimentStarted = true;
  tabSwitchCount = 0;
  tryEnterFullscreen();
  transitionTo("treatment");
});

treatmentButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedTreatment = button.dataset.treatment;
    transitionTo("instructions");
    startInstructionCountdown();
  });
});

submitButton.addEventListener("click", () => {
  const score = calculateScore();
  scoreValue.textContent = score;
  transitionTo("results");
  launchConfetti();
});

function transitionTo(step) {
  Object.values(screens).forEach((screen) => screen.classList.remove("active"));
  // if leaving video, pause playback
  if (step !== 'video' && player && typeof player.pauseVideo === 'function') {
    try { player.pauseVideo(); } catch (e) {}
  }
  screens[step].classList.add("active");
  updateProgress(step);

  if (step === "memorization") {
    renderWordGrid();
  }

  if (step === "video") {
    configureVideo();
  }
}

function updateProgress(currentStep) {
  const activeIndex = stepOrder.indexOf(currentStep);
  stepDots.forEach((dot, index) => {
    dot.classList.toggle("active", index <= activeIndex - 1);
  });
}

function startInstructionCountdown() {
  // preserve remaining time if resuming after a pause
  instructionCountdown = (typeof instructionCountdown === 'number' && instructionCountdown > 0) ? instructionCountdown : 10;
  updateCountdown(instructionTimerElement, instructionCountdown);
  clearInterval(instructionTimerId);
  instructionTimerId = setInterval(() => {
    instructionCountdown -= 1;
    updateCountdown(instructionTimerElement, instructionCountdown);
    if (instructionCountdown <= 0) {
      clearInterval(instructionTimerId);
      transitionTo("memorization");
      startMemorizationCountdown();
    }
  }, 1000);
}

function startMemorizationCountdown() {
  // Start or resume memorization countdown
  memorizationCountdown = typeof memorizationCountdown === 'number' ? memorizationCountdown : 30;
  if (memorizationCountdown <= 0) memorizationCountdown = 30;
  updateCountdown(memorizationTimerElement, memorizationCountdown);
  clearInterval(memorizationTimerId);
  memorizationTimerId = setInterval(() => {
    memorizationCountdown -= 1;
    updateCountdown(memorizationTimerElement, memorizationCountdown);
    if (memorizationCountdown <= 0) {
      clearInterval(memorizationTimerId);
      transitionTo("video");
      startVideoCountdown();
    }
  }, 1000);
}

function startVideoCountdown() {
  // Start or resume video countdown immediately for the video phase
  videoCountdown = typeof videoCountdown === 'number' ? videoCountdown : 60;
  if (videoCountdown <= 0) videoCountdown = 60;
  updateCountdown(videoTimerElement, videoCountdown);
  clearInterval(videoTimerId);
  videoTimerActive = true;
  videoTimerId = setInterval(() => {
    videoCountdown -= 1;
    updateCountdown(videoTimerElement, videoCountdown);
    if (videoCountdown <= 0) {
      clearInterval(videoTimerId);
      videoTimerActive = false;
      transitionTo("recall");
    }
  }, 1000);
}

function updateCountdown(element, value) {
  element.textContent = value.toString().padStart(2, "0");
  element.classList.remove("pulse");
  void element.offsetWidth;
  element.classList.add("pulse");
}

function renderWordGrid() {
  // If static cards are present (hard-coded in HTML), leave them intact for accessibility
  if (wordGrid.querySelector('.word-card.static')) {
    // ensure static cards are visible (in case of resume)
    wordGrid.querySelectorAll('.word-card.static').forEach((el, i) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.animation = 'none';
    });
    return;
  }

  // Fallback dynamic rendering if static cards are not present
  wordGrid.innerHTML = "";
  words.forEach((word, index) => {
    const col = document.createElement('div');
    col.className = 'col-12 col-sm-6';
    const item = document.createElement("div");
    item.className = "word-card";
    item.textContent = word;
    item.style.animationDelay = `${index * 80}ms`;
    col.appendChild(item);
    wordGrid.appendChild(col);
  });
}

function configureVideo() {
  const videoId = selectedTreatment === "2" ? "TKmGU77INaM" : "mtwRb_qBu28";
  pendingVideoId = videoId;
  // if API ready and player exists, load or resume video; otherwise create when API loads
  if (ytReady && player) {
    try {
      player.mute();
      if (currentVideoId !== videoId) {
        currentVideoId = videoId;
        videoPlayerState = null;
        player.loadVideoById({ videoId, startSeconds: 0 });
      }
      player.playVideo();
      scheduleMobileAutoplayFallback();
    } catch (e) {
      console.warn('Player load error', e);
      showMobilePlayOverlay();
    }
  } else if (ytReady && !player) {
    createPlayer(videoId);
  }
}

function createPlayer(videoId) {
  currentVideoId = videoId;
  try {
    player = new YT.Player('experimentVideo', {
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        disablekb: 1,
        fs: 0,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        iv_load_policy: 3,
        origin: window.location.origin,
        mute: 1
      },
      events: {
        onReady: (e) => {
          try {
            e.target.mute();
            e.target.playVideo();
          } catch (err) {
            console.warn('Player ready play failed', err);
          }
          scheduleMobileAutoplayFallback();
        },
        onStateChange: (e) => {
          handleVideoStateChange(e.data);
        },
        onError: (e) => {
          console.warn('YT Player error', e.data);
          // error codes 101 and 150 usually mean embedding disabled
          if (e.data === 101 || e.data === 150) {
            showWarning('Video unavailable', 'This video cannot be embedded. The phase will continue for 60 seconds.', false);
            const container = document.getElementById('experimentVideo');
            if (container) container.innerHTML = '<div class="video-fallback">Video unavailable — please continue. (Notify researcher)</div>';
          }
        }
      }
    });
  } catch (err) {
    console.warn('YT Player creation failed', err);
  }
}

function handleVideoStateChange(state) {
  videoPlayerState = state;
  if (state === YT.PlayerState.PLAYING) {
    hideMobilePlayOverlay();
    videoTimerPausedByPlayer = false;
    try { player.unMute(); player.setVolume(100); } catch (e) {}
    if (!videoTimerActive) {
      startVideoCountdown();
    } else {
      resumeVideoCountdown();
    }
  }
  if (state === YT.PlayerState.PAUSED || state === YT.PlayerState.UNSTARTED) {
    if (videoTimerActive) {
      pauseVideoCountdown();
      videoTimerPausedByPlayer = true;
    }
  }
}

// Called by the YouTube IFrame API when ready
function onYouTubeIframeAPIReady() {
  ytReady = true;
  if (pendingVideoId) createPlayer(pendingVideoId);
}

function pauseVideoCountdown() {
  if (videoTimerId) {
    clearInterval(videoTimerId);
    videoTimerId = null;
  }
  videoTimerActive = false;
}

function resumeVideoCountdown() {
  if (!videoTimerActive && videoCountdown > 0) {
    if (videoPlayerState === YT.PlayerState.PLAYING || (player && typeof player.getPlayerState === 'function' && player.getPlayerState() === YT.PlayerState.PLAYING)) {
      videoTimerActive = true;
      videoTimerId = setInterval(() => {
        videoCountdown -= 1;
        updateCountdown(videoTimerElement, videoCountdown);
        if (videoCountdown <= 0) {
          clearInterval(videoTimerId);
          videoTimerActive = false;
          transitionTo("recall");
        }
      }, 1000);
    }
  }
}

function calculateScore() {
  // Accept commas, spaces, or newlines; ignore punctuation and duplicates
  const raw = recallInput.value || "";
  const parts = raw.split(/[\s,]+/).map((p) => p.trim()).filter(Boolean);
  const entries = parts.map((item) => item.replace(/[^a-zA-Z]+/g, "").toLowerCase()).filter(Boolean);

  const unique = Array.from(new Set(entries));
  const normalizedAnswers = new Set(words.map((item) => item.toLowerCase()));
  let score = 0;

  unique.forEach((entry) => {
    if (normalizedAnswers.has(entry)) {
      score += 1;
    }
  });

  return Math.min(score, words.length);
}

function launchConfetti() {
  confettiLayer.innerHTML = "";
  const confettiCount = 40;
  for (let i = 0; i < confettiCount; i += 1) {
    const confetti = document.createElement("div");
    confetti.className = "confetti-piece";
    const size = Math.random() * 10 + 8;
    confetti.style.width = `${size}px`;
    confetti.style.height = `${size * 0.35}px`;
    confetti.style.left = `${Math.random() * 100}%`;
    confetti.style.background = `hsl(${Math.random() * 60 + 180}, 85%, 65%)`;
    confetti.style.animationDuration = `${2 + Math.random() * 1.5}s`;
    confetti.style.transform = `rotate(${Math.random() * 360}deg)`;
    confettiLayer.appendChild(confetti);
  }

  setTimeout(() => {
    confettiLayer.innerHTML = "";
  }, 2800);
}

function bindGlobalPrevention() {
  document.addEventListener("contextmenu", (event) => {
    if (screens.video.classList.contains("active")) {
      event.preventDefault();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (!screens.video.classList.contains("active")) return;
    const forbiddenKeys = [" ", "Spacebar", "k", "j", "l", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "MediaPlayPause", "MediaTrackNext", "MediaTrackPrevious"];
    if (forbiddenKeys.includes(event.key) || (event.ctrlKey && event.key.toLowerCase() === "r")) {
      event.preventDefault();
      event.stopPropagation();
    }
  });
}

/* Fullscreen & visibility helpers */
async function tryEnterFullscreen() {
  try {
    if (document.fullscreenElement) return;
    await document.documentElement.requestFullscreen();
  } catch (err) {
    // Some browsers block fullscreen without gesture or user settings
    console.warn("Fullscreen request failed:", err);
  }
}

function showWarning(title, body, showReturn = false) {
  if (!warningOverlay) return;
  warningTitle.textContent = title;
  warningBody.textContent = body;
  if (showReturn) {
    returnFsBtn.style.display = "inline-block";
  } else {
    returnFsBtn.style.display = "none";
  }
  warningOverlay.classList.remove("hidden");
  warningOverlay.setAttribute("aria-hidden", "false");
}

function hideWarning() {
  if (!warningOverlay) return;
  warningOverlay.classList.add("hidden");
  warningOverlay.setAttribute("aria-hidden", "true");
}

// When fullscreen state changes, prompt user if experiment is active and fullscreen lost
document.addEventListener("fullscreenchange", () => {
  if (!experimentStarted) return;
  if (!document.fullscreenElement) {
    pausedForFullscreen = true;
    // pause any active countdowns
    pauseActiveTimers();
    showWarning(
      "Please return to fullscreen",
      "The experiment is most accurate in fullscreen mode. Click below to return.",
      true
    );
  } else {
    pausedForFullscreen = false;
    // only resume if page visible
    if (document.visibilityState === "visible") {
      hideWarning();
      resumeActiveTimers();
    }
  }
});

// Detect tab switches and log count
document.addEventListener("visibilitychange", () => {
  if (!experimentStarted) return;
  if (document.hidden) {
    tabSwitchCount += 1;
    pausedForVisibility = true;
    console.log("Tab switch detected. Count:", tabSwitchCount);
    pauseActiveTimers();
    showWarning(
      "Please remain on the experiment page.",
      "Switching tabs may affect the results. Please return to the experiment.",
      false
    );
  } else {
    pausedForVisibility = false;
    if (document.fullscreenElement) {
      hideWarning();
      resumeActiveTimers();
    } else {
      showWarning(
        "Please return to fullscreen",
        "The experiment is most accurate in fullscreen mode. Click below to return.",
        true
      );
    }
  }
});

if (returnFsBtn) {
  returnFsBtn.addEventListener("click", async () => {
    await tryEnterFullscreen();
    // small delay then hide if successful
    setTimeout(() => {
      if (document.fullscreenElement) hideWarning();
    }, 400);
  });
}

if (mobilePlayButton) {
  mobilePlayButton.addEventListener('click', () => {
    if (player && typeof player.playVideo === 'function') {
      try { player.playVideo(); } catch (e) { console.warn('Mobile play retry failed', e); }
    }
    hideMobilePlayOverlay();
  });
}

function pauseActiveTimers() {
  // clear intervals and leave countdown variables as-is
  if (instructionTimerId) { clearInterval(instructionTimerId); instructionTimerId = null; }
  if (memorizationTimerId) { clearInterval(memorizationTimerId); memorizationTimerId = null; }
  if (videoTimerId) { clearInterval(videoTimerId); videoTimerId = null; }
  videoTimerActive = false;
  // pause YouTube playback if active
  if (player && typeof player.pauseVideo === 'function') {
    try { player.pauseVideo(); } catch (e) { /* ignore */ }
  }
}

function showMobilePlayOverlay() {
  if (!mobilePlayOverlay) return;
  mobilePlayOverlay.classList.remove('hidden');
  mobilePlayOverlay.setAttribute('aria-hidden', 'false');
}

function hideMobilePlayOverlay() {
  if (!mobilePlayOverlay) return;
  mobilePlayOverlay.classList.add('hidden');
  mobilePlayOverlay.setAttribute('aria-hidden', 'true');
}

function scheduleMobileAutoplayFallback() {
  setTimeout(() => {
    if (screens.video && screens.video.classList.contains('active') && videoPlayerState !== YT.PlayerState.PLAYING) {
      showMobilePlayOverlay();
    }
  }, 1200);
}

function resumeActiveTimers() {
  // Resume timers only for the current active screen
  if (screens.memorization && screens.memorization.classList.contains('active')) {
    // ensure words visible
    renderWordGrid();
    startMemorizationCountdown();
  }
  if (screens.instructions && screens.instructions.classList.contains('active')) {
    startInstructionCountdown();
  }
  if (screens.video && screens.video.classList.contains('active')) {
    if (player && typeof player.playVideo === 'function') {
      try {
        player.playVideo();
      } catch (e) {
        console.warn('Resume play failed', e);
      }
      setTimeout(() => {
        resumeVideoCountdown();
      }, 250);
    } else {
      configureVideo();
    }
  }
}

bindGlobalPrevention();
renderWordGrid();
transitionTo("home");
