// ===== Snake Game - Full Featured =====
(function () {
  'use strict';

  // ===== Configuration =====
  const CONFIG = {
    speed: { slow: 150, normal: 100, fast: 65, insane: 40 },
    foodPoints: { apple: 10, star: 20, grape: 30, diamond: 50, rainbow: 100 },
    foodEmoji: { apple: '🍎', star: '⭐', grape: '🍇', diamond: '💎', rainbow: '🌈' },
    foodWeight: [60, 20, 12, 6, 2], // probability weights
    levelUpScore: 100,
    maxCombo: 10,
    comboTimeout: 3000,
  };

  // ===== Audio Engine (Web Audio API) =====
  class AudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = true;
      this.initialized = false;
    }

    init() {
      if (this.initialized) return;
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.initialized = true;
      } catch (e) {
        console.warn('Web Audio not available');
      }
    }

    play(type) {
      if (!this.enabled || !this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      const now = this.ctx.currentTime;

      switch (type) {
        case 'eat':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(523, now);
          osc.frequency.exponentialRampToValueAtTime(1047, now + 0.1);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
          osc.start(now);
          osc.stop(now + 0.15);
          break;
        case 'special':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(659, now);
          osc.frequency.exponentialRampToValueAtTime(1319, now + 0.08);
          osc.frequency.exponentialRampToValueAtTime(1568, now + 0.16);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
          osc.start(now);
          osc.stop(now + 0.25);
          break;
        case 'die':
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(440, now);
          osc.frequency.exponentialRampToValueAtTime(80, now + 0.5);
          gain.gain.setValueAtTime(0.3, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
          break;
        case 'levelup':
          osc.type = 'sine';
          [523, 659, 784, 1047].forEach((freq, i) => {
            osc.frequency.setValueAtTime(freq, now + i * 0.1);
          });
          gain.gain.setValueAtTime(0.25, now);
          gain.gain.setValueAtTime(0.25, now + 0.35);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
          osc.start(now);
          osc.stop(now + 0.5);
          break;
        case 'move':
          osc.type = 'sine';
          osc.frequency.setValueAtTime(220, now);
          gain.gain.setValueAtTime(0.05, now);
          gain.gain.exponentialRampToValueAtTime(0.01, now + 0.03);
          osc.start(now);
          osc.stop(now + 0.03);
          break;
      }
    }

    toggle() {
      this.enabled = !this.enabled;
      return this.enabled;
    }
  }

  // ===== Particle System =====
  class ParticleSystem {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.particles = [];
    }

    spawn(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 / count) * i + Math.random() * 0.5;
        const speed = 1.5 + Math.random() * 3;
        this.particles.push({
          x, y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.02 + Math.random() * 0.03,
          size: 2 + Math.random() * 4,
          color,
        });
      }
    }

    update() {
      this.particles = this.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // gravity
        p.life -= p.decay;
        return p.life > 0;
      });
    }

    draw(cellSize) {
      this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      for (const p of this.particles) {
        this.ctx.globalAlpha = p.life;
        this.ctx.fillStyle = p.color;
        this.ctx.beginPath();
        this.ctx.arc(p.x * cellSize, p.y * cellSize, p.size, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.globalAlpha = 1;
    }

    clear() {
      this.particles = [];
    }
  }

  // ===== Snake =====
  class Snake {
    constructor(gridSize) {
      this.gridSize = gridSize;
      this.reset();
    }

    reset() {
      const mid = Math.floor(this.gridSize / 2);
      this.body = [
        { x: mid, y: mid },
        { x: mid - 1, y: mid },
        { x: mid - 2, y: mid },
      ];
      this.direction = { x: 1, y: 0 };
      this.nextDirection = { x: 1, y: 0 };
      this.growing = 0;
    }

    setDirection(dx, dy) {
      // Prevent 180-degree turns
      if (this.body.length >= 2) {
        const head = this.body[0];
        const neck = this.body[1];
        if (dx === -(head.x - neck.x) && dy === -(head.y - neck.y)) return;
      }
      this.nextDirection = { x: dx, y: dy };
    }

    move(wallWalk) {
      this.direction = { ...this.nextDirection };
      const head = this.body[0];
      let newHead = {
        x: head.x + this.direction.x,
        y: head.y + this.direction.y,
      };

      // Wall wrapping
      if (wallWalk) {
        if (newHead.x < 0) newHead.x = this.gridSize - 1;
        if (newHead.x >= this.gridSize) newHead.x = 0;
        if (newHead.y < 0) newHead.y = this.gridSize - 1;
        if (newHead.y >= this.gridSize) newHead.y = 0;
      } else {
        if (newHead.x < 0 || newHead.x >= this.gridSize ||
            newHead.y < 0 || newHead.y >= this.gridSize) {
          return false; // collision with wall
        }
      }

      // Self collision
      for (let i = 0; i < this.body.length - 1 - this.growing; i++) {
        if (this.body[i].x === newHead.x && this.body[i].y === newHead.y) {
          return false;
        }
      }

      this.body.unshift(newHead);
      if (this.growing > 0) {
        this.growing--;
      } else {
        this.body.pop();
      }
      return true;
    }

    grow(amount = 1) {
      this.growing += amount;
    }

    contains(x, y) {
      return this.body.some(seg => seg.x === x && seg.y === y);
    }

    getHead() {
      return this.body[0];
    }
  }

  // ===== Food System =====
  class FoodSystem {
    constructor(gridSize) {
      this.gridSize = gridSize;
      this.current = null;
      this.specialTimer = 0;
      this.specialType = null;
      this.specialTimeout = 0;
    }

    spawn(snake, occupied) {
      // Normal food
      let pos;
      do {
        pos = {
          x: Math.floor(Math.random() * this.gridSize),
          y: Math.floor(Math.random() * this.gridSize),
        };
      } while (occupied.has(`${pos.x},${pos.y}`));

      // Determine food type by weight
      const totalWeight = CONFIG.foodWeight.reduce((a, b) => a + b, 0);
      let rand = Math.random() * totalWeight;
      let type = 'apple';
      for (let i = 0; i < CONFIG.foodWeight.length; i++) {
        rand -= CONFIG.foodWeight[i];
        if (rand <= 0) {
          type = ['apple', 'star', 'grape', 'diamond', 'rainbow'][i];
          break;
        }
      }

      this.current = { ...pos, type };

      // Randomly spawn a second special food
      if (Math.random() < 0.15 && !this.specialType) {
        let sPos;
        do {
          sPos = {
            x: Math.floor(Math.random() * this.gridSize),
            y: Math.floor(Math.random() * this.gridSize),
          };
        } while (occupied.has(`${sPos.x},${sPos.y}`) ||
                 (sPos.x === pos.x && sPos.y === pos.y));
        const specialTypes = ['star', 'grape', 'diamond'];
        this.specialType = specialTypes[Math.floor(Math.random() * specialTypes.length)];
        this.specialTimer = 80 + Math.random() * 60; // ticks before it disappears
        this.specialPosition = { ...sPos };
      }

      return this.current;
    }

    update() {
      if (this.specialType) {
        this.specialTimer--;
        if (this.specialTimer <= 0) {
          this.specialType = null;
        }
      }
    }

    hasSpecial() {
      return this.specialType !== null;
    }

    getSpecial() {
      if (!this.specialType) return null;
      return { ...this.specialPosition, type: this.specialType };
    }

    eatSpecial() {
      const type = this.specialType;
      const pos = this.specialPosition;
      this.specialType = null;
      this.specialPosition = null;
      return { x: pos.x, y: pos.y, type };
    }
  }

  // ===== Game State =====
  class Game {
    constructor() {
      this.canvas = document.getElementById('game-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.particleCanvas = document.createElement('canvas');
      this.particleCanvas.id = 'particle-canvas';
      document.getElementById('game-container').appendChild(this.particleCanvas);
      this.pCtx = this.particleCanvas.getContext('2d');

      this.audio = new AudioEngine();
      this.particles = new ParticleSystem(this.particleCanvas);

      this.gridSize = 20;
      this.cellSize = 0;
      this.wallWalk = false;
      this.skin = 'classic';
      this.speedKey = 'normal';

      this.snake = null;
      this.food = null;
      this.state = 'idle'; // idle, playing, paused, gameover
      this.score = 0;
      this.highScore = parseInt(localStorage.getItem('snakeHighScore')) || 0;
      this.level = 1;
      this.combo = 0;
      this.comboTimer = 0;
      this.lastEatTime = 0;
      this.totalEaten = 0;
      this.steps = 0;

      this.lastUpdate = 0;
      this.animationId = null;

      this.setupUI();
      this.resize();
      this.drawIdle();
      window.addEventListener('resize', () => this.resize());
    }

    // ===== UI Setup =====
    setupUI() {
      // Overlay buttons
      document.getElementById('overlay-btn').addEventListener('click', () => {
        this.audio.init();
        if (this.state === 'idle' || this.state === 'gameover') {
          this.start();
        }
      });

      // Keyboard
      document.addEventListener('keydown', (e) => this.handleKey(e));

      // D-Pad (mobile)
      document.querySelectorAll('.dpad-btn').forEach(btn => {
        const dir = btn.dataset.dir;
        const dirs = {
          up: [0, -1], down: [0, 1],
          left: [-1, 0], right: [1, 0],
        };
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          this.audio.init();
          if (this.state === 'playing') {
            this.snake.setDirection(...dirs[dir]);
          }
        });
        btn.addEventListener('mousedown', () => {
          this.audio.init();
          if (this.state === 'playing') {
            this.snake.setDirection(...dirs[dir]);
          }
        });
      });

      // Skin buttons
      document.querySelectorAll('.skin-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.skin-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.skin = btn.dataset.skin;
          document.documentElement.setAttribute('data-skin', this.skin);
        });
      });

      // Settings
      document.getElementById('speed-select').addEventListener('change', (e) => {
        this.speedKey = e.target.value;
      });

      document.getElementById('grid-size-select').addEventListener('change', (e) => {
        this.gridSize = parseInt(e.target.value);
        if (this.state !== 'idle') this.start();
      });

      document.getElementById('wall-walk-toggle').addEventListener('change', (e) => {
        this.wallWalk = e.target.checked;
      });

      document.getElementById('sound-toggle').addEventListener('change', (e) => {
        this.audio.enabled = e.target.checked;
      });

      // Update high score display
      this.updateStats();
    }

    handleKey(e) {
      const key = e.key;

      if (key === ' ' || key === 'Escape') {
        e.preventDefault();
        this.togglePause();
        return;
      }

      if (key === 'r' || key === 'R') {
        if (this.state === 'gameover' || this.state === 'playing') {
          this.start();
        }
        return;
      }

      if (key === 'm' || key === 'M') {
        e.preventDefault();
        const enabled = this.audio.toggle();
        document.getElementById('sound-toggle').checked = enabled;
        return;
      }

      if (this.state !== 'playing') return;

      const dirs = {
        ArrowUp: [0, -1], ArrowDown: [0, 1],
        ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        w: [0, -1], s: [0, 1],
        a: [-1, 0], d: [1, 0],
        W: [0, -1], S: [0, 1],
        A: [-1, 0], D: [1, 0],
      };

      if (dirs[key]) {
        e.preventDefault();
        this.snake.setDirection(...dirs[key]);
      }
    }

    togglePause() {
      if (this.state === 'playing') {
        this.state = 'paused';
        document.getElementById('pause-indicator').classList.remove('hidden');
        this.showOverlay('⏸ 暂停', '按 Space 继续', '', '继续游戏');
      } else if (this.state === 'paused') {
        this.state = 'playing';
        document.getElementById('pause-indicator').classList.add('hidden');
        this.hideOverlay();
        this.lastUpdate = performance.now();
        this.loop(this.lastUpdate);
      }
    }

    // ===== Resize =====
    resize() {
      const container = document.getElementById('game-container');
      const maxW = container.clientWidth - 4;
      const maxH = container.clientHeight - 4;
      const maxCells = Math.min(Math.floor(maxW / 25), Math.floor(maxH / 25));
      this.cellSize = Math.max(10, Math.min(30, Math.floor(Math.min(maxW, maxH) / this.gridSize)));
      this.canvas.width = this.cellSize * this.gridSize;
      this.canvas.height = this.cellSize * this.gridSize;
      this.particleCanvas.width = this.canvas.width;
      this.particleCanvas.height = this.canvas.height;
      if (this.state === 'idle') this.drawIdle();
    }

    // ===== Game Loop =====
    start() {
      this.snake = new Snake(this.gridSize);
      this.food = new FoodSystem(this.gridSize);
      this.score = 0;
      this.level = 1;
      this.combo = 0;
      this.comboTimer = 0;
      this.totalEaten = 0;
      this.steps = 0;
      this.state = 'playing';
      this.hideOverlay();
      document.getElementById('pause-indicator').classList.add('hidden');
      this.particles.clear();

      const occupied = new Set();
      this.snake.body.forEach(s => occupied.add(`${s.x},${s.y}`));
      this.food.spawn(this.snake, occupied);

      this.updateStats();
      this.lastUpdate = performance.now();
      if (this.animationId) cancelAnimationFrame(this.animationId);
      this.loop(this.lastUpdate);
    }

    loop(timestamp) {
      if (this.state !== 'playing') return;

      const speed = CONFIG.speed[this.speedKey];
      const levelBonus = Math.max(0.3, 1 - (this.level - 1) * 0.05);
      const interval = speed * levelBonus;

      if (timestamp - this.lastUpdate >= interval) {
        this.update();
        this.lastUpdate = timestamp;
      }

      this.food.update();
      this.particles.update();
      this.draw();
      this.pCtx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);
      this.particles.draw(this.cellSize);

      // Combo timer
      if (this.combo > 0) {
        this.comboTimer -= interval;
        if (this.comboTimer <= 0) {
          this.combo = 0;
          this.updateComboDisplay();
        }
      }

      this.steps++;
      this.animationId = requestAnimationFrame((t) => this.loop(t));
    }

    update() {
      const alive = this.snake.move(this.wallWalk);

      if (!alive) {
        this.gameOver();
        return;
      }

      const head = this.snake.getHead();

      // Check normal food
      if (head.x === this.food.current.x && head.y === this.food.current.y) {
        this.eatFood(this.food.current);
        this.food.spawn(this.snake, this.getOccupied());
      }

      // Check special food
      if (this.food.hasSpecial()) {
        const sp = this.food.getSpecial();
        if (head.x === sp.x && head.y === sp.y) {
          this.eatFood(sp);
          this.food.eatSpecial();
        }
      }
    }

    getOccupied() {
      const set = new Set();
      this.snake.body.forEach(s => set.add(`${s.x},${s.y}`));
      if (this.food.current) set.add(`${this.food.current.x},${this.food.current.y}`);
      if (this.food.hasSpecial()) {
        const sp = this.food.getSpecial();
        set.add(`${sp.x},${sp.y}`);
      }
      return set;
    }

    eatFood(food) {
      const now = performance.now();
      const timeSinceLastEat = now - this.lastEatTime;
      this.lastEatTime = now;

      // Combo system: eat within timeout = combo multiplier
      if (timeSinceLastEat < CONFIG.comboTimeout && this.totalEaten > 0) {
        this.combo = Math.min(this.combo + 1, CONFIG.maxCombo);
      } else {
        this.combo = 1;
      }

      const points = CONFIG.foodPoints[food.type] * this.combo;
      this.score += points;
      this.totalEaten++;
      this.snake.grow(food.type === 'rainbow' ? 3 : 1);

      // Level up
      const newLevel = Math.floor(this.score / CONFIG.levelUpScore) + 1;
      if (newLevel > this.level) {
        this.level = newLevel;
        this.audio.play('levelup');
      }

      // Audio
      if (food.type === 'apple') {
        this.audio.play('eat');
      } else {
        this.audio.play('special');
      }

      // Particles
      const colors = {
        apple: '#ff6b6b', star: '#ffd93d', grape: '#a855f7',
        diamond: '#38bdf8', rainbow: '#ff69b4',
      };
      this.particles.spawn(food.x + 0.5, food.y + 0.5, colors[food.type] || '#fff', 16);

      // Score popup
      this.showScorePopup(food.x, food.y, `+${points}`);

      // Combo display
      this.updateComboDisplay();
      this.updateStats();
    }

    updateComboDisplay() {
      let el = document.getElementById('combo-display');
      if (this.combo > 1) {
        if (!el) {
          el = document.createElement('div');
          el.id = 'combo-display';
          document.getElementById('game-container').appendChild(el);
        }
        el.textContent = `🔥 x${this.combo} COMBO`;
        el.classList.add('visible');
      } else if (el) {
        el.classList.remove('visible');
      }
    }

    showScorePopup(gridX, gridY, text) {
      const popup = document.createElement('div');
      popup.className = 'score-popup';
      popup.textContent = text;
      popup.style.left = (gridX * this.cellSize + this.cellSize / 2) + 'px';
      popup.style.top = (gridY * this.cellSize) + 'px';
      document.getElementById('game-container').appendChild(popup);
      setTimeout(() => popup.remove(), 1000);
    }

    gameOver() {
      this.state = 'gameover';
      this.audio.play('die');
      this.particles.clear();

      const isNewRecord = this.score > this.highScore;
      if (isNewRecord) {
        this.highScore = this.score;
        localStorage.setItem('snakeHighScore', this.highScore);
      }

      this.updateStats();

      let bodyHTML = `<div class="final-score">${this.score}</div>`;
      if (isNewRecord) bodyHTML += '<div class="new-record">🏆 新纪录！</div>';
      bodyHTML += `<p style="color: var(--text-secondary); margin-top: 8px;">长度: ${this.snake.body.length} | 等级: ${this.level}</p>`;

      this.showOverlay('💀 游戏结束', `得分: ${this.score}`, bodyHTML, '再来一局');
    }

    // ===== Drawing =====
    draw() {
      const ctx = this.ctx;
      const cs = this.cellSize;
      const gs = this.gridSize;
      const theme = this.getThemeColors();

      // Background
      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Grid
      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= gs; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cs, 0);
        ctx.lineTo(i * cs, gs * cs);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cs);
        ctx.lineTo(gs * cs, i * cs);
        ctx.stroke();
      }

      // Food glow
      this.drawFood(theme);

      // Snake
      this.drawSnake(theme);
    }

    drawIdle() {
      const ctx = this.ctx;
      const cs = this.cellSize;
      const gs = this.gridSize;
      const theme = this.getThemeColors();

      ctx.fillStyle = theme.bg;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      ctx.strokeStyle = theme.grid;
      ctx.lineWidth = 0.5;
      for (let i = 0; i <= gs; i++) {
        ctx.beginPath();
        ctx.moveTo(i * cs, 0);
        ctx.lineTo(i * cs, gs * cs);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * cs);
        ctx.lineTo(gs * cs, i * cs);
        ctx.stroke();
      }
    }

    drawFood(theme) {
      const ctx = this.ctx;
      const cs = this.cellSize;

      // Normal food
      if (this.food.current) {
        const f = this.food.current;
        this.drawFoodCell(f.x, f.y, f.type, cs, theme, 1);
      }

      // Special food (pulsing)
      if (this.food.hasSpecial()) {
        const sp = this.food.getSpecial();
        const pulse = 0.8 + Math.sin(this.steps * 0.15) * 0.2;
        this.drawFoodCell(sp.x, sp.y, sp.type, cs, theme, pulse);
      }
    }

    drawFoodCell(gx, gy, type, cs, theme, pulse) {
      const ctx = this.ctx;
      const cx = gx * cs + cs / 2;
      const cy = gy * cs + cs / 2;
      const colors = {
        apple: theme.apple, star: theme.star, grape: theme.grape,
        diamond: theme.diamond, rainbow: theme.rainbow,
      };
      const color = colors[type] || theme.apple;
      const radius = (cs / 2 - 2) * pulse;

      // Glow
      const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * 2);
      glow.addColorStop(0, color + '40');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(cx - radius * 2, cy - radius * 2, radius * 4, radius * 4);

      // Food body
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Emoji
      ctx.font = `${Math.floor(cs * 0.5)}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(CONFIG.foodEmoji[type] || '🍎', cx, cy + 1);
    }

    drawSnake(theme) {
      const ctx = this.ctx;
      const cs = this.cellSize;
      const body = this.snake.body;

      for (let i = body.length - 1; i >= 0; i--) {
        const seg = body[i];
        const t = i / Math.max(1, body.length - 1); // 0 = head, 1 = tail

        // Color gradient along body
        let color;
        if (i === 0) {
          color = theme.head;
        } else {
          color = this.lerpColor(theme.head, theme.tail, t);
        }

        const padding = i === 0 ? 1 : 2;
        const radius = i === 0 ? cs * 0.35 : cs * 0.3;

        // Shadow / glow for head
        if (i === 0) {
          ctx.shadowColor = theme.head;
          ctx.shadowBlur = 10;
        }

        ctx.fillStyle = color;
        this.roundRect(ctx,
          seg.x * cs + padding,
          seg.y * cs + padding,
          cs - padding * 2,
          cs - padding * 2,
          radius
        );
        ctx.fill();

        ctx.shadowBlur = 0;

        // Eyes on head
        if (i === 0) {
          this.drawEyes(seg, cs);
        }
      }
    }

    drawEyes(head, cs) {
      const ctx = this.ctx;
      const dir = this.snake.direction;
      const cx = head.x * cs + cs / 2;
      const cy = head.y * cs + cs / 2;
      const eyeOffset = cs * 0.2;
      const eyeSize = cs * 0.1;

      let e1x, e1y, e2x, e2y;
      if (dir.x === 1) { // right
        e1x = cx + eyeOffset; e1y = cy - eyeOffset;
        e2x = cx + eyeOffset; e2y = cy + eyeOffset;
      } else if (dir.x === -1) { // left
        e1x = cx - eyeOffset; e1y = cy - eyeOffset;
        e2x = cx - eyeOffset; e2y = cy + eyeOffset;
      } else if (dir.y === -1) { // up
        e1x = cx - eyeOffset; e1y = cy - eyeOffset;
        e2x = cx + eyeOffset; e2y = cy - eyeOffset;
      } else { // down
        e1x = cx - eyeOffset; e1y = cy + eyeOffset;
        e2x = cx + eyeOffset; e2y = cy + eyeOffset;
      }

      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(e1x, e1y, eyeSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e2x, e2y, eyeSize, 0, Math.PI * 2); ctx.fill();

      ctx.fillStyle = '#111';
      const pupilSize = eyeSize * 0.55;
      ctx.beginPath(); ctx.arc(e1x + dir.x * 1, e1y + dir.y * 1, pupilSize, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(e2x + dir.x * 1, e2y + dir.y * 1, pupilSize, 0, Math.PI * 2); ctx.fill();
    }

    roundRect(ctx, x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    lerpColor(c1, c2, t) {
      const r1 = parseInt(c1.slice(1, 3), 16);
      const g1 = parseInt(c1.slice(3, 5), 16);
      const b1 = parseInt(c1.slice(5, 7), 16);
      const r2 = parseInt(c2.slice(1, 3), 16);
      const g2 = parseInt(c2.slice(3, 5), 16);
      const b2 = parseInt(c2.slice(5, 7), 16);
      const r = Math.round(r1 + (r2 - r1) * t);
      const g = Math.round(g1 + (g2 - g1) * t);
      const b = Math.round(b1 + (b2 - b1) * t);
      return `rgb(${r},${g},${b})`;
    }

    getThemeColors() {
      const skinColors = {
        classic: {
          bg: '#1a1a2e', grid: 'rgba(255,255,255,0.04)',
          head: '#4ecca3', body: '#3ba88a', tail: '#2d8a6e',
          apple: '#ff6b6b', star: '#ffd93d', grape: '#a855f7',
          diamond: '#38bdf8', rainbow: '#ff69b4',
        },
        neon: {
          bg: '#0a0a0a', grid: 'rgba(0,255,255,0.03)',
          head: '#00ff88', body: '#00cc6a', tail: '#009950',
          apple: '#ff0066', star: '#ffff00', grape: '#cc00ff',
          diamond: '#00ffff', rainbow: '#ff00ff',
        },
        forest: {
          bg: '#1a2e1a', grid: 'rgba(144,238,144,0.04)',
          head: '#90ee90', body: '#66cd80', tail: '#4a9e5a',
          apple: '#ff4444', star: '#ffdd44', grape: '#8844cc',
          diamond: '#44bbcc', rainbow: '#ff88cc',
        },
        sunset: {
          bg: '#2d1b3d', grid: 'rgba(255,180,120,0.04)',
          head: '#feb47b', body: '#e8945a', tail: '#d07a3a',
          apple: '#ff5555', star: '#ffcc00', grape: '#9944cc',
          diamond: '#44aadd', rainbow: '#ff66aa',
        },
        ocean: {
          bg: '#0c1b33', grid: 'rgba(72,202,228,0.04)',
          head: '#48cae4', body: '#2da0c8', tail: '#1a7ab0',
          apple: '#ff6666', star: '#ffdd55', grape: '#aa55ee',
          diamond: '#55ddff', rainbow: '#ff77cc',
        },
        candy: {
          bg: '#2e1a3e', grid: 'rgba(255,153,204,0.04)',
          head: '#ff99cc', body: '#e077aa', tail: '#c8558a',
          apple: '#ff4466', star: '#ffee44', grape: '#bb44ee',
          diamond: '#44ddff', rainbow: '#ff44aa',
        },
      };
      return skinColors[this.skin] || skinColors.classic;
    }

    // ===== Overlay =====
    showOverlay(title, subtitle, body, btnText) {
      document.getElementById('overlay-title').textContent = title;
      document.getElementById('overlay-subtitle').textContent = subtitle || '';
      document.getElementById('overlay-body').innerHTML = body || '';
      document.getElementById('overlay-btn').textContent = btnText || '开始游戏';
      document.getElementById('overlay').classList.add('active');
    }

    hideOverlay() {
      document.getElementById('overlay').classList.remove('active');
    }

    updateStats() {
      document.getElementById('score').textContent = this.score;
      document.getElementById('high-score').textContent = this.highScore;
      document.getElementById('level').textContent = this.level;
      document.getElementById('length').textContent = this.snake ? this.snake.body.length : 3;

      // Animate score change
      const scoreEl = document.getElementById('score');
      scoreEl.style.transform = 'scale(1.3)';
      setTimeout(() => scoreEl.style.transform = 'scale(1)', 200);
    }
  }

  // ===== Start =====
  window.addEventListener('DOMContentLoaded', () => {
    window.game = new Game();
  });
})();
