const lane = document.getElementById("lane");
const msg = document.getElementById("msg");
const startBtn = document.getElementById("start");
const nextBtn = document.getElementById("next");
const resetBtn = document.getElementById("reset");

const modalBackdrop = document.getElementById("modalBackdrop");
const modalOk = document.getElementById("modalOk");
const modalCancel = document.getElementById("modalCancel");

const levelEl = document.getElementById("level");
const winEl = document.getElementById("win");
const loseEl = document.getElementById("lose");
const introScreen = document.getElementById("introScreen");

const FEINT_PAUSE_RATIO = 0.45;
const BASE_SPEED = 700;

function getDifficulty(r){
  if (r === 100){
    return {
      boxCount: 2,
      moves: 300,
      speed: 35,
      feintChance: 0,
      gap: 1,
    };
  }

  if (r === 1){
    return {
      boxCount: 3,
      moves: 5,
      speed: 700,
      feintChance: 0.2,
      gap: 80,
    };
  }

  if (r >= 2 && r <= 5){
    return {
      boxCount: 3,
      moves: 5 + (r - 1) * 4,
      speed: 700 - (r - 1) * 120,
      feintChance: 0.25 + (r - 2) * 0.05,
      gap: 70 - (r - 2) * 12,
    };
  }

  return {
    boxCount: 9,
    moves: 30,
    speed: 350,
    feintChance: 0.35,
    gap: 10,
  };
}

let round = 1;
let win = 0;
let lose = 0;
let startTime = 0;
let endTime = 0;
let phase = "idle";
let boxCount = 3;
let boxes = [];
let ballEl = null;
let slotOfBoxId = [];
let ballBoxId = 0;
let messageTimer = 0;

function sleep(ms){
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setMessage(text, duration = 850){
  clearTimeout(messageTimer);

  if (!text){
    msg.textContent = "";
    msg.classList.remove("visible");
    msg.classList.add("hidden");
    return;
  }

  msg.textContent = text;
  msg.classList.remove("hidden", "visible");
  void msg.offsetWidth;
  msg.classList.add("visible");

  if (duration > 0){
    messageTimer = setTimeout(() => {
      msg.classList.remove("visible");
      msg.classList.add("hidden");
    }, duration);
  }
}

function updateRoundLabel(){
  levelEl.textContent = (round === 100) ? "FINAL ROUND" : String(round);
}

function explodeAtClientXY(x, y){
  document.body.classList.add("screen-shake");
  setTimeout(() => document.body.classList.remove("screen-shake"), 240);

  const count = 18;
  for (let i = 0; i < count; i++){
    const particle = document.createElement("div");
    particle.className = "particle";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;

    const angle = Math.PI * 2 * (i / count) + Math.random() * 0.4;
    const dist = 40 + Math.random() * 50;
    particle.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    particle.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
    particle.style.background = `hsl(${20 + Math.random() * 50}, 90%, 60%)`;

    document.body.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove());
    setTimeout(() => particle.remove(), 700);
  }
}

function celebrateAtBox(box){
  const rect = box.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;

  document.body.classList.add("success-flash");
  setTimeout(() => document.body.classList.remove("success-flash"), 420);

  box.classList.remove("success-pop");
  void box.offsetWidth;
  box.classList.add("success-pop");
  setTimeout(() => box.classList.remove("success-pop"), 520);

  const ring = document.createElement("div");
  ring.className = "success-ring";
  ring.style.left = `${x}px`;
  ring.style.top = `${y}px`;
  document.body.appendChild(ring);
  ring.addEventListener("animationend", () => ring.remove());
  setTimeout(() => ring.remove(), 700);

  const burstCount = 26;
  for (let i = 0; i < burstCount; i++){
    const piece = document.createElement("div");
    piece.className = "success-spark";
    piece.style.left = `${x}px`;
    piece.style.top = `${y}px`;

    const angle = Math.PI * 2 * (i / burstCount) + Math.random() * 0.28;
    const dist = 70 + Math.random() * 75;
    const rise = 18 + Math.random() * 28;
    piece.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
    piece.style.setProperty("--dy", `${Math.sin(angle) * dist - rise}px`);
    piece.style.background = `hsl(${40 + Math.random() * 110}, 96%, ${58 + Math.random() * 10}%)`;
    piece.style.transform = `translate(-50%, -50%) rotate(${Math.random() * 360}deg)`;

    document.body.appendChild(piece);
    piece.addEventListener("animationend", () => piece.remove());
    setTimeout(() => piece.remove(), 900);
  }
}

