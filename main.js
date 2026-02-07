const lane = document.getElementById("lane");
const msg = document.getElementById("msg");
const startBtn = document.getElementById("start");
const nextBtn = document.getElementById("next");
const resetBtn = document.getElementById("reset");

const movesInput = document.getElementById("moves");
const movesVal = document.getElementById("movesVal");
const speedInput = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");

const levelEl = document.getElementById("level");
const winEl = document.getElementById("win");
const loseEl = document.getElementById("lose");

// フェイント設定
const FEINT_CHANCE = 0.35;
const FEINT_PAUSE_RATIO = 0.45;

let level = 1, win = 0, lose = 0;

let boxes = [];
let ballEl = null;

let ballSlot = 0;           // ボールが入っているスロット(0..2)
let slotOfBoxId = [0,1,2];  // boxId(0..2) が今どのスロットにいるか
let phase = "idle";         // idle/show/hide/shuffle/guess/result

let isBonusRound = false;

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

function setTransition(ms){
  for (const el of boxes) el.style.transitionDuration = `${ms}ms`;
}

function clearMarks(){
  for (const b of boxes){
    b.classList.remove("correct", "wrong");
  }
}

function showBall(isVisible){
  ballEl.classList.toggle("hidden", !isVisible);
}

function setClickable(on){
  for (const b of boxes){
    b.classList.toggle("disabled", !on);
  }
}

// 画面幅に応じて「箱幅・間隔・左位置」を安全に計算する（重なり防止の本命）
function calcLayout(){
  const rect = lane.getBoundingClientRect();

  // laneのpaddingはCSSと合わせる（.lane { padding: 18px; }）
  let PAD = 18;

  const maxW = 180;
  const maxGap = 14;

  // 画面が狭い時はPADも少し削って“入る余地”を増やす
  if (rect.width < 360) PAD = 12;
  if (rect.width < 320) PAD = 8;

  const available = rect.width - PAD * 2;

  // gapは狭い時ほど小さく（0にもなる）
  let gap = Math.min(maxGap, Math.floor(available * 0.04));
  gap = Math.max(0, gap);

  // まずgap込みで箱幅を計算
  let boxW = Math.floor((available - gap * 2) / 3);
  boxW = Math.min(maxW, boxW);

  // 最小幅は「画面に合わせて可変」にする（ここがポイント）
  // 目標minは60pxだけど、入らないなら available/3 まで下げる
  const targetMin = 60;
  const dynamicMin = Math.max(40, Math.floor(available / 3)); // どうしても狭い時の保険
  const minW = Math.min(targetMin, dynamicMin);
  boxW = Math.max(minW, boxW);

  // 箱幅が確定したら gap を再計算（足りなければ0）
  gap = Math.floor((available - boxW * 3) / 2);
  gap = Math.max(0, gap);

  const xs = [PAD, PAD + boxW + gap, PAD + 2 * (boxW + gap)];
  const boxH = Math.round(boxW * 1.15);

  return { xs, boxW, boxH };
}

function applyPositions(){
  const { xs, boxW, boxH } = calcLayout();

  // 箱の位置＆サイズ
  for (let id = 0; id < 3; id++){
    const slot = slotOfBoxId[id];
    boxes[id].style.width = `${boxW}px`;
    boxes[id].style.height = `${boxH}px`;
    boxes[id].style.left = `${xs[slot]}px`;
  }

  // ボールは「入ってる箱」の中に移動（ズレ根絶）
  const boxIdAtBall = slotOfBoxId.indexOf(ballSlot);
  if (boxIdAtBall >= 0){
    boxes[boxIdAtBall].appendChild(ballEl);
    ballEl.style.left = "50%";
    ballEl.style.bottom = "18px";
    ballEl.style.transform = "translateX(-50%)";
  }
}

function pickRandomBallSlot(){
  ballSlot = Math.floor(Math.random() * 3);
}

function randomSwapPair(){
  const a = Math.floor(Math.random() * 3);
  let b = Math.floor(Math.random() * 3);
  while (b === a) b = Math.floor(Math.random() * 3);
  return [a,b];
}

function swapSlots(sa, sb){
  const boxAtSlot = [0,0,0];
  for (let id=0; id<3; id++){
    boxAtSlot[slotOfBoxId[id]] = id;
  }
  const boxA = boxAtSlot[sa];
  const boxB = boxAtSlot[sb];

  slotOfBoxId[boxA] = sb;
  slotOfBoxId[boxB] = sa;

  // ボールは箱と一緒に移動して見えるべきなので、スロット入れ替えに追従
  if (ballSlot === sa) ballSlot = sb;
  else if (ballSlot === sb) ballSlot = sa;
}

