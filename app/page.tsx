"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// --- 型定義 ---
type GamePhase =
  | "title"
  | "stage_intro"
  | "playing"
  | "stage_clear"
  | "game_over"
  | "epilogue";

interface Bumper {
  id: string;
  x: number;
  y: number;
  r: number;
  type: "can" | "chawan" | "koban";
  points: number;
  hitAnim: number;
}

interface ShojiHole {
  x: number;
  y: number;
  r: number;
  seed: number;
  cooldown: number;
}

interface Puddle {
  x: number;
  y: number;
  rx: number;
  ry: number;
}

interface DebtCollector {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  minX: number;
  maxX: number;
}

interface StageConfig {
  chapter: number;
  stage: number;
  chapterTitle: string;
  stageName: string;
  mode: "target" | "survival";
  targetScore: number;
  timeLimit: number;
  bumpers: Omit<Bumper, "hitAnim">[];
  holes: ShojiHole[];
  puddles: Puddle[];
  collectors: DebtCollector[];
}

const CHAPTER_TITLES = [
  "第1章：隙間風の四畳半",
  "第2章：雨漏りボロアパート",
  "第3章：借金取りの玄関先",
  "第4章：質屋の蔵の奥",
  "第5章：逆転！成金御殿",
];

// 穴（軌道変化ギミック）の候補スポット
const HOLE_CANDIDATES = [
  { x: 65, y: 155 },
  { x: 230, y: 165 },
  { x: 60, y: 270 },
  { x: 235, y: 270 },
  { x: 148, y: 100 },
  { x: 112, y: 295 },
  { x: 185, y: 295 },
];

function generateRandomHoles(chapter: number, stage: number): ShojiHole[] {
  const count = chapter === 1 ? 1 : chapter <= 3 ? 2 : 3;
  const pool = [...HOLE_CANDIDATES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const baseR = 11 + Math.min(3, stage * 0.4);
  return pool.slice(0, count).map((pos, idx) => ({
    x: pos.x + (Math.random() * 12 - 6),
    y: pos.y + (Math.random() * 12 - 6),
    r: baseR,
    seed: 1.1 + idx * 1.7 + Math.random(),
    cooldown: 0,
  }));
}

// 発射直後のタダ取りを防ぐため、バンパーは中段〜左寄りに配置
function generateStageBumpers(
  chapter: number,
  stage: number
): Omit<Bumper, "hitAnim">[] {
  const bumpers: Omit<Bumper, "hitAnim">[] = [
    {
      id: "b1",
      x: 92,
      y: 145,
      r: 22,
      type: chapter === 5 ? "koban" : "can",
      points: chapter === 5 ? 400 : 180,
    },
    {
      id: "b2",
      x: 188,
      y: 150,
      r: 22,
      type: chapter === 5 ? "koban" : "can",
      points: chapter === 5 ? 400 : 180,
    },
    {
      id: "b3",
      x: 142,
      y: 205,
      r: 24,
      type: chapter === 5 ? "koban" : "chawan",
      points: chapter === 5 ? 550 : 280,
    },
  ];

  if (stage >= 2 || chapter >= 2) {
    bumpers.push({ id: "b4", x: 75, y: 235, r: 19, type: "can", points: 200 });
    bumpers.push({ id: "b5", x: 215, y: 235, r: 19, type: "can", points: 200 });
  }
  return bumpers;
}

function buildStageConfig(chapter: number, stage: number): StageConfig {
  const idx = (chapter - 1) * 5 + (stage - 1);
  const isSurvival = chapter >= 4;
  const targetScore = 500 + idx * 250;
  const timeLimit = isSurvival ? 25 + (stage - 1) * 3 : 60;

  const bumpers = generateStageBumpers(chapter, stage);
  const holes = generateRandomHoles(chapter, stage);

  const puddles: Puddle[] = [];
  if (chapter === 2 || chapter === 4) {
    puddles.push({ x: 148, y: 255, rx: 34, ry: 18 });
    if (stage >= 3) puddles.push({ x: 92, y: 185, rx: 25, ry: 15 });
  }

  const collectors: DebtCollector[] = [];
  if (chapter >= 3) {
    collectors.push({
      x: 118,
      y: 250,
      w: 52,
      h: 15,
      vx: 1.1 + stage * 0.2 + (chapter - 3) * 0.3,
      minX: 48,
      maxX: 248,
    });
  }

  const stageThemeNames = [
    "破れ障子",
    "雨漏り障子",
    "借金取りの格子戸",
    "質屋のなまこ壁",
    "黄金の成金御殿",
  ];

  return {
    chapter,
    stage,
    chapterTitle: CHAPTER_TITLES[chapter - 1],
    stageName: `${chapter}-${stage}：${stageThemeNames[chapter - 1]}`,
    mode: isSurvival ? "survival" : "target",
    targetScore,
    timeLimit,
    bumpers,
    holes,
    puddles,
    collectors,
  };
}

// --- Web Audio API サウンドエンジン ---
class SoundFX {
  private ctx: AudioContext | null = null;
  public muted = false;

  private ensureCtx() {
    if (!this.ctx && typeof window !== "undefined") {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (AudioCtx) this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
  }

  playFlipper() {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(180, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(520, this.ctx.currentTime + 0.09);
    gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  playSpringTick(power: number) {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(180 + power * 240, this.ctx.currentTime);
    gain.gain.setValueAtTime(0.06, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.005, this.ctx.currentTime + 0.03);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.03);
  }

  playLaunch(power: number) {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(130, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      280 + power * 420,
      this.ctx.currentTime + 0.22
    );
    gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.24);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.24);
  }

  playHoleWarp() {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(420, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(190, this.ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  playBumper(type: "can" | "chawan" | "koban") {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    if (type === "can") {
      osc.type = "square";
      osc.frequency.setValueAtTime(580, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, this.ctx.currentTime + 0.1);
    } else if (type === "chawan") {
      osc.type = "sine";
      osc.frequency.setValueAtTime(1280, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(980, this.ctx.currentTime + 0.16);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(880, this.ctx.currentTime);
      osc.frequency.setValueAtTime(1320, this.ctx.currentTime + 0.06);
    }
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.17);
  }

  playLost() {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(340, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(75, this.ctx.currentTime + 0.45);
    gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.46);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.46);
  }

  playClear() {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime + i * 0.09);
      gain.gain.setValueAtTime(0.22, this.ctx.currentTime + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.ctx.currentTime + i * 0.09 + 0.22
      );
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(this.ctx.currentTime + i * 0.09);
      osc.stop(this.ctx.currentTime + i * 0.09 + 0.23);
    });
  }
}