function setTransition(ms){
  for (const el of boxes){
    el.style.transitionDuration = `${ms}ms`;
  }
}

function clearMarks(){
  for (const box of boxes){
    box.classList.remove("correct", "wrong");
  }
}

function showBall(isVisible){
  if (!ballEl) return;
  ballEl.classList.toggle("hidden", !isVisible);
}

function setClickable(on){
  for (const box of boxes){
    box.classList.toggle("disabled", !on);
  }
}

function calcLayout(){
  const rect = lane.getBoundingClientRect();

  let padX = 16;
  let padY = 18;
  if (rect.width < 360){
    padX = 12;
    padY = 14;
  }
  if (rect.width < 320){
    padX = 8;
    padY = 12;
  }

  const cols = boxCount <= 2 ? 2 : 3;
  const rows = Math.ceil(boxCount / cols);
  const availableW = rect.width - padX * 2;
  const availableH = rect.height - padY * 2;

  let gap = Math.floor(availableW * 0.03);
  gap = Math.max(6, Math.min(12, gap));

  const vgap = Math.max(8, Math.min(14, Math.floor(availableH * 0.035)));
  const maxBoxW = Math.floor((availableW - gap * (cols - 1)) / cols);
  const maxBoxH = Math.floor((availableH - vgap * (rows - 1)) / rows);

  let boxW = Math.min(maxBoxW, Math.floor(maxBoxH / 1.05));
  boxW = Math.max(44, Math.min(150, boxW));
  const boxH = Math.round(boxW * 1.05);
  const xs = [];
  const totalW = boxW * cols + gap * (cols - 1);
  const startX = Math.max(padX, Math.floor((rect.width - totalW) / 2));
  for (let c = 0; c < cols; c++){
    xs.push(startX + c * (boxW + gap));
  }

  const totalH = boxH * rows + vgap * (rows - 1);
  const startY = Math.max(padY, Math.floor((rect.height - totalH) / 2));
  const ys = [];
  for (let r = 0; r < rows; r++){
    ys.push(startY + r * (boxH + vgap));
  }

  return { xs, ys, boxW, boxH, cols };
}

function applyPositions(){
  if (boxes.length !== boxCount) return;
  const { xs, ys, boxW, boxH, cols } = calcLayout();

  for (let id = 0; id < boxCount; id++){
    const slot = slotOfBoxId[id];
    const r = Math.floor(slot / cols);
    const c = slot % cols;

    boxes[id].style.width = `${boxW}px`;
    boxes[id].style.height = `${boxH}px`;
    boxes[id].style.left = `${xs[c]}px`;
    boxes[id].style.top = `${ys[r]}px`;
  }

  if (ballEl && ballBoxId >= 0 && ballBoxId < boxCount){
    boxes[ballBoxId].appendChild(ballEl);
    ballEl.style.left = "50%";
    ballEl.style.bottom = "18px";
    ballEl.style.transform = "translateX(-50%)";
  }
}

function randomSwapPair(){
  const a = Math.floor(Math.random() * boxCount);
  let b = Math.floor(Math.random() * boxCount);
  while (b === a) b = Math.floor(Math.random() * boxCount);
  return [a, b];
}

function swapSlots(sa, sb){
  const boxAtSlot = new Array(boxCount).fill(0);
  for (let id = 0; id < boxCount; id++){
    boxAtSlot[slotOfBoxId[id]] = id;
  }

  const boxA = boxAtSlot[sa];
  const boxB = boxAtSlot[sb];
  slotOfBoxId[boxA] = sb;
  slotOfBoxId[boxB] = sa;
}

function render(){
  lane.innerHTML = "";
  boxes = [];

  for (let id = 0; id < boxCount; id++){
    const box = document.createElement("div");
    box.className = "box";
    box.dataset.id = String(id);
    box.innerHTML = '<div class="lid"></div>';
    box.addEventListener("click", () => onPick(id));
    lane.appendChild(box);
    boxes.push(box);
  }

  ballEl = document.createElement("div");
  ballEl.className = "ball";
  lane.appendChild(ballEl);

  clearMarks();
  setClickable(false);
  showBall(true);
  setTransition(BASE_SPEED);
  applyPositions();
}

function setRoundBoxes(){
  const difficulty = getDifficulty(round);
  boxCount = difficulty.boxCount;
  slotOfBoxId = Array.from({ length: boxCount }, (_, i) => i);
  ballBoxId = Math.floor(Math.random() * boxCount);
  return difficulty;
}