function render(){
  lane.innerHTML = "";
  boxes = [];

  for (let id = 0; id < boxCount; id++){
    const b = document.createElement("div");
    b.className = "box";
    b.dataset.id = String(id);
    b.innerHTML = `
      <div class="lid"></div>
      <div class="hole"></div>
    `;
    b.addEventListener("click", () => onPick(id));
    lane.appendChild(b);
    boxes.push(b);
  }

  ballEl = document.createElement("div");
  ballEl.className = "ball";
  lane.appendChild(ballEl);

  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();
}

async function startRound(){

  // ボーナスなら箱6個、通常は3個
  const boxCount = isBonusRound ? 6 : 3;

  phase = "show";
  nextBtn.disabled = true;
  startBtn.disabled = true;
  clearMarks();

  // スロット初期化
  slotOfBoxId = [];
  for (let i = 0; i < boxCount; i++){
    slotOfBoxId.push(i);
  }

  // ボール位置ランダム
  ballSlot = Math.floor(Math.random() * boxCount);

  // 速度と回数
  let moves = Number(movesInput.value);
  let speed = Number(speedInput.value);

  // ★ボーナス強化
  if (isBonusRound){
    moves += 6;     // 回数増
    speed *= 0.6;   // かなり速く
    msg.textContent = "BONUS ROUND";
  } else {
    msg.textContent = "見なさい。ボールの位置を覚えるの。";
  }

  setTransition(speed);
  showBall(true);
  setClickable(false);

  applyPositions();

  await sleep(700);

  // 隠す
  phase = "hide";
  showBall(false);
  await sleep(350);

  // シャッフル
  phase = "shuffle";

  for (let i = 0; i < moves; i++){

    const a = Math.floor(Math.random() * boxCount);
    let b = Math.floor(Math.random() * boxCount);
    while (b === a) b = Math.floor(Math.random() * boxCount);

    swapSlots(a, b);
    applyPositions();

    await sleep(speed);
  }

  // 選択フェーズ
  phase = "guess";
  msg.textContent = "どれに入ってるか分かるね？";
  setClickable(true);
}

function onPick(boxId){
  if (phase !== "guess") return;

  phase = "result";
  setClickable(false);

  const chosenSlot = slotOfBoxId[boxId];
  const correct = chosenSlot === ballSlot;

  showBall(true);
  applyPositions();

  clearMarks();
  if (correct){
    boxes[boxId].classList.add("correct");
    win++;
    level++;
    msg.textContent = "当たり！";
    // 次はボーナスラウンド
isBonusRound = true;
  } else {
    boxes[boxId].classList.add("wrong");
    const correctBoxId = slotOfBoxId.indexOf(ballSlot);
    if (correctBoxId >= 0) boxes[correctBoxId].classList.add("correct");
    lose++;
    level = Math.max(1, level - 1);
    msg.textContent = "ハズレ。論外。";
  }

  levelEl.textContent = String(level);
  winEl.textContent = String(win);
  loseEl.textContent = String(lose);

  nextBtn.disabled = false;
  startBtn.disabled = true;

  // ボーナスは1回で終了
isBonusRound = false;

}

function resetAll(){
  level = 1; win = 0; lose = 0;
  levelEl.textContent = "1";
  winEl.textContent = "0";
  loseEl.textContent = "0";

  phase = "idle";
  startBtn.disabled = false;
  nextBtn.disabled = true;

  slotOfBoxId = [0,1,2];
  ballSlot = 0;

  setTransition(Number(speedInput.value));
  setClickable(false);
  clearMarks();
  showBall(true);
  applyPositions();

  msg.textContent = "STARTを押す。最初はボールが見える。";
}

startBtn.addEventListener("click", startRound);
nextBtn.addEventListener("click", startRound);
resetBtn.addEventListener("click", resetAll);

movesInput.addEventListener("input", () => {
  movesVal.textContent = String(movesInput.value);
});
speedInput.addEventListener("input", () => {
  speedVal.textContent = `${speedInput.value}ms`;
  setTransition(Number(speedInput.value));
});

window.addEventListener("resize", () => {
  applyPositions();
});

movesVal.textContent = String(movesInput.value);
speedVal.textContent = `${speedInput.value}ms`;

render();
resetAll();



