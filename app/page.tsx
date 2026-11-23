"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";

// --- 型定義 ---
type GamePhase =
  | "prologue"
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

// --- ステージデータ生成（全5章・25ステージ） ---
const CHAPTER_TITLES = [
  "第1章：隙間風の四畳半",
  "第2章：雨漏りするボロアパート",
  "第3章：借金取りの玄関先",
  "第4章：質屋の蔵の奥",
  "第5章：逆転！成金御殿",
];

function buildStageConfig(chapter: number, stage: number): StageConfig {
  const idx = (chapter - 1) * 5 + (stage - 1);
  const isSurvival = chapter >= 4;
  const targetScore = 800 + idx * 350;
  const timeLimit = isSurvival ? 25 + (stage - 1) * 3 : 60;

  const bumpers: Omit<Bumper, "hitAnim">[] = [
    {
      id: "b1",
      x: 112,
      y: 128,
      r: 22,
      type: chapter === 5 ? "koban" : "can",
      points: chapter === 5 ? 300 : 120,
    },
    {
      id: "b2",
      x: 202,
      y: 128,
      r: 22,
      type: chapter === 5 ? "koban" : "can",
      points: chapter === 5 ? 300 : 120,
    },
    {
      id: "b3",
      x: 157,
      y: 192,
      r: 24,
      type: chapter === 5 ? "koban" : "chawan",
      points: chapter === 5 ? 450 : 220,
    },
  ];

  if (stage >= 2 || chapter >= 2) {
    bumpers.push({
      id: "b4",
      x: 78,
      y: 230,
      r: 18,
      type: "can",
      points: 150,
    });
    bumpers.push({
      id: "b5",
      x: 236,
      y: 230,
      r: 18,
      type: "can",
      points: 150,
    });
  }

  const holes: ShojiHole[] = [];
  if (chapter === 1) {
    holes.push({ x: 157, y: 292, r: 15 + stage * 1.4, seed: 1.1 });
    if (stage >= 4) {
      holes.push({ x: 82, y: 172, r: 14, seed: 2.3 });
    }
  } else if (chapter === 2) {
    holes.push({ x: 108, y: 282, r: 16, seed: 1.7 });
    holes.push({ x: 206, y: 282, r: 16, seed: 3.1 });
  } else if (chapter === 3) {
    holes.push({ x: 157, y: 268, r: 17, seed: 2.5 });
    holes.push({ x: 74, y: 312, r: 14, seed: 4.2 });
  } else if (chapter === 4) {
    holes.push({ x: 104, y: 272, r: 16, seed: 1.3 });
    holes.push({ x: 210, y: 272, r: 16, seed: 2.9 });
    holes.push({ x: 157, y: 326, r: 15, seed: 3.8 });
  } else {
    holes.push({ x: 94, y: 288, r: 17, seed: 2.1 });
    holes.push({ x: 220, y: 288, r: 17, seed: 4.7 });
  }

  const puddles: Puddle[] = [];
  if (chapter === 2 || chapter === 4) {
    puddles.push({ x: 157, y: 242, rx: 38, ry: 22 });
    if (stage >= 3) {
      puddles.push({ x: 98, y: 182, rx: 28, ry: 18 });
    }
  }

  const collectors: DebtCollector[] = [];
  if (chapter >= 3) {
    collectors.push({
      x: 128,
      y: 238,
      w: 54,
      h: 16,
      vx: 1.1 + stage * 0.2 + (chapter - 3) * 0.3,
      minX: 52,
      maxX: 252,
    });
  }

  return {
    chapter,
    stage,
    chapterTitle: CHAPTER_TITLES[chapter - 1],
    stageName: `ステージ ${chapter}-${stage}`,
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
    osc.frequency.setValueAtTime(160, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(420, this.ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.09);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.09);
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
      280 + power * 360,
      this.ctx.currentTime + 0.22
    );
    gain.gain.setValueAtTime(0.24, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.24);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.24);
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

