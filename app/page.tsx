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
      x: 115,
      y: 130,
      r: 22,
      type: chapter === 5 ? "koban" : "can",
      points: chapter === 5 ? 300 : 120,
    },
    {
      id: "b2",
      x: 205,
      y: 130,
      r: 22,
      type: chapter === 5 ? "koban" : "can",
      points: chapter === 5 ? 300 : 120,
    },
    {
      id: "b3",
      x: 160,
      y: 195,
      r: 24,
      type: chapter === 5 ? "koban" : "chawan",
      points: chapter === 5 ? 450 : 220,
    },
  ];

  if (stage >= 2 || chapter >= 2) {
    bumpers.push({
      id: "b4",
      x: 80,
      y: 235,
      r: 18,
      type: "can",
      points: 150,
    });
    bumpers.push({
      id: "b5",
      x: 240,
      y: 235,
      r: 18,
      type: "can",
      points: 150,
    });
  }

  const holes: ShojiHole[] = [];
  if (chapter === 1) {
    holes.push({ x: 160, y: 295, r: 15 + stage * 1.5 });
    if (stage >= 4) {
      holes.push({ x: 85, y: 175, r: 14 });
    }
  } else if (chapter === 2) {
    holes.push({ x: 110, y: 285, r: 16 });
    holes.push({ x: 210, y: 285, r: 16 });
  } else if (chapter === 3) {
    holes.push({ x: 160, y: 270, r: 18 });
    holes.push({ x: 75, y: 315, r: 14 });
  } else if (chapter === 4) {
    holes.push({ x: 105, y: 275, r: 17 });
    holes.push({ x: 215, y: 275, r: 17 });
    holes.push({ x: 160, y: 330, r: 15 });
  } else {
    holes.push({ x: 95, y: 290, r: 18 });
    holes.push({ x: 225, y: 290, r: 18 });
  }

  const puddles: Puddle[] = [];
  if (chapter === 2 || chapter === 4) {
    puddles.push({ x: 160, y: 245, rx: 38, ry: 22 });
    if (stage >= 3) {
      puddles.push({ x: 100, y: 185, rx: 28, ry: 18 });
    }
  }

  const collectors: DebtCollector[] = [];
  if (chapter >= 3) {
    collectors.push({
      x: 130,
      y: 240,
      w: 54,
      h: 16,
      vx: 1.4 + stage * 0.25 + (chapter - 3) * 0.4,
      minX: 55,
      maxX: 255,
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

  playLaunch(power: number) {
    if (this.muted) return;
    this.ensureCtx();
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(120, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      300 + power * 400,
      this.ctx.currentTime + 0.18
    );
    gain.gain.setValueAtTime(0.22, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
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

// --- 定数 ---
const W = 340;
const H = 500;
const LANE_X = 304;
const BALL_R = 8.5;
const GRAVITY = 0.24;

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

  // ゲーム物理状態Ref
  const gameStateRef = useRef({
    ball: { x: 320, y: 428, vx: 0, vy: 0, inLane: true, active: false },
    plungerPower: 0,
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
      gs.ball = { x: 320, y: 428, vx: 0, vy: 0, inLane: true, active: false };
      gs.plungerPower = 0;
      gs.charging = false;
      gs.leftFlipperAngle = 0.42;
      gs.rightFlipperAngle = -0.42;
      gs.bumpers = cfg.bumpers.map((b) => ({ ...b, hitAnim: 0 }));
      gs.holes = cfg.holes.map((h) => ({ ...h }));
      gs.puddles = cfg.puddles.map((p) => ({ ...p }));
      gs.collectors = cfg.collectors.map((c) => ({ ...c }));
      gs.score = 0;
      gs.ballsLeft = 3;
      gs.timeLeft = endlessMode ? 999 : cfg.timeLimit;
      gs.stageFinished = false;

      setChapter(ch);
      setStage(st);
      setIsEndless(endlessMode);
      setScore(0);
      setBallsLeft(3);
      setTimeLeft(endlessMode ? 999 : cfg.timeLimit);
    },
    []
  );

  // 発射実行（上端のカーブガイドまで確実に届く初速を確保）
  const releasePlunger = useCallback(() => {
    const gs = gameStateRef.current;
    if (gs.ball.inLane && !gs.ball.active) {
      const p = Math.max(0.45, gs.plungerPower);
      gs.ball.vy = -(16.2 + p * 5.8);
      gs.ball.vx = -0.2;
      gs.ball.active = true;
      sfx.playLaunch(p);
    }
    gs.charging = false;
    gs.plungerPower = 0;
  }, []);

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

      // 1. プランジャーチャージ
      if (gs.charging && b.inLane && !b.active) {
        gs.plungerPower = Math.min(1, gs.plungerPower + 0.03);
      }

      // 2. フリッパー角度更新
      const leftTarget = gs.leftPressed ? -0.48 : 0.42;
      const rightTarget = gs.rightPressed ? 0.48 : -0.42;
      gs.leftFlipperAngle += (leftTarget - gs.leftFlipperAngle) * 0.45;
      gs.rightFlipperAngle += (rightTarget - gs.rightFlipperAngle) * 0.45;

      // 3. 借金取り移動
      gs.collectors.forEach((c) => {
        c.x += c.vx;
        if (c.x < c.minX || c.x + c.w > c.maxX) {
          c.vx *= -1;
        }
      });

      // 線分衝突ヘルパー
      const checkSlantWall = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        boost = 0.85
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

      // 4. ボール物理演算
      if (b.active) {
        const steps = 4;
        for (let s = 0; s < steps; s++) {
          b.vy += GRAVITY / steps;
          b.x += b.vx / steps;
          b.y += b.vy / steps;

          // 外壁反射（左・上）
          if (b.x - BALL_R < 16) {
            b.x = 16 + BALL_R;
            b.vx = Math.abs(b.vx) * 0.82;
          }
          if (b.y - BALL_R < 16) {
            b.y = 16 + BALL_R;
            b.vy = Math.abs(b.vy) * 0.82;
          }

          // 右上カーブガイド（発射レーンから左のメイン盤面へ滑らかに送り出す）
          checkSlantWall(332, 22, 268, 72, 0.92);

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
            // 一度でもレーンを左へ抜けたら逆流防止ゲートを閉じる
            if (b.x < LANE_X - 8) {
              b.inLane = false;
            }
          } else {
            // メイン盤面右壁（上から下まで完全に閉じる）
            if (b.x + BALL_R > LANE_X) {
              b.x = LANE_X - BALL_R;
              b.vx = -Math.abs(b.vx) * 0.82;
            }
          }

          if (!b.inLane) {
            // 斜めガイド壁（下部左右の三角ガイド）
            checkSlantWall(16, 365, 92, 426, 0.9);
            checkSlantWall(LANE_X, 365, 228, 426, 0.9);

            // 左右フリッパー当たり判定
            const lPivotX = 94;
            const lPivotY = 428;
            const fLen = 52;
            const lx2 = lPivotX + Math.cos(gs.leftFlipperAngle) * fLen;
            const ly2 = lPivotY + Math.sin(gs.leftFlipperAngle) * fLen;
            checkSlantWall(
              lPivotX,
              lPivotY,
              lx2,
              ly2,
              gs.leftPressed ? 1.48 : 0.82
            );
            if (
              gs.leftPressed &&
              Math.hypot(b.x - (lPivotX + lx2) / 2, b.y - (lPivotY + ly2) / 2) <
                34
            ) {
              b.vy = Math.min(b.vy, -8.5);
            }

            const rPivotX = 226;
            const rPivotY = 428;
            const rx2 = rPivotX - Math.cos(-gs.rightFlipperAngle) * fLen;
            const ry2 = rPivotY + Math.sin(-gs.rightFlipperAngle) * fLen;
            checkSlantWall(
              rPivotX,
              rPivotY,
              rx2,
              ry2,
              gs.rightPressed ? 1.48 : 0.82
            );
            if (
              gs.rightPressed &&
              Math.hypot(b.x - (rPivotX + rx2) / 2, b.y - (rPivotY + ry2) / 2) <
                34
            ) {
              b.vy = Math.min(b.vy, -8.5);
            }
          }

          // バンパー衝突判定
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
              const bounceSpeed = bmp.type === "chawan" ? 9.5 : 8.2;
              b.vx = nx * bounceSpeed;
              b.vy = ny * bounceSpeed - 1.2;
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
              b.vy = Math.abs(b.vy) + 3.5;
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
              b.vx *= 0.965;
              b.vy *= 0.965;
            }
          });

          // 速度上限キャップ
          const maxSpd = 18;
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
              x: 320,
              y: 428,
              vx: 0,
              vy: 0,
              inLane: true,
              active: false,
            };
          }
        }
      }

      // --- 描画処理 ---
      ctx.clearRect(0, 0, W, H);

      // 背景：黄ばんだ和紙
      ctx.fillStyle = chapter === 5 ? "#fef3c7" : "#f5eedc";
      ctx.fillRect(0, 0, W, H);

      // 障子の木枠（格子）
      ctx.strokeStyle = chapter === 5 ? "#b45309" : "#78350f";
      ctx.lineWidth = 3;
      for (let gx = 64; gx < LANE_X; gx += 60) {
        ctx.beginPath();
        ctx.moveTo(gx, 16);
        ctx.lineTo(gx, H - 16);
        ctx.stroke();
      }
      for (let gy = 85; gy < H; gy += 75) {
        ctx.beginPath();
        ctx.moveTo(16, gy);
        ctx.lineTo(LANE_X, gy);
        ctx.stroke();
      }

      // 雨漏り水たまり
      gs.puddles.forEach((p) => {
        ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0284c7";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 破れ障子の穴
      gs.holes.forEach((h) => {
        ctx.fillStyle = "#1c1917";
        ctx.beginPath();
        const spikes = 10;
        for (let i = 0; i < spikes * 2; i++) {
          const rad = (i * Math.PI) / spikes;
          const r = i % 2 === 0 ? h.r + 3 : h.r - 3;
          const px = h.x + Math.cos(rad) * r;
          const py = h.y + Math.sin(rad) * r;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "#a8a29e";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });

      // 外枠・レーン仕切り壁・右上カーブガイド
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
      ctx.lineTo(268, 72);
      ctx.stroke();

      // 斜めガイド壁
      ctx.beginPath();
      ctx.moveTo(16, 365);
      ctx.lineTo(92, 426);
      ctx.moveTo(LANE_X, 365);
      ctx.lineTo(228, 426);
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

      // 借金取りブロック
      gs.collectors.forEach((c) => {
        ctx.fillStyle = "#be123c";
        ctx.fillRect(c.x, c.y, c.w, c.h);
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("借金取り", c.x + c.w / 2, c.y + 12);
      });

      // 左右フリッパー描画
      const drawFlipper = (
        px: number,
        py: number,
        angle: number,
        isRight: boolean
      ) => {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(isRight ? Math.PI + angle : angle);
        ctx.fillStyle = "#d97706";
        ctx.strokeStyle = "#451a03";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.roundRect(-4, -6, 56, 12, 6);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      };
      drawFlipper(94, 428, gs.leftFlipperAngle, false);
      drawFlipper(226, 428, gs.rightFlipperAngle, true);

      // 発射バネ（プランジャー）描画
      const springTop = 438 + gs.plungerPower * 38;
      ctx.fillStyle = "#dc2626";
      ctx.fillRect(308, springTop, 28, 485 - springTop);

      // パチンコ玉（ビー玉風）描画
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
                className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black text-base shadow-lg transition"
              >
                ▶ ストーリー開始（全5章）
              </button>

              {clearedMax >= 25 && (
                <button
                  onClick={() => {
                    setupStage(5, 5, true);
                    setPhase("playing");
                  }}
                  className="w-full py-3 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm shadow"
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
              className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
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
              className="w-full py-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-stone-950 font-black text-base"
            >
              スタート！
            </button>
          </div>
        )}

        {/* --- ゲームプレイ画面 --- */}
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

            <div className="relative rounded-xl overflow-hidden shadow-2xl border-2 border-amber-800">
              <canvas
                ref={canvasRef}
                width={W}
                height={H}
                className="block max-w-full h-auto"
              />
            </div>

            <div className="w-full grid grid-cols-3 gap-2 pt-1">
              <button
                onPointerDown={() => {
                  gameStateRef.current.leftPressed = true;
                  sfx.playFlipper();
                }}
                onPointerUp={() => {
                  gameStateRef.current.leftPressed = false;
                }}
                onPointerLeave={() => {
                  gameStateRef.current.leftPressed = false;
                }}
                className="py-4 rounded-xl bg-amber-600 active:bg-amber-400 text-white font-black text-sm shadow"
              >
                ◀ 左フリッパー
              </button>

              <button
                onPointerDown={() => {
                  if (
                    gameStateRef.current.ball.inLane &&
                    !gameStateRef.current.ball.active
                  ) {
                    gameStateRef.current.charging = true;
                  }
                }}
                onPointerUp={releasePlunger}
                onPointerLeave={() => {
                  if (gameStateRef.current.charging) releasePlunger();
                }}
                className="py-4 rounded-xl bg-rose-600 active:bg-rose-400 text-white font-black text-sm shadow"
              >
                🔥 発射(長押し)
              </button>

              <button
                onPointerDown={() => {
                  gameStateRef.current.rightPressed = true;
                  sfx.playFlipper();
                }}
                onPointerUp={() => {
                  gameStateRef.current.rightPressed = false;
                }}
                onPointerLeave={() => {
                  gameStateRef.current.rightPressed = false;
                }}
                className="py-4 rounded-xl bg-amber-600 active:bg-amber-400 text-white font-black text-sm shadow"
              >
                右フリッパー ▶
              </button>
            </div>
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
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
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
                className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-stone-950 font-black"
              >
                もう一度挑戦する
              </button>
              <button
                onClick={() => setPhase("title")}
                className="w-full py-2.5 rounded-xl bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold text-sm"
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
              className="w-full py-3.5 rounded-xl bg-yellow-400 hover:bg-yellow-300 text-stone-950 font-black"
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
