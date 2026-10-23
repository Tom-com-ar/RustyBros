import { useEffect, useRef, useState } from "react";
import Phaser from "phaser";

const LEVEL_WIDTH = 2400;
const GAME_WIDTH = 960;
const GAME_HEIGHT = 520;

const formatGameTime = (seconds) => {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
};

function buildTexture(scene, key, width, height, draw) {
  if (scene.textures.exists(key)) return;
  const graphics = scene.make.graphics({ x: 0, y: 0, add: false });
  draw(graphics);
  graphics.generateTexture(key, width, height);
  graphics.destroy();
}

class RustyLevel extends Phaser.Scene {
  constructor(onStateChange, initialReward = {}, initialActive = true) {
    super("RustyLevel");
    this.onStateChange = onStateChange;
    this.score = 0;
    this.coins = 0;
    this.lives = 3;
    this.elapsed = 0;
    this.completed = false;
    this.gameOver = false;
    this.editorRewards = Number(initialReward.count) || 0;
    this.editorRewardPoints = Number(initialReward.points) || 0;
    this.score = this.editorRewardPoints;
    this.lastReward = null;
    this.initialActive = initialActive;
    this.gameActive = initialActive;
    this.levelProgress = 0;
  }

  create() {
    this.score = this.editorRewardPoints;
    this.coins = 0;
    this.lives = 3;
    this.elapsed = 0;
    this.completed = false;
    this.gameOver = false;
    this.lastReward = null;
    this.levelProgress = 5;
    this.createTextures();
    this.physics.world.setBounds(0, 0, LEVEL_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBounds(0, 0, LEVEL_WIDTH, GAME_HEIGHT);
    this.cameras.main.setBackgroundColor(0x192840);
    this.createBackground();

    this.platforms = this.physics.add.staticGroup();
    [
      [0, 500, 520], [580, 500, 470], [1120, 500, 460], [1660, 500, 740],
      [300, 390, 190], [760, 350, 180], [1220, 390, 210], [1510, 315, 180], [1870, 380, 210],
    ].forEach(([x, y, width]) => {
      const platform = this.platforms.create(x + width / 2, y, "platform");
      platform.setDisplaySize(width, 24).refreshBody();
    });

    this.player = this.physics.add.sprite(120, 440, "player");
    this.player.setCollideWorldBounds(true);
    this.player.setBounce(0.05);
    this.player.body.setSize(26, 34).setOffset(3, 2);

    this.enemies = this.physics.add.group();
    [[680, 450], [1300, 450], [1760, 450], [1940, 330]].forEach(([x, y]) => {
      const enemy = this.enemies.create(x, y, "enemy");
      enemy.setCollideWorldBounds(true);
      enemy.setVelocityX(70);
      enemy.patrolStart = x - 80;
      enemy.patrolEnd = x + 80;
    });

    this.coinsGroup = this.physics.add.group({ allowGravity: false, immovable: true });
    [[350, 340], [475, 340], [815, 300], [930, 300], [1260, 340], [1390, 340], [1550, 265], [1910, 330], [2040, 450], [2160, 450]].forEach(([x, y]) => {
      const coin = this.coinsGroup.create(x, y, "coin");
      coin.body.allowGravity = false;
      this.tweens.add({ targets: coin, y: y - 8, duration: 650, yoyo: true, repeat: -1, ease: "Sine.inOut" });
    });

    this.flag = this.physics.add.staticImage(2290, 430, "flag");
    this.flag.setSize(32, 100).setOffset(8, 0);

    this.physics.add.collider(this.player, this.platforms);
    this.physics.add.collider(this.enemies, this.platforms);
    this.physics.add.overlap(this.player, this.coinsGroup, this.collectCoin, undefined, this);
    this.physics.add.overlap(this.player, this.enemies, this.hitEnemy, undefined, this);
    this.physics.add.overlap(this.player, this.flag, this.reachFlag, undefined, this);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.keys = this.input.keyboard.addKeys({ left: "A", right: "D", jump: "SPACE" });
    this.pressedKeys = new Set();
    this.jumpRequested = false;
    this.onKeyDown = (event) => {
      const key = event.code || event.key;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW"].includes(key)) {
        event.preventDefault();
        this.pressedKeys.add(key);
        if (["ArrowUp", "Space", "KeyW"].includes(key)) this.jumpRequested = true;
      }
    };
    this.onKeyUp = (event) => { this.pressedKeys.delete(event.code || event.key); };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    this.onEditorReward = (event) => this.applyEditorReward(event.detail || {});
    window.addEventListener("rustybros:editor-reward", this.onEditorReward);

    this.hud = this.add.text(22, 18, "", {
      fontFamily: "DM Mono, monospace",
      fontSize: "16px",
      color: "#ffffff",
      backgroundColor: "#18233dcc",
      padding: { left: 13, right: 13, top: 9, bottom: 9 },
    }).setScrollFactor(0).setDepth(20);

    this.message = this.add.text(GAME_WIDTH / 2, 90, "Llega a la bandera", {
      fontFamily: "Manrope, sans-serif",
      fontSize: "22px",
      color: "#ffffff",
      stroke: "#18233b",
      strokeThickness: 5,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(20);

    if (this.editorRewards > 0) {
      this.message.setText(`+${this.editorRewardPoints} pts · Recompensas del editor`);
      this.time.delayedCall(1800, () => { if (!this.completed && !this.gameOver) this.message.setText("Llega a la bandera"); });
    }

    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);
    this.updateHud();
    this.emitState(this.editorRewards ? "Recompensas del editor aplicadas" : "Jugando");
    this.gameActive = this.initialActive;
  }

  createTextures() {
    buildTexture(this, "player", 32, 38, (g) => {
      g.fillStyle(0xef6254, 1).fillRoundedRect(2, 2, 28, 34, 7);
      g.fillStyle(0x242c45, 1).fillRect(5, 5, 22, 9);
      g.fillStyle(0xffd8a8, 1).fillCircle(11, 19, 4).fillCircle(22, 19, 4);
      g.fillStyle(0x242c45, 1).fillRect(9, 28, 5, 7).fillRect(20, 28, 5, 7);
    });
    buildTexture(this, "enemy", 34, 30, (g) => {
      g.fillStyle(0x4b5574, 1).fillRoundedRect(2, 4, 30, 22, 7);
      g.fillStyle(0xef6254, 1).fillCircle(11, 13, 3).fillCircle(23, 13, 3);
      g.fillStyle(0x242c45, 1).fillRect(7, 25, 7, 4).fillRect(20, 25, 7, 4);
    });
    buildTexture(this, "coin", 22, 22, (g) => {
      g.fillStyle(0xf6c453, 1).fillCircle(11, 11, 9);
      g.lineStyle(2, 0xffefaa, 1).strokeCircle(11, 11, 6);
      g.fillStyle(0xfff0a1, 1).fillRect(9, 6, 4, 10);
    });
    buildTexture(this, "platform", 160, 24, (g) => {
      g.fillStyle(0x4f9a8a, 1).fillRoundedRect(0, 0, 160, 24, 4);
      g.fillStyle(0x74c5a8, 1).fillRect(0, 0, 160, 6);
      g.fillStyle(0x376b69, 1).fillRect(0, 18, 160, 6);
    });
    buildTexture(this, "flag", 48, 100, (g) => {
      g.lineStyle(5, 0xf5e3c2, 1).strokeLineShape(new Phaser.Geom.Line(10, 2, 10, 98));
      g.fillStyle(0xef6254, 1).fillTriangle(12, 8, 43, 20, 12, 34);
      g.fillStyle(0xf6c453, 1).fillCircle(10, 3, 5);
    });
  }

  createBackground() {
    this.add.rectangle(LEVEL_WIDTH / 2, GAME_HEIGHT / 2, LEVEL_WIDTH, GAME_HEIGHT, 0x192840).setScrollFactor(0.08);
    this.add.rectangle(LEVEL_WIDTH / 2, 430, LEVEL_WIDTH, 180, 0x203b55).setScrollFactor(0.15);
    for (let x = 80; x < LEVEL_WIDTH; x += 180) {
      this.add.circle(x, 95 + (x % 80), 34, 0x2f5063, 0.65).setScrollFactor(0.2);
      this.add.circle(x + 55, 115 + (x % 50), 22, 0x386477, 0.55).setScrollFactor(0.2);
    }
    this.add.text(70, 455, "NIVEL 1 · BAHÍA RUST", { fontFamily: "DM Mono, monospace", fontSize: "12px", color: "#86a6ad" }).setScrollFactor(0.35);
  }

  update(_time, delta) {
    if (!this.gameActive || !this.player || this.completed || this.gameOver) return;
    this.elapsed += delta / 1000;
    const left = this.pressedKeys.has("ArrowLeft") || this.pressedKeys.has("KeyA") || this.cursors.left.isDown || this.keys.left.isDown;
    const right = this.pressedKeys.has("ArrowRight") || this.pressedKeys.has("KeyD") || this.cursors.right.isDown || this.keys.right.isDown;
    const jump = this.jumpRequested || Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.keys.jump);
    this.jumpRequested = false;

    if (left) {
      this.player.setVelocityX(-190);
      this.player.setFlipX(true);
    } else if (right) {
      this.player.setVelocityX(190);
      this.player.setFlipX(false);
    } else {
      this.player.setVelocityX(0);
    }
    if (jump && this.player.body.blocked.down) this.player.setVelocityY(-480);

    this.enemies.getChildren().forEach((enemy) => {
      if (!enemy || !enemy.active) return;
      if (enemy.x <= enemy.patrolStart) enemy.setVelocityX(70);
      if (enemy.x >= enemy.patrolEnd) enemy.setVelocityX(-70);
      enemy.setFlipX(enemy.body.velocity.x < 0);
    });

    if (this.player.y > GAME_HEIGHT + 60) {
      this.loseLife();
      if (this.gameOver) return;
    }
    const nextProgress = Math.round(Math.min(Math.max((this.player.x / 2290) * 100, 0), 100));
    if (nextProgress !== this.levelProgress) {
      this.levelProgress = nextProgress;
      this.emitState("Jugando");
    }
    this.updateHud();
  }