const sfx = new SoundFX();

const W = 340;
const H = 540;
const LANE_X = 296;
const BALL_R = 8.5;
const GRAVITY = 0.145;

export default function BinBallPage() {
  const [phase, setPhase] = useState<GamePhase>("title");
  const [chapter, setChapter] = useState<number>(1);
  const [stage, setStage] = useState<number>(1);
  const [isEndless, setIsEndless] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(0);
  const [ballsLeft, setBallsLeft] = useState<number>(3);
  const [timeLeft, setTimeLeft] = useState<number>(60);
  const [muted, setMuted] = useState<boolean>(false);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [clearedMax, setClearedMax] = useState<number>(0);
  const [toastMsg, setToastMsg] = useState<string>("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const activePointersRef = useRef<
    Map<
      number,
      { role: "left" | "right" | "plunger"; startY: number; lastTickStep: number }
    >
  >(new Map());

  const gameStateRef = useRef({
    ball: { x: 316, y: 446, vx: 0, vy: 0, inLane: true, active: false },
    plungerPower: 0,
    springRecoilAnim: 0,
    charging: false,
    leftFlipperAngle: 0.42,
    rightFlipperAngle: -0.42,
    leftPressed: false,
    rightPressed: false,
    bumpers: [] as Bumper[],
    holes: [] as ShojiHole[],
    puddles: [] as Puddle[],
    collectors: [] as DebtCollector[],
    score: 0,
    ballsLeft: 3,
    timeLeft: 60,
    config: buildStageConfig(1, 1),
    stageFinished: false,
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    const savedHi = localStorage.getItem("binball_highscore");
    if (savedHi) setHighScore(Number(savedHi) || 0);
    const savedClear = localStorage.getItem("binball_cleared_max");
    if (savedClear) setClearedMax(Number(savedClear) || 0);

    const params = new URLSearchParams(window.location.search);
    if (params.get("key") === "sun777bin") {
      setIsAdmin(true);
    }
  }, []);

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 1400);
  };

  const setupStage = useCallback(
    (ch: number, st: number, endlessMode = false) => {
      const cfg = buildStageConfig(ch, st);
      const gs = gameStateRef.current;
      gs.config = cfg;
      gs.ball = { x: 316, y: 446, vx: 0, vy: 0, inLane: true, active: false };
      gs.plungerPower = 0;
      gs.springRecoilAnim = 0;
      gs.charging = false;
      gs.leftFlipperAngle = 0.42;
      gs.rightFlipperAngle = -0.42;
      gs.leftPressed = false;
      gs.rightPressed = false;
      gs.bumpers = cfg.bumpers.map((b) => ({ ...b, hitAnim: 0 }));
      gs.holes = cfg.holes.map((h) => ({ ...h }));
      gs.puddles = cfg.puddles.map((p) => ({ ...p }));
      gs.collectors = cfg.collectors.map((c) => ({ ...c }));
      gs.score = 0;
      gs.ballsLeft = 3;
      gs.timeLeft = endlessMode ? 999 : cfg.timeLimit;
      gs.stageFinished = false;
      activePointersRef.current.clear();

      setChapter(ch);
      setStage(st);
      setIsEndless(endlessMode);
      setScore(0);
      setBallsLeft(3);
      setTimeLeft(endlessMode ? 999 : cfg.timeLimit);
    },
    []
  );

  // 発射実行（バンパー群を飛び越えて外周から下部フリッパーへ落ちやすい軌道に調整）
  const releasePlunger = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.ball.inLane && !gs.ball.active && gs.plungerPower > 0.12) {
      const p = Math.max(0.15, gs.plungerPower);
      gs.ball.vy = -(11.5 + p * 9.5);
      gs.ball.vx = -0.35;
      gs.ball.active = true;
      gs.springRecoilAnim = 1.0;
      sfx.playLaunch(p);
    }
    gs.charging = false;
    gs.plungerPower = 0;
  }, []);

  const getCanvasCoords = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const syncFlipperPointerState = () => {
    let hasLeft = false;
    let hasRight = false;
    activePointersRef.current.forEach((v) => {
      if (v.role === "left") hasLeft = true;
      if (v.role === "right") hasRight = true;
    });
    gameStateRef.current.leftPressed = hasLeft;
    gameStateRef.current.rightPressed = hasRight;
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (phase !== "playing") return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const { x, y } = getCanvasCoords(e);
    const gs = gameStateRef.current;

    if (gs.ball.inLane && !gs.ball.active && x >= 265 && y >= 330) {
      activePointersRef.current.set(e.pointerId, {
        role: "plunger",
        startY: y,
        lastTickStep: 0,
      });
      gs.charging = true;
      gs.plungerPower = 0.15;
      return;
    }

    // 盤面の左半分・右半分のどこをタップしても即フリッパー反応
    if (x < LANE_X / 2) {
      activePointersRef.current.set(e.pointerId, {
        role: "left",
        startY: y,
        lastTickStep: 0,
      });
      if (!gs.leftPressed) sfx.playFlipper();
    } else {
      activePointersRef.current.set(e.pointerId, {
        role: "right",
        startY: y,
        lastTickStep: 0,
      });
      if (!gs.rightPressed) sfx.playFlipper();
    }
    syncFlipperPointerState();
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const info = activePointersRef.current.get(e.pointerId);
    if (!info || info.role !== "plunger") return;
    const { y } = getCanvasCoords(e);
    const pullDist = Math.max(0, y - info.startY);
    const power = Math.min(1, Math.max(0.15, pullDist / 85));
    gameStateRef.current.plungerPower = power;

    const step = Math.floor(power * 6);
    if (step !== info.lastTickStep) {
      info.lastTickStep = step;
      sfx.playSpringTick(power);
    }

    if (
      gameStateRef.current.ball.inLane &&
      !gameStateRef.current.ball.active
    ) {
      gameStateRef.current.ball.y = 446 + power * 48;
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const info = activePointersRef.current.get(e.pointerId);
    if (!info) return;
    activePointersRef.current.delete(e.pointerId);

    if (info.role === "plunger") {
      releasePlunger();
      if (
        gameStateRef.current.ball.inLane &&
        !gameStateRef.current.ball.active
      ) {
        gameStateRef.current.ball.y = 446;
      }
    } else {
      syncFlipperPointerState();
    }
  };

  useEffect(() => {
    if (phase !== "playing" || isEndless) return;
    const timer = setInterval(() => {
      const gs = gameStateRef.current;
      if (gs.stageFinished) return;
      gs.timeLeft -= 1;
      setTimeLeft(gs.timeLeft);

      if (gs.timeLeft <= 0) {
        gs.stageFinished = true;
        if (
          gs.config.mode === "survival" &&
          gs.score >= gs.config.targetScore
        ) {
          sfx.playClear();
          handleStageClearSuccess();
        } else {
          sfx.playLost();
          setPhase("game_over");
        }
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, isEndless, chapter, stage]);

  const handleStageClearSuccess = () => {
    const currentIdx = (chapter - 1) * 5 + stage;
    if (currentIdx > clearedMax) {
      setClearedMax(currentIdx);
      localStorage.setItem("binball_cleared_max", String(currentIdx));
    }
    if (chapter === 5 && stage === 5) {
      setPhase("epilogue");
    } else {
      setPhase("stage_clear");
    }
  };

  // メイン物理＆描画ループ
  useEffect(() => {
    if (phase !== "playing") return;
    let animId: number;

    const updateAndDraw = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const gs = gameStateRef.current;
      const b = gs.ball;

      if (gs.springRecoilAnim > 0) {
        gs.springRecoilAnim = Math.max(0, gs.springRecoilAnim - 0.06);
      }

      gs.holes.forEach((h) => {
        if (h.cooldown > 0) h.cooldown -= 1;
      });

      const leftTarget = gs.leftPressed ? -0.56 : 0.42;
      const rightTarget = gs.rightPressed ? 0.56 : -0.42;
      gs.leftFlipperAngle += (leftTarget - gs.leftFlipperAngle) * 0.48;
      gs.rightFlipperAngle += (rightTarget - gs.rightFlipperAngle) * 0.48;

      gs.collectors.forEach((c) => {
        c.x += c.vx;
        if (c.x < c.minX || c.x + c.w > c.maxX) {
          c.vx *= -1;
        }
      });

      const checkSlantWall = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        boost = 0.84
      ) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        const t = Math.max(
          0,
          Math.min(1, ((b.x - x1) * dx + (b.y - y1) * dy) / lenSq)
        );
        const cx = x1 + t * dx;
        const cy = y1 + t * dy;
        const distX = b.x - cx;
        const distY = b.y - cy;
        const dist = Math.hypot(distX, distY);
        if (dist < BALL_R + 3 && dist > 0.001) {
          const nx = distX / dist;
          const ny = distY / dist;
          b.x = cx + nx * (BALL_R + 3);
          b.y = cy + ny * (BALL_R + 3);
          const dot = b.vx * nx + b.vy * ny;
          if (dot < 0) {
            b.vx = (b.vx - 2 * dot * nx) * boost;
            b.vy = (b.vy - 2 * dot * ny) * boost;
          }
        }
      };

      if (b.active) {
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          b.vy += GRAVITY / steps;
          b.x += b.vx / steps;
          b.y += b.vy / steps;

          if (b.x - BALL_R < 16) {
            b.x = 16 + BALL_R;
            b.vx = Math.abs(b.vx) * 0.8;
          }
          if (b.y - BALL_R < 16) {
            b.y = 16 + BALL_R;
            b.vy = Math.abs(b.vy) * 0.8;
          }

          // 右上カーブガイド（\ 向き：発射後は左外周へ大きく送り出してタダ取りを抑制）
          checkSlantWall(255, 16, 332, 85, 0.96);

          if (b.inLane) {
            if (b.x + BALL_R > W - 12) {
              b.x = W - 12 - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.7;
            }
            if (b.x - BALL_R < LANE_X && b.y > 102) {
              b.x = LANE_X + BALL_R;
              b.vx = Math.abs(b.vx) * 0.7;
            }
            if (b.x < LANE_X - 8) {
              b.inLane = false;
              // 発射直後は左壁沿いの落下ルートへ流し、フリッパー打ち返し勝負にする
              b.vx = Math.min(b.vx, -5.2);
            }
          } else {
            if (b.x + BALL_R > LANE_X) {
              b.x = LANE_X - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.8;
            }
          }

          if (!b.inLane) {
            // 下部ガイド壁（フリッパー位置を少し上げてボタンを大きく確保）
            checkSlantWall(16, 375, 86, 435, 0.88);
            checkSlantWall(LANE_X, 375, 226, 435, 0.88);

            // 左右フリッパー当たり判定（打ち返しパワーを大幅強化！）
            const lPivotX = 88;
            const lPivotY = 437;
            const fLen = 54;
            const lx2 = lPivotX + Math.cos(gs.leftFlipperAngle) * fLen;
            const ly2 = lPivotY + Math.sin(gs.leftFlipperAngle) * fLen;
            checkSlantWall(
              lPivotX,
              lPivotY,
              lx2,
              ly2,
              gs.leftPressed ? 1.75 : 0.82
            );
            if (
              gs.leftPressed &&
              Math.hypot(b.x - (lPivotX + lx2) / 2, b.y - (lPivotY + ly2) / 2) <
                38
            ) {
              b.vy = -11.2;
              b.vx = (b.x - lPivotX) * 0.14 + 1.5;
            }

            const rPivotX = 224;
            const rPivotY = 437;
            const rx2 = rPivotX - Math.cos(-gs.rightFlipperAngle) * fLen;
            const ry2 = rPivotY + Math.sin(-gs.rightFlipperAngle) * fLen;
            checkSlantWall(
              rPivotX,
              rPivotY,
              rx2,
              ry2,
              gs.rightPressed ? 1.75 : 0.82
            );
            if (
              gs.rightPressed &&
              Math.hypot(b.x - (rPivotX + rx2) / 2, b.y - (rPivotY + ry2) / 2) <
                38
            ) {
              b.vy = -11.2;
              b.vx = (b.x - rPivotX) * 0.14 - 1.5;
            }
          }

          // バンパー衝突判定（当たったターゲットは消滅＋全消しでボーナス補充）
          let hitBumperIndex = -1;
          for (let i = 0; i < gs.bumpers.length; i++) {
            const bmp = gs.bumpers[i];
            if (bmp.hitAnim > 0) bmp.hitAnim -= 0.04;
            const dx = b.x - bmp.x;
            const dy = b.y - bmp.y;
            const dist = Math.hypot(dx, dy);
            if (dist < BALL_R + bmp.r && dist > 0.001) {
              const nx = dx / dist;
              const ny = dy / dist;
              b.x = bmp.x + nx * (BALL_R + bmp.r + 1);
              b.y = bmp.y + ny * (BALL_R + bmp.r + 1);
              const bounceSpeed = bmp.type === "chawan" ? 7.2 : 6.2;
              b.vx = nx * bounceSpeed;
              b.vy = ny * bounceSpeed - 1.0;

              sfx.playBumper(bmp.type);
              gs.score += bmp.points;
              hitBumperIndex = i;
              break;
            }
          }

          if (hitBumperIndex !== -1) {
            gs.bumpers.splice(hitBumperIndex, 1);
            if (gs.bumpers.length === 0) {
              gs.score += 500;
              sfx.playClear();
              showToast("🎉 全消しボーナス +500pt！");
              gs.bumpers = generateStageBumpers(
                gs.config.chapter,
                gs.config.stage
              ).map((item) => ({ ...item, hitAnim: 1 }));
            }
            setScore(gs.score);
            if (gs.score > highScore) {
              setHighScore(gs.score);
              localStorage.setItem("binball_highscore", String(gs.score));
            }

            if (
              !isEndless &&
              !gs.stageFinished &&
              gs.config.mode === "target" &&
              gs.score >= gs.config.targetScore
            ) {
              gs.stageFinished = true;
              sfx.playClear();
              handleStageClearSuccess();
            }
          }

          // 破れ穴ギミック（即死廃止 ➔ 引っかかって軌道がイレギュラーに曲がる！）
          if (!b.inLane) {
            for (const h of gs.holes) {
              if (h.cooldown <= 0 && Math.hypot(b.x - h.x, b.y - h.y) < h.r + 3) {
                h.cooldown = 35;
                sfx.playHoleWarp();
                const randAngle = (Math.random() - 0.5) * Math.PI * 1.4;
                const spd = Math.max(4.5, Math.hypot(b.vx, b.vy) * 0.85);
                b.vx = Math.sin(randAngle) * spd;
                b.vy = Math.cos(randAngle) * spd;
                break;
              }
            }
          }

          gs.collectors.forEach((c) => {
            if (
              b.x + BALL_R > c.x &&
              b.x - BALL_R < c.x + c.w &&
              b.y + BALL_R > c.y &&
              b.y - BALL_R < c.y + c.h
            ) {
              b.vy = Math.abs(b.vy) + 2.4;
              b.y = c.y + c.h + BALL_R + 2;
              sfx.playBumper("can");
            }
          });

          gs.puddles.forEach((p) => {
            const norm =
              ((b.x - p.x) * (b.x - p.x)) / (p.rx * p.rx) +
              ((b.y - p.y) * (b.y - p.y)) / (p.ry * p.ry);
            if (norm < 1) {
              b.vx *= 0.96;
              b.vy *= 0.96;
            }
          });

          if (!b.inLane) {
            const maxSpd = 13.0;
            const curSpd = Math.hypot(b.vx, b.vy);
            if (curSpd > maxSpd) {
              b.vx = (b.vx / curSpd) * maxSpd;
              b.vy = (b.vy / curSpd) * maxSpd;
            }
          }
        }

        // 下部溝落下のみアウト判定
        if (b.y > H + 12 && !gs.stageFinished) {
          sfx.playLost();
          showToast("溝に落ちた！");
          gs.ballsLeft -= 1;
          setBallsLeft(gs.ballsLeft);

          if (gs.ballsLeft <= 0) {
            gs.stageFinished = true;
            setPhase("game_over");
          } else {
            gs.ball = {
              x: 316,
              y: 446,
              vx: 0,
              vy: 0,
              inLane: true,
              active: false,
            };
          }
        }
      }

      // --- 描画処理（全5章ごとの盤面テーマ進化） ---
      ctx.clearRect(0, 0, W, H);

      // 章ごとの背景デザイン切り替え
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      if (chapter === 1) {
        // 第1章：隙間風の四畳半（日焼けした古障子）
        bgGrad.addColorStop(0, "#faf6eb");
        bgGrad.addColorStop(1, "#e6d5b8");
      } else if (chapter === 2) {
        // 第2章：雨漏りボロアパート（湿ってカビ・シミのある障子）
        bgGrad.addColorStop(0, "#e2e8f0");
        bgGrad.addColorStop(1, "#cbd5e1");
      } else if (chapter === 3) {
        // 第3章：借金取りの玄関先（重厚な木の格子戸）
        bgGrad.addColorStop(0, "#78350f");
        bgGrad.addColorStop(1, "#451a03");
      } else if (chapter === 4) {
        // 第4章：質屋の蔵の奥（白漆喰となまこ壁）
        bgGrad.addColorStop(0, "#f8fafc");
        bgGrad.addColorStop(1, "#e2e8f0");
      } else {
        // 第5章：逆転！成金御殿（黄金の金箔ふすま）
        bgGrad.addColorStop(0, "#fef08a");
        bgGrad.addColorStop(0.5, "#facc15");
        bgGrad.addColorStop(1, "#eab308");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 章ごとの背景模様・格子描画
      if (chapter === 4) {
        // 質屋の蔵：なまこ壁のダイヤ格子模様
        ctx.strokeStyle = "#334155";
        ctx.lineWidth = 2;
        for (let gx = 40; gx < LANE_X; gx += 48) {
          for (let gy = 50; gy < H - 80; gy += 48) {
            ctx.beginPath();
            ctx.moveTo(gx, gy - 18);
            ctx.lineTo(gx + 18, gy);
            ctx.lineTo(gx, gy + 18);
            ctx.lineTo(gx - 18, gy);
            ctx.closePath();
            ctx.stroke();
          }
        }
      } else {
        // 障子・格子戸・金屏風の縦横桟
        const barColor =
          chapter === 3
            ? "#292524"
            : chapter === 5
            ? "#b45309"
            : "#854d0e";
        ctx.strokeStyle = barColor;
        ctx.lineWidth = chapter === 3 ? 6 : 4;
        for (let gx = 62; gx < LANE_X; gx += 58) {
          ctx.beginPath();
          ctx.moveTo(gx, 16);
          ctx.lineTo(gx, H - 16);
          ctx.stroke();
        }
        for (let gy = 85; gy < H; gy += 74) {
          ctx.beginPath();
          ctx.moveTo(16, gy);
          ctx.lineTo(LANE_X, gy);
          ctx.stroke();
        }
      }

      // 雨漏り水たまり
      gs.puddles.forEach((p) => {
        ctx.fillStyle = "rgba(56, 189, 248, 0.42)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 破れ穴ギミック（軌道変化トラップ）
      gs.holes.forEach((h) => {
        const spikes = 10;
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const rad = (i * Math.PI) / spikes + h.seed;
          const r = i % 2 === 0 ? h.r + 5 : h.r + 1;
          const px = h.x + Math.cos(rad) * r;
          const py = h.y + Math.sin(rad) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = h.cooldown > 0 ? "#f59e0b" : "#334155";
        ctx.beginPath();
        ctx.arc(h.x, h.y, h.r, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("🌀", h.x, h.y + 3);
      });

      // 大型化した左右フリッパー操作ボタン領域（盤面下部いっぱいに配置）
      const drawTouchPad = (
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        pressed: boolean
      ) => {
        ctx.save();
        ctx.fillStyle = pressed ? "#f59e0b" : "rgba(28, 25, 23, 0.92)";
        ctx.strokeStyle = pressed ? "#fef08a" : "#fbbf24";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(x, y + (pressed ? 3 : 0), w, h, 12);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pressed ? "#1c1917" : "#fef08a";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, x + w / 2, y + h / 2 + 5 + (pressed ? 3 : 0));
        ctx.restore();
      };

      drawTouchPad(16, 466, 134, 58, "◀ 左フリッパー", gs.leftPressed);
      drawTouchPad(158, 466, 134, 58, "右フリッパー ▶", gs.rightPressed);

      // 外枠・レーン壁・右上カーブガイド
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, W - 24, H - 16);

      ctx.beginPath();
      ctx.moveTo(LANE_X, b.inLane ? 102 : 16);
      ctx.lineTo(LANE_X, H - 8);
      ctx.stroke();

      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(255, 16);
      ctx.lineTo(332, 85);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(16, 375);
      ctx.lineTo(86, 435);
      ctx.moveTo(LANE_X, 375);
      ctx.lineTo(226, 435);
      ctx.stroke();

      // バンパー描画
      gs.bumpers.forEach((bmp) => {
        const scale = 1 + Math.max(0, bmp.hitAnim) * 0.22;
        ctx.save();
        ctx.translate(bmp.x, bmp.y);
        ctx.scale(scale, scale);

        if (bmp.type === "can") {
          ctx.fillStyle = "#94a3b8";
          ctx.beginPath();
          ctx.arc(0, 0, bmp.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#334155";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "#1e293b";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("缶", 0, 4);
        } else if (bmp.type === "chawan") {
          ctx.fillStyle = "#e0f2fe";
          ctx.beginPath();
          ctx.arc(0, 0, bmp.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#0369a1";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "#0c4a6e";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("茶碗", 0, 4);
        } else {
          ctx.fillStyle = "#fef08a";
          ctx.beginPath();
          ctx.ellipse(0, 0, bmp.r * 0.85, bmp.r * 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a16207";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "#713f12";
          ctx.font = "bold 12px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("小判", 0, 4);
        }
        ctx.restore();
      });

      // 借金取りブロック
      gs.collectors.forEach((c) => {
        ctx.fillStyle = "#be123c";
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("借金取り", c.x + c.w / 2, c.y + 11);
      });

      // 左右フリッパー
      const drawFlipper = (
        px: number,
        py: number,
        angle: number,
        isRight: boolean
      ) => {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(isRight ? Math.PI + angle : angle);
        ctx.fillStyle = "#ea580c";
        ctx.strokeStyle = "#451a03";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-4, -6, 56, 12, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      drawFlipper(88, 437, gs.leftFlipperAngle, false);
      drawFlipper(224, 437, gs.rightFlipperAngle, true);

      // リアルな発射バネ
      const recoilOffset =
        gs.springRecoilAnim > 0
          ? Math.sin(gs.springRecoilAnim * Math.PI * 6) * 14 * gs.springRecoilAnim
          : 0;
      const springTop = 456 + gs.plungerPower * 48 - recoilOffset;

      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(316, springTop);
      ctx.lineTo(316, 526);
      ctx.stroke();

      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const coils = 7;
      const springHeight = Math.max(8, 526 - springTop);
      for (let i = 0; i <= coils; i++) {
        const sy = springTop + (springHeight / coils) * i;
        const sx = i % 2 === 0 ? 304 : 328;
        if (i === 0) ctx.moveTo(316, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      ctx.fillStyle = "#b91c1c";
      ctx.strokeStyle = "#fef2f2";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(302, springTop - 5, 28, 10, 4);
      ctx.fill();
      ctx.stroke();

      if (gs.charging && gs.plungerPower > 0) {
        const gaugeH = 74;
        const gaugeY = 420;
        ctx.fillStyle = "rgba(28, 25, 23, 0.85)";
        ctx.beginPath();
        ctx.roundRect(280, gaugeY, 10, gaugeH, 4);
        ctx.fill();

        const fillH = gaugeH * gs.plungerPower;
        ctx.fillStyle =
          gs.plungerPower > 0.75
            ? "#ef4444"
            : gs.plungerPower > 0.45
            ? "#facc15"
            : "#22c55e";
        ctx.beginPath();
        ctx.roundRect(281, gaugeY + (gaugeH - fillH), 8, fillH, 3);
        ctx.fill();
      }

      if (b.inLane && !b.active && !gs.charging) {
        const pulse = Math.sin(Date.now() / 180) * 3;
        ctx.fillStyle = "rgba(220, 38, 38, 0.94)";
        ctx.beginPath();
        ctx.roundRect(230, 396 + pulse, 98, 28, 8);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("↓ 引いて離す", 279, 414 + pulse);
      }

      // ビー玉描画
      ctx.fillStyle = "#38bdf8";
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#0f172a";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(b.x - 2.5, b.y - 2.5, 2.5, 0, Math.PI * 2);
      ctx.fill();

      animId = requestAnimationFrame(updateAndDraw);
    };

    animId = requestAnimationFrame(updateAndDraw);
    return () => cancelAnimationFrame(animId);
  }, [phase, chapter, highScore, isEndless]);

  const toggleMute = () => {
    sfx.muted = !muted;
    setMuted(!muted);
  };

  const shareLine = () => {
    const text = encodeURIComponent(
      `ボロボロ障子の貧乏ピンボール『びんぼ～る』でハイスコア ${highScore}pt を記録したよ！ #びんぼーる #SUNミニゲーム`
    );
    window.open(`https://line.me/R/msg/text/?${text}`, "_blank");
  };

  const currentCfg = buildStageConfig(chapter, stage);

  // --- プレイ中はスマホ画面いっぱいのフルスクリーン表示 ---
  if (phase === "playing") {
    return (
      <div className="playing-fullscreen">
        <div className="playing-hud">
          <span>{currentCfg.stageName}</span>
          <span style={{ color: "#fbbf24" }}>
            {score} / {currentCfg.targetScore}pt
          </span>
          <span>{"🔵".repeat(Math.max(0, ballsLeft))}</span>
          <span style={{ color: "#fb7185" }}>
            {isEndless ? "∞" : `${timeLeft}s`}
          </span>
          <button
            onClick={toggleMute}
            style={{
              background: "#44403c",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              padding: "3px 7px",
              fontSize: "11px",
              fontWeight: 800,
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        </div>

        {toastMsg && (
          <div
            style={{
              position: "fixed",
              top: "46px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 50,
              backgroundColor: "#e11d48",
              color: "#fff",
              padding: "6px 14px",
              borderRadius: "999px",
              fontSize: "12px",
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            {toastMsg}
          </div>
        )}

        {isAdmin && (
          <button
            onClick={() => {
              gameStateRef.current.stageFinished = true;
              sfx.playClear();
              handleStageClearSuccess();
            }}
            style={{
              width: "100%",
              padding: "5px",
              marginTop: "4px",
              backgroundColor: "#e11d48",
              color: "#fff",
              border: "none",
              borderRadius: "6px",
              fontSize: "11px",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            [管理者] このステージを強制クリア
          </button>
        )}

        <div className="playing-canvas-box">
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handleCanvasPointerMove}
            onPointerUp={handleCanvasPointerUp}
            onPointerCancel={handleCanvasPointerUp}
          />
        </div>
      </div>
    );
  }

  // --- タイトル・イントロ・リザルト画面（ゲーム機ベゼルUI） ---
  return (
    <div className="page-wrap">
      <div className="console-bezel">
        <div className="console-top-bar">
          <span>
            {currentCfg.chapterTitle}（{currentCfg.mode === "target" ? "達成で即クリア！" : "サバイバル！"}）
          </span>
          <span>🥫🍚💼💰</span>
        </div>

        <div className="console-screen">
          <div className="screen-header">
            <div className="game-title-row">
              <span style={{ fontSize: "24px" }}>🏮</span>
              <h1 className="game-title">びんぼ～る</h1>
            </div>
            <span className="stage-badge">{currentCfg.stageName}</span>
          </div>

          {toastMsg && (
            <div
              style={{
                backgroundColor: "#e11d48",
                color: "#fff",
                textAlign: "center",
                padding: "6px 12px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 800,
              }}
            >
              {toastMsg}
            </div>
          )}

          {phase === "title" && (
            <>
              <div className="hero-card">
                <svg
                  width="180"
                  height="96"
                  viewBox="0 0 180 96"
                  style={{
                    borderRadius: "10px",
                    border: "3px solid #78350f",
                    backgroundColor: "#faf6eb",
                  }}
                >
                  <line x1="60" y1="0" x2="60" y2="96" stroke="#854d0e" strokeWidth="3" />
                  <line x1="120" y1="0" x2="120" y2="96" stroke="#854d0e" strokeWidth="3" />
                  <line x1="0" y1="32" x2="180" y2="32" stroke="#854d0e" strokeWidth="3" />
                  <line x1="0" y1="64" x2="180" y2="64" stroke="#854d0e" strokeWidth="3" />
                  <polygon
                    points="90,34 108,29 102,49 114,62 93,67 81,58 72,41"
                    fill="#ffffff"
                    stroke="#d6c7b2"
                    strokeWidth="1"
                  />
                  <polygon
                    points="90,38 104,34 99,49 109,59 93,63 83,56 76,43"
                    fill="#334155"
                  />
                  <circle cx="42" cy="48" r="10" fill="#38bdf8" stroke="#0f172a" strokeWidth="2" />
                  <circle cx="39" cy="45" r="3" fill="#ffffff" />
                </svg>

                <div className="prologue-title">
                  📖 プロローグ 〜貧乏からの大逆転〜
                </div>
                <p className="prologue-text">
                  破れ障子の四畳半から雨漏りアパート、借金取り、質屋の蔵を経て、
                  <br />
                  目指せ一攫千金の成金御殿！
                </p>
              </div>

              <div className="chapter-strip">
                <div className="chapter-item">
                  <span className="chapter-icon">🏚️</span>
                  <span>1.四畳半</span>
                </div>
                <div className="chapter-item">
                  <span className="chapter-icon">💧</span>
                  <span>2.雨漏り</span>
                </div>
                <div className="chapter-item">
                  <span className="chapter-icon">💼</span>
                  <span>3.借金取り</span>
                </div>
                <div className="chapter-item">
                  <span className="chapter-icon">🏯</span>
                  <span>4.質屋の蔵</span>
                </div>
                <div className="chapter-item">
                  <span className="chapter-icon">👑</span>
                  <span>5.成金御殿</span>
                </div>
              </div>

              <button
                onClick={() => {
                  setupStage(1, 1, false);
                  setPhase("stage_intro");
                }}
                className="btn-primary"
              >
                挑戦をスタートする！ →
              </button>

              {clearedMax >= 25 && (
                <button
                  onClick={() => {
                    setupStage(5, 5, true);
                    setPhase("playing");
                  }}
                  className="btn-sub"
                  style={{ backgroundColor: "#f3e8ff", borderColor: "#9333ea", color: "#6b21a8" }}
                >
                  ♾️ エンドレスモード（ライフ3制）
                </button>
              )}

              <button onClick={shareLine} className="btn-line">
                💬 LINEで友達にシェアする
              </button>

              <div className="mini-tools">
                <span className="mini-pill">🏆 最高 {highScore}pt</span>
                <button onClick={toggleMute} className="mini-pill">
                  {muted ? "🔇 消音" : "🔊 音ON"}
                </button>
                <Link href="/guide" className="mini-pill">
                  📖 遊び方・図鑑
                </Link>
              </div>

              {isAdmin && (
                <div
                  style={{
                    backgroundColor: "#ffe4e6",
                    border: "1.5px solid #e11d48",
                    borderRadius: "12px",
                    padding: "10px",
                    fontSize: "11px",
                  }}
                >
                  <div style={{ fontWeight: 800, color: "#be123c", marginBottom: "6px" }}>
                    🔧 管理者デバッグ（すーさん専用）
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "4px", marginBottom: "6px" }}>
                    {[1, 2, 3, 4, 5].map((ch) => (
                      <button
                        key={ch}
                        onClick={() => {
                          setupStage(ch, 1, false);
                          setPhase("stage_intro");
                        }}
                        style={{
                          padding: "6px 0",
                          backgroundColor: "#e11d48",
                          color: "#fff",
                          border: "none",
                          borderRadius: "6px",
                          fontWeight: 800,
                        }}
                      >
                        {ch}章
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setClearedMax(25);
                      localStorage.setItem("binball_cleared_max", "25");
                      showToast("全章解放＆エンドレス解禁！");
                    }}
                    style={{
                      width: "100%",
                      padding: "6px",
                      backgroundColor: "#b45309",
                      color: "#fff",
                      border: "none",
                      borderRadius: "6px",
                      fontWeight: 800,
                    }}
                  >
                    全章クリア済みにする
                  </button>
                </div>
              )}
            </>
          )}

          {phase === "stage_intro" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "center" }}>
              <div className="hero-card">
                <div className="prologue-title">{currentCfg.chapterTitle}</div>
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#292524" }}>
                  {currentCfg.stageName}
                </div>
                <p className="prologue-text">
                  ルール：
                  <strong style={{ color: "#b45309" }}>
                    {currentCfg.mode === "target"
                      ? "目標スコア到達で即クリア！"
                      : "0秒まで目標スコア維持サバイバル！"}
                  </strong>
                  <br />
                  目標スコア：<strong style={{ color: "#059669" }}>{currentCfg.targetScore} pt</strong> ／ 制限時間：<strong>{currentCfg.timeLimit} 秒</strong>
                </p>
              </div>
              <button onClick={() => setPhase("playing")} className="btn-primary">
                ゲームスタート！ →
              </button>
              <button onClick={() => setPhase("title")} className="btn-sub">
                タイトルへ戻る
              </button>
            </div>
          )}

          {phase === "stage_clear" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "center" }}>
              <div className="hero-card">
                <div style={{ fontSize: "24px", fontWeight: 900, color: "#b45309" }}>
                  🎉 ステージクリア！
                </div>
                <p className="prologue-text">
                  獲得スコア：<strong>{score} pt</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  const nextSt = stage < 5 ? stage + 1 : 1;
                  const nextCh = stage < 5 ? chapter : chapter + 1;
                  setupStage(nextCh, nextSt, false);
                  setPhase("stage_intro");
                }}
                className="btn-primary"
              >
                次のステージへ進む →
              </button>
            </div>
          )}

          {phase === "game_over" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "center" }}>
              <div className="hero-card">
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#e11d48" }}>
                  💸 破産！ゲームオーバー
                </div>
                <p className="prologue-text">
                  獲得スコア：<strong>{score} pt</strong>
                </p>
              </div>
              <button
                onClick={() => {
                  setupStage(chapter, stage, isEndless);
                  setPhase("playing");
                }}
                className="btn-primary"
              >
                もう一度挑戦する！ →
              </button>
              <button onClick={() => setPhase("title")} className="btn-sub">
                タイトルへ戻る
              </button>
            </div>
          )}

          {phase === "epilogue" && (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px", textAlign: "center" }}>
              <div className="hero-card">
                <div style={{ fontSize: "22px", fontWeight: 900, color: "#b45309" }}>
                  👑 祝・全章制覇！大富豪誕生！
                </div>
                <p className="prologue-text">
                  ボロボロ障子から始まった貧乏生活は、ついに成金御殿の黄金小判を制覇して大逆転！
                  <br />
                  エンドレスモードが解放されたで！
                </p>
              </div>
              <button onClick={() => setPhase("title")} className="btn-primary">
                タイトルへ戻る（エンドレス解放）
              </button>
            </div>
          )}
        </div>

        <div className="console-bottom-deco">
          <span>🏚️</span>
          <span>🥫</span>
          <span>🍚</span>
          <span>💼</span>
          <span>💰</span>
        </div>
      </div>

      <div id="ad-banner-slot" className="ad-slot-box">
        <div style={{ fontWeight: 800 }}>SPONSORED LINK / 広告スペース</div>
        <div>（ここに無料広告バナーコードを配置できます）</div>
      </div>

      <a
        href="https://okura-tataki.vercel.app/"
        target="_blank"
        rel="noopener noreferrer"
        className="series-bar"
      >
        <span>🎮 SUN ミニゲームシリーズ</span>
        <span style={{ color: "#15803d" }}>第1弾『オクラたたき』へ →</span>
      </a>

      <div className="footer-links">
        <Link href="/guide">遊び方・図鑑</Link>
        <Link href="/privacy">運営者情報・プライバシーポリシー</Link>
        <span>© SUN</span>
      </div>
    </div>
  );
}