async function startRound(){
  if (round === 1 && startTime === 0){
    introScreen.classList.remove("hidden");
    await sleep(1800);
    introScreen.classList.add("hidden");
  }

  if (round === 1 && startTime === 0){
    startTime = Date.now();
  }

  const difficulty = setRoundBoxes();
  render();
  document.body.classList.toggle("round99", round === 99);

  phase = "show";
  nextBtn.disabled = true;
  startBtn.disabled = true;
  clearMarks();

  setTransition(difficulty.speed);
  showBall(true);
  setClickable(false);
  applyPositions();

  setMessage("見て。ボールの位置を覚えろ。", 800);
  await sleep(900);

  phase = "hide";
  setMessage("隠すよ。", 500);
  showBall(false);
  await sleep(450);

  phase = "shuffle";
  setMessage("");

  for (let i = 0; i < difficulty.moves; i++){
    if (Math.random() < difficulty.feintChance){
      await sleep(Math.floor(difficulty.speed * FEINT_PAUSE_RATIO));
    }

    const [sa, sb] = randomSwapPair();
    swapSlots(sa, sb);
    applyPositions();
    await sleep(difficulty.gap);

    if (Math.random() < difficulty.feintChance * 0.6){
      await sleep(Math.floor(difficulty.speed * 0.18));
      const [sa2, sb2] = randomSwapPair();
      swapSlots(sa2, sb2);
      applyPositions();
      await sleep(difficulty.speed * 0.65);
    }
  }

  phase = "guess";
  setMessage("箱をタップして。", 650);
  setClickable(true);
}

function onPick(boxId){
  if (phase === "idle"){
    const rect = boxes[boxId].getBoundingClientRect();
    explodeAtClientXY(rect.left + rect.width / 2, rect.top + rect.height / 2);
    setMessage("START押せ", 700);
    return;
  }

  if (phase !== "guess") return;

  phase = "result";
  setClickable(false);

  const correct = boxId === ballBoxId;
  showBall(true);
  applyPositions();
  clearMarks();

  if (correct){
    boxes[boxId].classList.add("correct");
    celebrateAtBox(boxes[boxId]);
    win++;

    if (round === 100){
      endTime = Date.now();
      const seconds = Math.floor((endTime - startTime) / 1000);
      setMessage(`${seconds}秒無駄にしました。ゲームクリア。`, 0);

      phase = "idle";
      setClickable(false);
      nextBtn.disabled = true;
      startBtn.disabled = true;
      document.body.classList.remove("round99");
      return;
    }

    round++;
    if (round === 6) round = 99;
    setMessage(round === 99 ? "センスあるから本番開始" : "当たり！", 900);
  } else {
    boxes[boxId].classList.add("wrong");
    boxes[ballBoxId].classList.add("correct");
    lose++;
    setMessage("普通にハズレ", 900);
  }

  updateRoundLabel();
  winEl.textContent = String(win);
  loseEl.textContent = String(lose);
  nextBtn.disabled = false;
  startBtn.disabled = true;
}

function resetAll(){
  startTime = 0;
  endTime = 0;
  round = 1;
  win = 0;
  lose = 0;

  levelEl.textContent = "1";
  winEl.textContent = "0";
  loseEl.textContent = "0";

  phase = "idle";
  startBtn.disabled = false;
  nextBtn.disabled = true;

  boxCount = 3;
  slotOfBoxId = Array.from({ length: boxCount }, (_, i) => i);
  ballBoxId = Math.floor(Math.random() * boxCount);

  render();
  setTransition(BASE_SPEED);
  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();

  document.body.classList.remove("round99");
  setMessage("STARTを押して", 900);
}

function openResetModal(){
  modalBackdrop.classList.remove("hidden");
}

function closeResetModal(){
  modalBackdrop.classList.add("hidden");
}

resetBtn.addEventListener("click", openResetModal);
modalCancel.addEventListener("click", closeResetModal);
modalOk.addEventListener("click", () => {
  closeResetModal();
  resetAll();
});
modalBackdrop.addEventListener("click", (e) => {
  if (e.target === modalBackdrop) closeResetModal();
});

window.addEventListener("resize", () => applyPositions());
lane.addEventListener("contextmenu", (e) => e.preventDefault());
lane.addEventListener("selectstart", (e) => e.preventDefault());
startBtn.addEventListener("click", startRound);
nextBtn.addEventListener("click", startRound);

resetAll();