  collectCoin(_player, coin) {
    coin.disableBody(true, true);
    this.coins += 1;
    this.score += 25;
    this.emitState("Moneda recogida");
  }

  applyEditorReward({ type, label, points = 0 }) {
    const rewardPoints = Number(points) || 0;
    this.editorRewards += 1;
    this.editorRewardPoints += rewardPoints;
    this.score += rewardPoints;
    this.lastReward = { type: type || "editor", label: label || "Recompensa del editor", points: rewardPoints };
    this.message.setText(`+${rewardPoints} pts · ${this.lastReward.label}`);
    this.emitState(`Recompensa: ${this.lastReward.label}`, { reward: this.lastReward });
    this.time.delayedCall(1800, () => {
      if (!this.completed && !this.gameOver) this.message.setText("Llega a la bandera");
    });
  }

  hitEnemy(player, enemy) {
    if (player.body.velocity.y > 40 && player.y < enemy.y - 10) {
      enemy.disableBody(true, true);
      player.setVelocityY(-330);
      this.score += 100;
      this.emitState("Enemigo derrotado");
    } else {
      this.loseLife();
    }
  }

  loseLife() {
    if (this.completed || this.gameOver) return;
    this.lives -= 1;
    if (this.lives <= 0) {
      this.gameOver = true;
      this.message.setText("GAME OVER · Pulsa Reiniciar");
      this.emitState("Game over");
      return;
    }
    this.player.setPosition(120, 440);
    this.player.setVelocity(0, 0);
    this.message.setText(`¡Cuidado! Te quedan ${this.lives} vidas`);
    this.time.delayedCall(1300, () => { if (!this.completed && !this.gameOver) this.message.setText("Llega a la bandera"); });
    this.emitState("Vida perdida");
  }