// --- 定数（玉の速度・重力を遊びやすいテンポに最適化） ---
const W = 340;
const H = 500;
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

  // ゲーム物理状態Ref
  const gameStateRef = useRef({
    ball: { x: 316, y: 416, vx: 0, vy: 0, inLane: true, active: false },
    plungerPower: 0,
    springRecoilAnim: 0, // 発射後のビヨヨ〜ン振動カウンタ
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
      gs.ball = { x: 316, y: 416, vx: 0, vy: 0, inLane: true, active: false };
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

  // 発射実行（重力0.145に合わせて初速も最適化）
  const releasePlunger = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.ball.inLane && !gs.ball.active && gs.plungerPower > 0.12) {
      const p = Math.max(0.45, gs.plungerPower);
      gs.ball.vy = -(12.2 + p * 4.6);
      gs.ball.vx = -0.25;
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

    // 発射待機中で、右側の発射レーン付近（x >= 265 && y >= 310）を触ったらバネ引っ張りモード
    if (gs.ball.inLane && !gs.ball.active && x >= 265 && y >= 310) {
      activePointersRef.current.set(e.pointerId, {
        role: "plunger",
        startY: y,
        lastTickStep: 0,
      });
      gs.charging = true;
      gs.plungerPower = 0.15;
      return;
    }

    // 左半分タップで左フリッパー、右半分タップで右フリッパー
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

    // 引っ張る段階ごとに「カチカチッ」とバネの感触音を鳴らす
    const step = Math.floor(power * 6);
    if (step !== info.lastTickStep) {
      info.lastTickStep = step;
      sfx.playSpringTick(power);
    }

    if (
      gameStateRef.current.ball.inLane &&
      !gameStateRef.current.ball.active
    ) {
      gameStateRef.current.ball.y = 416 + power * 46;
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
        gameStateRef.current.ball.y = 416;
      }
    } else {
      syncFlipperPointerState();
    }
  };

  // キーボード操作
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (phase !== "playing") return;
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        if (!gameStateRef.current.leftPressed) {
          gameStateRef.current.leftPressed = true;
          sfx.playFlipper();
        }
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        if (!gameStateRef.current.rightPressed) {
          gameStateRef.current.rightPressed = true;
          sfx.playFlipper();
        }
      }
      if (e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        if (
          gameStateRef.current.ball.inLane &&
          !gameStateRef.current.ball.active
        ) {
          gameStateRef.current.charging = true;
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") {
        gameStateRef.current.leftPressed = false;
      }
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") {
        gameStateRef.current.rightPressed = false;
      }
      if (e.key === " " || e.key === "ArrowDown") {
        releasePlunger();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [phase, releasePlunger]);

  // タイマー進行
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

      if (
        gs.charging &&
        b.inLane &&
        !b.active &&
        activePointersRef.current.size === 0
      ) {
        gs.plungerPower = Math.min(1, gs.plungerPower + 0.025);
        b.y = 416 + gs.plungerPower * 46;
      }

      if (gs.springRecoilAnim > 0) {
        gs.springRecoilAnim = Math.max(0, gs.springRecoilAnim - 0.06);
      }

      // フリッパー角度更新
      const leftTarget = gs.leftPressed ? -0.48 : 0.42;
      const rightTarget = gs.rightPressed ? 0.48 : -0.42;
      gs.leftFlipperAngle += (leftTarget - gs.leftFlipperAngle) * 0.42;
      gs.rightFlipperAngle += (rightTarget - gs.rightFlipperAngle) * 0.42;

      // 借金取り移動
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

      // ボール物理演算
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

          // 右上カーブガイド
          checkSlantWall(332, 22, 260, 72, 0.9);

          // 右側発射レーン制御（ワンウェイゲート仕様）
          if (b.inLane) {
            if (b.x + BALL_R > W - 12) {
              b.x = W - 12 - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.7;
            }
            if (b.x - BALL_R < LANE_X && b.y > 92) {
              b.x = LANE_X + BALL_R;
              b.vx = Math.abs(b.vx) * 0.7;
            }
            if (b.x < LANE_X - 8) {
              b.inLane = false;
            }
          } else {
            if (b.x + BALL_R > LANE_X) {
              b.x = LANE_X - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.8;
            }
          }

          if (!b.inLane) {
            // 斜めガイド壁
            checkSlantWall(16, 355, 88, 415, 0.88);
            checkSlantWall(LANE_X, 355, 224, 415, 0.88);

            // 左右フリッパー当たり判定
            const lPivotX = 90;
            const lPivotY = 417;
            const fLen = 50;
            const lx2 = lPivotX + Math.cos(gs.leftFlipperAngle) * fLen;
            const ly2 = lPivotY + Math.sin(gs.leftFlipperAngle) * fLen;
            checkSlantWall(
              lPivotX,
              lPivotY,
              lx2,
              ly2,
              gs.leftPressed ? 1.35 : 0.8
            );
            if (
              gs.leftPressed &&
              Math.hypot(b.x - (lPivotX + lx2) / 2, b.y - (lPivotY + ly2) / 2) <
                34
            ) {
              b.vy = Math.min(b.vy, -6.8);
            }

            const rPivotX = 222;
            const rPivotY = 417;
            const rx2 = rPivotX - Math.cos(-gs.rightFlipperAngle) * fLen;
            const ry2 = rPivotY + Math.sin(-gs.rightFlipperAngle) * fLen;
            checkSlantWall(
              rPivotX,
              rPivotY,
              rx2,
              ry2,
              gs.rightPressed ? 1.35 : 0.8
            );
            if (
              gs.rightPressed &&
              Math.hypot(b.x - (rPivotX + rx2) / 2, b.y - (rPivotY + ry2) / 2) <
                34
            ) {
              b.vy = Math.min(b.vy, -6.8);
            }
          }

          // バンパー衝突判定（反発力をマイルドにして見やすく）
          gs.bumpers.forEach((bmp) => {
            if (bmp.hitAnim > 0) bmp.hitAnim -= 0.04;
            const dx = b.x - bmp.x;
            const dy = b.y - bmp.y;
            const dist = Math.hypot(dx, dy);
            if (dist < BALL_R + bmp.r && dist > 0.001) {
              const nx = dx / dist;
              const ny = dy / dist;
              b.x = bmp.x + nx * (BALL_R + bmp.r + 1);
              b.y = bmp.y + ny * (BALL_R + bmp.r + 1);
              const bounceSpeed = bmp.type === "chawan" ? 6.8 : 5.8;
              b.vx = nx * bounceSpeed;
              b.vy = ny * bounceSpeed - 0.9;
              bmp.hitAnim = 1;

              sfx.playBumper(bmp.type);
              gs.score += bmp.points;
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
          });

          // 借金取りブロック判定
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

          // 雨漏り水たまり減速判定
          gs.puddles.forEach((p) => {
            const norm =
              ((b.x - p.x) * (b.x - p.x)) / (p.rx * p.rx) +
              ((b.y - p.y) * (b.y - p.y)) / (p.ry * p.ry);
            if (norm < 1) {
              b.vx *= 0.96;
              b.vy *= 0.96;
            }
          });

          // 速度上限キャップ（11.5に抑えて目で追いやすく）
          const maxSpd = 11.5;
          const curSpd = Math.hypot(b.vx, b.vy);
          if (curSpd > maxSpd) {
            b.vx = (b.vx / curSpd) * maxSpd;
            b.vy = (b.vy / curSpd) * maxSpd;
          }
        }

        // 破れ障子の穴落下判定 & 下部ドレイン落下判定
        let lostReason = "";
        if (!b.inLane) {
          for (const h of gs.holes) {
            if (Math.hypot(b.x - h.x, b.y - h.y) < h.r - 2) {
              lostReason = "破れ障子の穴に落ちた！";
              break;
            }
          }
        }
        if (b.y > H + 12) {
          lostReason = "溝に落ちた！";
        }

        if (lostReason && !gs.stageFinished) {
          sfx.playLost();
          showToast(lostReason);
          gs.ballsLeft -= 1;
          setBallsLeft(gs.ballsLeft);

          if (gs.ballsLeft <= 0) {
            gs.stageFinished = true;
            setPhase("game_over");
          } else {
            gs.ball = {
              x: 316,
              y: 416,
              vx: 0,
              vy: 0,
              inLane: true,
              active: false,
            };
          }
        }
      }

      // --- 描画処理（リアルなボロボロ障子デザイン） ---
      ctx.clearRect(0, 0, W, H);

      // 1. 和紙ベースグラデーション（日焼けした古和紙の質感）
      const bgGrad = ctx.createLinearGradient(0, 0, W, H);
      if (chapter === 5) {
        bgGrad.addColorStop(0, "#fef9c3");
        bgGrad.addColorStop(1, "#fde68a");
      } else {
        bgGrad.addColorStop(0, "#faf6eb");
        bgGrad.addColorStop(0.5, "#f2e8cf");
        bgGrad.addColorStop(1, "#e6d5b8");
      }
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 和紙の細かい繊維模様（薄くランダム風に線を描画）
      ctx.strokeStyle = "rgba(180, 140, 90, 0.14)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 45; i++) {
        const fx = ((i * 73) % (LANE_X - 30)) + 20;
        const fy = ((i * 137) % (H - 40)) + 20;
        ctx.beginPath();
        ctx.moveTo(fx, fy);
        ctx.quadraticCurveTo(fx + 12, fy - 4, fx + 22, fy + 3);
        ctx.stroke();
      }

      // 2. 障子の組子（立体的な木枠＋落ち影）
      const drawWoodBar = (x1: number, y1: number, x2: number, y2: number) => {
        // 影
        ctx.strokeStyle = "rgba(69, 26, 3, 0.22)";
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(x1 + 2, y1 + 2);
        ctx.lineTo(x2 + 2, y2 + 2);
        ctx.stroke();

        // 木枠本体
        ctx.strokeStyle = chapter === 5 ? "#b45309" : "#854d0e";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // 木のハイライト
        ctx.strokeStyle = chapter === 5 ? "#f59e0b" : "#ca8a04";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x1 - 1, y1 - 1);
        ctx.lineTo(x2 - 1, y2 - 1);
        ctx.stroke();
      };

      for (let gx = 62; gx < LANE_X; gx += 58) {
        drawWoodBar(gx, 16, gx, H - 16);
      }
      for (let gy = 85; gy < H; gy += 74) {
        drawWoodBar(16, gy, LANE_X, gy);
      }

      // 3. 雨漏り水たまり（和紙に滲んだシミ＋水たまり）
      gs.puddles.forEach((p) => {
        ctx.fillStyle = "rgba(180, 150, 100, 0.25)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx + 6, p.ry + 5, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "rgba(56, 189, 248, 0.38)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 4. 破れ障子の穴（めくれ上がった白い破れ紙片＋奥の暗い部屋）
      gs.holes.forEach((h) => {
        const spikes = 12;
        // 外側：めくれ上がった白い和紙のフチ
        ctx.fillStyle = "#ffffff";
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const rad = (i * Math.PI) / spikes + h.seed;
          const jitter = Math.sin(i * 3.1 + h.seed) * 4;
          const r = i % 2 === 0 ? h.r + 7 + jitter : h.r + 1;
          const px = h.x + Math.cos(rad) * r;
          const py = h.y + Math.sin(rad) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#d6c7b2";
        ctx.lineWidth = 1;
        ctx.stroke();

        // 内側：破れた穴（暗い部屋の奥）
        ctx.fillStyle = "#1c1917";
        ctx.beginPath();
        for (let i = 0; i < spikes * 2; i++) {
          const rad = (i * Math.PI) / spikes + h.seed;
          const jitter = Math.sin(i * 3.1 + h.seed) * 2.5;
          const r = i % 2 === 0 ? h.r + 2 + jitter : h.r - 3;
          const px = h.x + Math.cos(rad) * r;
          const py = h.y + Math.sin(rad) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();

        // 穴の中に薄く「穴」ラベル
        ctx.fillStyle = "rgba(255,255,255,0.35)";
        ctx.font = "bold 9px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("穴", h.x, h.y + 3);
      });

      // 5. クッキリした左右フリッパー操作ボタン領域（盤面内下部）
      const drawTouchPad = (
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        pressed: boolean
      ) => {
        ctx.save();
        ctx.fillStyle = pressed ? "#f59e0b" : "rgba(28, 25, 23, 0.82)";
        ctx.strokeStyle = pressed ? "#fef08a" : "#d97706";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(x, y + (pressed ? 2 : 0), w, h, 10);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = pressed ? "#1c1917" : "#fbbf24";
        ctx.font = "bold 12px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(label, x + w / 2, y + h / 2 + 4 + (pressed ? 2 : 0));
        ctx.restore();
      };

      drawTouchPad(20, 444, 130, 40, "◀ 左フリッパー", gs.leftPressed);
      drawTouchPad(160, 444, 130, 40, "右フリッパー ▶", gs.rightPressed);

      // 6. 外枠・レーン仕切り壁・右上カーブガイド
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 8;
      ctx.strokeRect(12, 12, W - 24, H - 16);

      ctx.beginPath();
      ctx.moveTo(LANE_X, b.inLane ? 92 : 16);
      ctx.lineTo(LANE_X, H - 8);
      ctx.stroke();

      // 右上カーブガイド描画
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(332, 22);
      ctx.lineTo(260, 72);
      ctx.stroke();

      // 斜めガイド壁
      ctx.beginPath();
      ctx.moveTo(16, 355);
      ctx.lineTo(88, 415);
      ctx.moveTo(LANE_X, 355);
      ctx.lineTo(224, 415);
      ctx.stroke();

      // 7. バンパー描画
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
          ctx.font = "bold 11px sans-serif";
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
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("茶碗", 0, 4);
        } else {
          ctx.fillStyle = "#facc15";
          ctx.beginPath();
          ctx.ellipse(0, 0, bmp.r * 0.85, bmp.r * 1.1, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#a16207";
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = "#713f12";
          ctx.font = "bold 11px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("小判", 0, 4);
        }
        ctx.restore();
      });

      // 8. 借金取りブロック
      gs.collectors.forEach((c) => {
        ctx.fillStyle = "#be123c";
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("借金取り", c.x + c.w / 2, c.y + 12);
      });

      // 9. 左右フリッパー描画
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
        ctx.roundRect(-4, -6, 54, 12, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      drawFlipper(90, 417, gs.leftFlipperAngle, false);
      drawFlipper(222, 417, gs.rightFlipperAngle, true);

      // 10. リアルな発射バネ（金属コイル＋反動振動＋連動パワーゲージ）
      const recoilOffset =
        gs.springRecoilAnim > 0
          ? Math.sin(gs.springRecoilAnim * Math.PI * 6) * 14 * gs.springRecoilAnim
          : 0;
      const springTop = 426 + gs.plungerPower * 46 - recoilOffset;

      // バネの軸棒（金属シャフト）
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(316, springTop);
      ctx.lineTo(316, 488);
      ctx.stroke();

      // 金属コイル（ジグザグ立体バネ）
      ctx.strokeStyle = "#dc2626";
      ctx.lineWidth = 3;
      ctx.beginPath();
      const coils = 7;
      const springHeight = Math.max(8, 488 - springTop);
      for (let i = 0; i <= coils; i++) {
        const sy = springTop + (springHeight / coils) * i;
        const sx = i % 2 === 0 ? 304 : 328;
        if (i === 0) ctx.moveTo(316, sy);
        else ctx.lineTo(sx, sy);
      }
      ctx.stroke();

      // つまみ（赤いグリップノブ）
      ctx.fillStyle = "#b91c1c";
      ctx.strokeStyle = "#fef2f2";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(302, springTop - 5, 28, 10, 4);
      ctx.fill();
      ctx.stroke();

      // 引っ張り中のパワーゲージ（バネのすぐ左横に表示）
      if (gs.charging && gs.plungerPower > 0) {
        const gaugeH = 70;
        const gaugeY = 395;
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

      // 発射待機中の視覚ガイド（「↓ 引いて離す」）
      if (b.inLane && !b.active && !gs.charging) {
        const pulse = Math.sin(Date.now() / 180) * 3;
        ctx.fillStyle = "rgba(220, 38, 38, 0.92)";
        ctx.beginPath();
        ctx.roundRect(232, 368 + pulse, 96, 26, 8);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("↓ 引いて離す", 280, 385 + pulse);
      }

      // 11. パチンコ玉（ビー玉風）描画
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

  return (
    <div className="w-full max-w-md mx-auto min-h-screen flex flex-col justify-between bg-stone-900 text-stone-100 select-none">
      {/* ヘッダー */}
      <header className="flex items-center justify-between px-4 py-2.5 bg-stone-950 border-b border-stone-800">
        <div className="flex items-center gap-2">
          <span className="text-lg font-extrabold text-amber-400 tracking-tight">
            びんぼ～る
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-200 border border-amber-700/50">
            SUN第2弾
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleMute}
            className="text-xs px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 border border-stone-700"
          >
            {muted ? "🔇 消音" : "🔊 音ON"}
          </button>
          <Link
            href="/guide"
            className="text-xs px-2.5 py-1 rounded bg-stone-800 hover:bg-stone-700 text-amber-300 border border-stone-700"
          >
            図鑑
          </Link>
        </div>
      </header>

      {/* メインエリア */}
      <main className="flex-1 flex flex-col items-center justify-center p-3 relative">
        {toastMsg && (
          <div className="absolute top-14 z-30 px-4 py-1.5 rounded-full bg-rose-600 text-white text-xs font-bold shadow-lg animate-bounce">
            {toastMsg}
          </div>
        )}

        {/* --- タイトル画面 --- */}
        {phase === "title" && (
          <div className="w-full bg-stone-800/80 border border-stone-700 rounded-2xl p-6 text-center space-y-5 shadow-xl">
            <div className="space-y-1">
              <p className="text-xs text-amber-300 font-bold tracking-widest">
                破れ障子の貧乏ピンボール
              </p>
              <h1 className="text-4xl font-black text-amber-400 drop-shadow">
                びんぼ～る
              </h1>
            </div>

            <div className="flex justify-center">
              <svg
                width="160"
                height="120"
                viewBox="0 0 160 120"
                className="rounded-xl border-4 border-amber-900 bg-amber-50 shadow-inner"
              >
                <line x1="53" y1="0" x2="53" y2="120" stroke="#78350f" strokeWidth="3" />
                <line x1="106" y1="0" x2="106" y2="120" stroke="#78350f" strokeWidth="3" />
                <line x1="0" y1="40" x2="160" y2="40" stroke="#78350f" strokeWidth="3" />
                <line x1="0" y1="80" x2="160" y2="80" stroke="#78350f" strokeWidth="3" />
                <polygon
                  points="80,45 95,40 90,58 102,70 83,75 73,67 65,51"
                  fill="#ffffff"
                />
                <polygon
                  points="80,48 92,43 88,58 98,68 83,72 75,65 68,52"
                  fill="#1c1917"
                />
                <circle cx="42" cy="60" r="10" fill="#38bdf8" stroke="#0f172a" strokeWidth="2" />
                <circle cx="39" cy="57" r="3" fill="#ffffff" />
              </svg>
            </div>

            <div className="text-xs text-stone-300 bg-stone-900/70 py-2 px-3 rounded-lg">
              ハイスコア：<span className="text-amber-400 font-bold">{highScore} pt</span>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={() => setPhase("prologue")}
                className="w-full py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-base shadow-lg transition"
              >
                ▶ ストーリー開始（全5章）
              </button>

              {clearedMax >= 25 && (
                <button
                  onClick={() => {
                    setupStage(5, 5, true);
                    setPhase("playing");
                  }}
                  className="w-full py-3.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm shadow"
                >
                  ♾️ エンドレスモード（ライフ3制）
                </button>
              )}
            </div>

            {isAdmin && (
              <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-600 text-left space-y-2">
                <div className="text-xs font-bold text-rose-300">
                  🔧 管理者デバッグモード（すーさん専用）
                </div>
                <div className="grid grid-cols-5 gap-1">
                  {[1, 2, 3, 4, 5].map((ch) => (
                    <button
                      key={ch}
                      onClick={() => {
                        setupStage(ch, 1, false);
                        setPhase("stage_intro");
                      }}
                      className="py-1 text-xs rounded bg-rose-700 hover:bg-rose-600 text-white font-bold"
                    >
                      {ch}章へ
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => {
                    setClearedMax(25);
                    localStorage.setItem("binball_cleared_max", "25");
                    showToast("全章解放＆エンドレス解禁！");
                  }}
                  className="w-full py-1 text-xs rounded bg-amber-700 text-white font-bold"
                >
                  全章クリア済みにする
                </button>
              </div>
            )}
          </div>
        )}

        {/* --- プロローグ --- */}
        {phase === "prologue" && (
          <div className="w-full bg-stone-800 border border-stone-700 rounded-2xl p-6 space-y-5 text-center">
            <h2 className="text-lg font-bold text-amber-400">
              プロローグ：隙間風の四畳半
            </h2>
            <p className="text-sm text-stone-200 leading-relaxed text-left bg-stone-900/70 p-4 rounded-xl">
              家賃滞納3ヶ月。手元に残ったのは、ボロボロに破れた障子と1個のビー玉だけ……。
              <br />
              <br />
              「この破れ障子の上で空き缶や茶碗に玉を弾き飛ばせば、一攫千金できるかもしれん！」
              <br />
              <br />
              破れ穴に玉を落とさず、成金御殿を目指して弾き飛ばせ！
            </p>
            <button
              onClick={() => {
                setupStage(1, 1, false);
                setPhase("stage_intro");
              }}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
            >
              第1章へ進む
            </button>
          </div>
        )}

        {/* --- ステージ開始前イントロ --- */}
        {phase === "stage_intro" && (
          <div className="w-full bg-stone-800 border border-stone-700 rounded-2xl p-6 space-y-4 text-center">
            <div className="text-xs font-bold text-amber-400">
              {currentCfg.chapterTitle}
            </div>
            <h2 className="text-2xl font-black text-white">
              {currentCfg.stageName}
            </h2>
            <div className="bg-stone-900 p-4 rounded-xl space-y-1.5 text-sm">
              <div>
                ルール：
                <span className="font-bold text-amber-300">
                  {currentCfg.mode === "target"
                    ? "目標スコア到達で即クリア！"
                    : "0秒まで目標スコア維持サバイバル！"}
                </span>
              </div>
              <div>
                目標スコア：
                <span className="font-bold text-emerald-400">
                  {currentCfg.targetScore} pt
                </span>
              </div>
              <div>
                制限時間：<span className="font-bold">{currentCfg.timeLimit} 秒</span>
              </div>
            </div>
            <button
              onClick={() => setPhase("playing")}
              className="w-full py-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-base"
            >
              スタート！
            </button>
          </div>
        )}

        {/* --- ゲームプレイ画面（盤面直結タッチ操作） --- */}
        {phase === "playing" && (
          <div className="w-full flex flex-col items-center space-y-2">
            <div className="w-full flex items-center justify-between bg-stone-800 px-3 py-1.5 rounded-xl border border-stone-700 text-xs">
              <div>
                <div className="text-stone-400">
                  {isEndless ? "エンドレス" : currentCfg.stageName}
                </div>
                <div className="font-black text-amber-400 text-sm">
                  {score}{" "}
                  {!isEndless && (
                    <span className="text-[11px] text-stone-400 font-normal">
                      / {currentCfg.targetScore}pt
                    </span>
                  )}
                </div>
              </div>
              <div className="text-center">
                <div className="text-stone-400">残り玉</div>
                <div className="font-bold text-sky-300">
                  {"🔵".repeat(Math.max(0, ballsLeft))}
                </div>
              </div>
              <div className="text-right">
                <div className="text-stone-400">残り時間</div>
                <div className="font-black text-base text-rose-400">
                  {isEndless ? "∞" : `${timeLeft}s`}
                </div>
              </div>
            </div>

            {isAdmin && (
              <button
                onClick={() => {
                  gameStateRef.current.stageFinished = true;
                  sfx.playClear();
                  handleStageClearSuccess();
                }}
                className="w-full py-1 text-xs rounded bg-rose-700 text-white font-bold"
              >
                [管理者] このステージを強制クリア
              </button>
            )}

            <div className="relative rounded-xl overflow-hidden shadow-2xl border-2 border-amber-800 touch-none">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
                className="block max-w-full h-auto touch-none cursor-pointer"
              />
            </div>

            <p className="text-[11px] text-stone-400 text-center">
              右下の赤いバネを下に引っ張って発射 ／ 盤面下の左右ボタンでバー操作
            </p>
          </div>
        )}

        {/* --- ステージクリア --- */}
        {phase === "stage_clear" && (
          <div className="w-full bg-stone-800 border border-amber-500/50 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-2xl font-black text-amber-400">
              ステージクリア！
            </h2>
            <p className="text-sm text-stone-300">
              スコア：<span className="font-bold text-white">{score} pt</span>
            </p>
            <button
              onClick={() => {
                const nextSt = stage < 5 ? stage + 1 : 1;
                const nextCh = stage < 5 ? chapter : chapter + 1;
                setupStage(nextCh, nextSt, false);
                setPhase("stage_intro");
              }}
              className="w-full py-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
            >
              次のステージへ
            </button>
          </div>
        )}

        {/* --- ゲームオーバー --- */}
        {phase === "game_over" && (
          <div className="w-full bg-stone-800 border border-rose-500/50 rounded-2xl p-6 text-center space-y-4">
            <h2 className="text-2xl font-black text-rose-400">
              破産！ゲームオーバー
            </h2>
            <p className="text-sm text-stone-300">
              獲得スコア：<span className="font-bold text-white">{score} pt</span>
            </p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  setupStage(chapter, stage, isEndless);
                  setPhase("playing");
                }}
                className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
              >
                もう一度挑戦する
              </button>
              <button
                onClick={() => setPhase("title")}
                className="w-full py-3 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold text-sm"
              >
                タイトルへ戻る
              </button>
            </div>
          </div>
        )}

        {/* --- エピローグ（全25ステージ制覇） --- */}
        {phase === "epilogue" && (
          <div className="w-full bg-stone-800 border border-yellow-400 rounded-2xl p-6 text-center space-y-5">
            <h2 className="text-2xl font-black text-yellow-400">
              祝・全章制覇！大富豪誕生！
            </h2>
            <p className="text-sm text-stone-200 leading-relaxed text-left bg-stone-900/70 p-4 rounded-xl">
              ボロボロの障子から始まった貧乏ピンボール生活は、ついに成金御殿の黄金小判を制覇して大逆転！
              <br />
              <br />
              エンドレスモードが解放されたで！限界スコアに挑戦しよう！
            </p>
            <button
              onClick={() => setPhase("title")}
              className="w-full py-4 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-stone-950 font-black"
            >
              タイトルへ戻る（エンドレス解放）
            </button>
          </div>
        )}
      </main>

      {/* フッター導線 */}
      <footer className="px-4 pt-4 pb-6 space-y-4 border-t border-stone-800 bg-stone-950">
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={shareLine}
            className="flex-1 py-2.5 rounded-lg bg-[#06C755] hover:opacity-90 text-white font-bold text-xs shadow"
          >
            LINEで友達に自慢する
          </button>
          <a
            href="https://okura-tataki.vercel.app/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 py-2.5 text-center rounded-lg bg-stone-800 hover:bg-stone-700 text-emerald-300 border border-stone-700 font-bold text-xs"
          >
            第1弾『オクラたたき』へ
          </a>
        </div>

        <div className="pt-2">
          <div
            id="ad-banner-slot"
            className="w-full min-h-[60px] rounded-lg bg-stone-900 border border-dashed border-stone-700 flex items-center justify-center text-[11px] text-stone-500"
          >
            PR・広告スペース（一括組み込み予定枠）
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-[11px] text-stone-500">
          <Link href="/guide" className="hover:text-stone-300 underline">
            遊び方・図鑑
          </Link>
          <Link href="/privacy" className="hover:text-stone-300 underline">
            運営者情報・プライバシーポリシー
          </Link>
          <span>© SUN</span>
        </div>
      </footer>
    </div>
  );
}