  reachFlag() {
    if (this.completed || this.gameOver) return;
    this.completed = true;
    this.player.setVelocity(0, 0);
    this.score += 500;
    this.message.setText("¡NIVEL COMPLETADO!");
    this.emitState("Nivel completado");
  }

  restartLevel() {
    this.initialActive = true;
    this.gameActive = true;
    this.scene.restart();
  }

  setPlayActive(active) {
    this.gameActive = active;
    if (active && this.pressedKeys) this.pressedKeys.clear();
  }

  shutdown() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("rustybros:editor-reward", this.onEditorReward);
  }

  updateHud() {
    this.hud.setText(`SCORE  ${this.score.toString().padStart(4, "0")}    VIDAS  ${"♥".repeat(Math.max(this.lives, 0))}    MONEDAS  ${this.coins}    TIEMPO  ${formatGameTime(this.elapsed)}`);
  }

  emitState(status, extra = {}) {
    this.onStateChange({ score: this.score, lives: this.lives, coins: this.coins, time: this.elapsed, levelProgress: this.levelProgress, status: this.gameOver ? "Game over" : status, completed: this.completed, gameOver: this.gameOver, editorRewards: this.editorRewards, ...extra });
  }
}

export default function PlatformGame({ onProgress, editorReward = {}, isActive = true }) {
  const mountRef = useRef(null);
  const gameRef = useRef(null);
  const progressRef = useRef(onProgress);
  const [state, setState] = useState({ score: 0, lives: 3, coins: 0, time: 0, status: "Preparado", completed: false, gameOver: false });

  useEffect(() => { progressRef.current = onProgress; }, [onProgress]);

  useEffect(() => {
    if (!mountRef.current) return undefined;
    const scene = new RustyLevel((nextState) => {
      setState(nextState);
      progressRef.current?.(nextState);
    }, editorReward, isActive);
    gameRef.current = new Phaser.Game({
      type: Phaser.AUTO,
      parent: mountRef.current,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
      backgroundColor: "#192840",
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      physics: { default: "arcade", arcade: { gravity: { y: 900 }, debug: false } },
      render: { antialias: false, pixelArt: true },
      scene,
    });
    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    let frameId;
    let attempts = 0;
    const syncSceneActivity = () => {
      const scene = gameRef.current?.scene.getScene("RustyLevel");
      if (!scene && attempts < 30) {
        attempts += 1;
        frameId = window.requestAnimationFrame(syncSceneActivity);
        return;
      }
      if (!scene) return;
      scene.setPlayActive?.(isActive);
      if (isActive) {
        scene.input.keyboard.enabled = true;
        gameRef.current.scale?.refresh();
      }
    };
    syncSceneActivity();
    return () => { if (frameId) window.cancelAnimationFrame(frameId); };
  }, [isActive]);

  return <section className="game-panel">
    <div className="game-card">
      <div className="game-card-header"><div><span className="eyebrow">RB7 · RB8 · RB9 · RB10</span><h2>RustyBros: Bahía Rust</h2><p>Completa el nivel, derrota enemigos y gana recompensas del editor.</p></div><span className="pro-pill">PHASER</span></div>
      <div ref={mountRef} className="game-canvas" />
      <div className="game-controls"><span>← → / A D para moverte</span><span>↑ / ESPACIO para saltar</span><span>Gravedad y colisiones activas</span></div>
    </div>
    <aside className="game-hud-card"><span className="eyebrow">HUD · RB9</span><h3>Estado de partida</h3><div className="game-stat-grid"><div><span>Score</span><strong>{state.score}</strong></div><div><span>Vidas</span><strong>{state.lives}</strong></div><div><span>Monedas</span><strong>{state.coins}</strong></div><div><span>Tiempo</span><strong>{formatGameTime(state.time)}</strong></div></div><div className={`game-status ${state.completed ? "success" : state.gameOver ? "danger" : ""}`}><span className="status-dot" /> {state.status}</div><button className="primary-button game-restart" onClick={() => gameRef.current?.scene.getScene("RustyLevel")?.restartLevel()}>Reiniciar nivel</button><p className="panel-note">Nivel 1 completo con plataformas, enemigos, monedas, salto y bandera de fin.</p></aside>
  </section>;
}

