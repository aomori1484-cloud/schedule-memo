// ==========================================
// スケジュールメモ アプリ
// ==========================================

// --- データ管理 ---
const Storage = {
  KEY: 'schedule-memo-data',

  getAll() {
    const data = localStorage.getItem(this.KEY);
    return data ? JSON.parse(data) : [];
  },

  getByDate(dateStr) {
    return this.getAll().filter(s => s.date === dateStr);
  },

  getByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.getAll().filter(s => s.date.startsWith(prefix));
  },

  save(schedule) {
    const all = this.getAll();
    const index = all.findIndex(s => s.id === schedule.id);
    if (index >= 0) {
      all[index] = { ...schedule, updatedAt: new Date().toISOString() };
    } else {
      all.push(schedule);
    }
    localStorage.setItem(this.KEY, JSON.stringify(all));
  },

  delete(id) {
    const all = this.getAll().filter(s => s.id !== id);
    localStorage.setItem(this.KEY, JSON.stringify(all));
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  },

  // 手書きメモの次の番号を取得
  getNextHandwritingNumber(dateStr) {
    const schedules = this.getByDate(dateStr);
    const hwMemos = schedules.filter(s => /^\d+$/.test(s.title));
    if (hwMemos.length === 0) return 1;
    const maxNum = Math.max(...hwMemos.map(s => parseInt(s.title)));
    return maxNum + 1;
  }
};

// --- 日付ユーティリティ ---
const DateUtil = {
  WEEKDAYS: ['日', '月', '火', '水', '木', '金', '土'],

  format(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  formatJP(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const y = date.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const w = this.WEEKDAYS[date.getDay()];
    return `${y}年${m}月${d}日(${w})`;
  },

  formatMonthJP(year, month) {
    return `${year}年${month}月`;
  },

  getCalendarDays(year, month) {
    const firstDay = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const days = [];
    for (let i = 0; i < firstDay; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);
    return days;
  },

  today() {
    return this.format(new Date());
  }
};

// --- アプリ状態 ---
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth() + 1;
let selectedDate = null;
let editingSchedule = null;
let handwritingData = null;

// --- キャンバス状態 ---
let canvasPaths = [];
let currentCanvasPath = [];
let isDrawing = false;
let selectedColor = '#000000';
let selectedWidth = 3;
const COLORS = ['#000000', '#FF0000', '#0066FF', '#00AA00', '#FF6600'];
const WIDTHS = [2, 4, 6, 8];

// --- 手書き専用タブ状態 ---
let hwCanvasPaths = [];
let hwCurrentPath = [];
let hwIsDrawing = false;
let hwSelectedColor = '#000000';
let hwSelectedWidth = 3;

// --- 初期化 ---
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCalendar();
  initYearMonthPicker();
  initDailyModal();
  initMemoModal();
  initCanvas();
  initHandwritingTab();
  renderCalendar();
  renderTodayView();
});

// --- タブ切り替え ---
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-view`).classList.add('active');
      if (btn.dataset.tab === 'today') renderTodayView();
      if (btn.dataset.tab === 'handwriting') initHWCanvas();
    });
  });
}

// --- 年月ジャンプ ---
function initYearMonthPicker() {
  const yearSelect = document.getElementById('year-select');
  const now = new Date();
  const thisYear = now.getFullYear();
  // 2025年〜2050年までの選択肢
  for (let y = 2025; y <= 2050; y++) {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = `${y}年`;
    if (y === thisYear) opt.selected = true;
    yearSelect.appendChild(opt);
  }

  document.getElementById('month-select').value = currentMonth;

  document.getElementById('jump-btn').addEventListener('click', () => {
    currentYear = parseInt(yearSelect.value);
    currentMonth = parseInt(document.getElementById('month-select').value);
    renderCalendar();
  });

  document.getElementById('today-jump-btn').addEventListener('click', () => {
    currentYear = thisYear;
    currentMonth = now.getMonth() + 1;
    yearSelect.value = currentYear;
    document.getElementById('month-select').value = currentMonth;
    renderCalendar();
  });
}

// --- カレンダー ---
function initCalendar() {
  document.getElementById('prev-month').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 1) { currentMonth = 12; currentYear--; }
    syncPicker();
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
    syncPicker();
    renderCalendar();
  });

  document.getElementById('month-title').addEventListener('click', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth() + 1;
    syncPicker();
    renderCalendar();
  });
}

function syncPicker() {
  document.getElementById('year-select').value = currentYear;
  document.getElementById('month-select').value = currentMonth;
}

function renderCalendar() {
  document.getElementById('month-title').textContent = DateUtil.formatMonthJP(currentYear, currentMonth);
  syncPicker();

  const grid = document.getElementById('calendar-grid');
  grid.innerHTML = '';

  const days = DateUtil.getCalendarDays(currentYear, currentMonth);
  const schedules = Storage.getByMonth(currentYear, currentMonth);
  const todayStr = DateUtil.today();

  days.forEach((day, index) => {
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    if (day === null) {
      grid.appendChild(cell);
      return;
    }

    const dateStr = `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayOfWeek = index % 7;
    const count = schedules.filter(s => s.date === dateStr).length;

    if (dateStr === todayStr) cell.classList.add('today');
    if (dayOfWeek === 0) cell.classList.add('sun');
    if (dayOfWeek === 6) cell.classList.add('sat');

    cell.innerHTML = `
      <span class="day-number">${day}</span>
      ${count > 0 ? `<span class="badge">${count}</span>` : ''}
    `;

    cell.addEventListener('click', () => openDailyModal(dateStr));
    grid.appendChild(cell);
  });
}

// --- 日別モーダル ---
function initDailyModal() {
  document.getElementById('close-daily').addEventListener('click', closeDailyModal);
  document.getElementById('add-schedule-btn').addEventListener('click', () => {
    editingSchedule = null;
    openMemoModal();
  });
}

function openDailyModal(dateStr) {
  selectedDate = dateStr;
  document.getElementById('daily-date-title').textContent = DateUtil.formatJP(dateStr);
  renderDailyList();
  document.getElementById('daily-modal').classList.remove('hidden');
}

function closeDailyModal() {
  document.getElementById('daily-modal').classList.add('hidden');
  renderCalendar();
  renderTodayView();
}

function renderDailyList() {
  const list = document.getElementById('daily-schedule-list');
  const schedules = Storage.getByDate(selectedDate);

  if (schedules.length === 0) {
    list.innerHTML = `
      <div class="empty-message">
        <p>この日の予定はありません</p>
        <p>下のボタンから予定を追加しましょう</p>
      </div>
    `;
    return;
  }

  // 時間順にソート（時間なしは最後）
  schedules.sort((a, b) => {
    if (a.timeStart && b.timeStart) return a.timeStart.localeCompare(b.timeStart);
    if (a.timeStart) return -1;
    if (b.timeStart) return 1;
    return 0;
  });

  list.innerHTML = schedules.map(s => {
    const timeDisplay = s.timeStart ? `<div class="schedule-item-time">${s.timeStart}${s.timeEnd ? ' 〜 ' + s.timeEnd : ''}</div>` : '';
    return `
    <div class="schedule-item" data-id="${s.id}">
      <div class="schedule-item-content">
        ${timeDisplay}
        <div class="schedule-item-title">${escapeHtml(s.title)}</div>
        ${s.memo ? `<div class="schedule-item-memo">${escapeHtml(s.memo)}</div>` : ''}
        ${s.handwritingData ? '<div class="handwriting-badge">✏️ 手書きメモあり</div>' : ''}
      </div>
      <div class="schedule-item-actions">
        <button class="delete-btn" data-id="${s.id}" title="削除">🗑</button>
      </div>
    </div>
  `}).join('');

  // 手書きメモのサムネイルを下部に表示
  const hwSchedules = schedules.filter(s => s.handwritingData);
  if (hwSchedules.length > 0) {
    let thumbHtml = '<div class="hw-thumbnails"><h4 class="hw-thumb-title">📝 手書きメモ</h4><div class="hw-thumb-grid">';
    hwSchedules.forEach(s => {
      thumbHtml += `<div class="hw-thumb-item"><canvas class="hw-thumb-canvas" data-paths='${s.handwritingData}'></canvas><span class="hw-thumb-label">${escapeHtml(s.title)}</span></div>`;
    });
    thumbHtml += '</div></div>';
    list.insertAdjacentHTML('beforeend', thumbHtml);

    // サムネイルキャンバスを描画
    setTimeout(() => {
      list.querySelectorAll('.hw-thumb-canvas').forEach(canvas => {
        const paths = JSON.parse(canvas.dataset.paths);
        canvas.width = 150;
        canvas.height = 100;
        const ctx = canvas.getContext('2d');
        // スケーリング
        if (paths.length > 0) {
          let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
          paths.forEach(stroke => stroke.points.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.x > maxX) maxX = p.x;
            if (p.y > maxY) maxY = p.y;
          }));
          const w = maxX - minX || 1;
          const h = maxY - minY || 1;
          const scaleX = 140 / w;
          const scaleY = 90 / h;
          const scale = Math.min(scaleX, scaleY, 1);
          const offsetX = (150 - w * scale) / 2 - minX * scale;
          const offsetY = (100 - h * scale) / 2 - minY * scale;
          paths.forEach(stroke => {
            if (stroke.points.length < 2) return;
            ctx.beginPath();
            ctx.strokeStyle = stroke.color;
            ctx.lineWidth = Math.max(1, stroke.width * scale);
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.moveTo(stroke.points[0].x * scale + offsetX, stroke.points[0].y * scale + offsetY);
            for (let i = 1; i < stroke.points.length; i++) {
              ctx.lineTo(stroke.points[i].x * scale + offsetX, stroke.points[i].y * scale + offsetY);
            }
            ctx.stroke();
          });
        }
      });
    }, 50);
  }

  list.querySelectorAll('.schedule-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      const id = item.dataset.id;
      editingSchedule = schedules.find(s => s.id === id);
      openMemoModal();
    });
  });

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const schedule = schedules.find(s => s.id === id);
      if (confirm(`「${schedule.title}」を削除しますか？`)) {
        Storage.delete(id);
        renderDailyList();
      }
    });
  });
}

// --- メモモーダル ---
function initMemoModal() {
  document.getElementById('close-memo').addEventListener('click', closeMemoModal);
  document.getElementById('cancel-memo').addEventListener('click', closeMemoModal);
  document.getElementById('save-memo').addEventListener('click', saveMemo);
  document.getElementById('open-canvas-btn').addEventListener('click', openCanvasModal);
  document.getElementById('delete-handwriting').addEventListener('click', () => {
    if (confirm('手書きメモを削除しますか？')) {
      handwritingData = null;
      document.getElementById('canvas-status').classList.add('hidden');
      document.getElementById('open-canvas-btn').textContent = '✏️ 手書きメモを追加';
    }
  });

  // 30分刻みの時間選択肢を生成
  const timeOptions = generateTimeOptions();
  const startSelect = document.getElementById('memo-time-start');
  const endSelect = document.getElementById('memo-time-end');
  timeOptions.forEach(t => {
    const opt1 = document.createElement('option');
    opt1.value = t;
    opt1.textContent = t;
    startSelect.appendChild(opt1);
    const opt2 = document.createElement('option');
    opt2.value = t;
    opt2.textContent = t;
    endSelect.appendChild(opt2);
  });
}

function generateTimeOptions() {
  const options = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      options.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return options;
}

function openMemoModal() {
  const titleInput = document.getElementById('memo-title');
  const memoInput = document.getElementById('memo-text');
  const modalTitle = document.getElementById('memo-modal-title');
  const saveBtn = document.getElementById('save-memo');
  const canvasStatus = document.getElementById('canvas-status');
  const canvasBtn = document.getElementById('open-canvas-btn');
  const timeStart = document.getElementById('memo-time-start');
  const timeEnd = document.getElementById('memo-time-end');

  if (editingSchedule) {
    modalTitle.textContent = '予定の編集';
    saveBtn.textContent = '更新する';
    titleInput.value = editingSchedule.title;
    memoInput.value = editingSchedule.memo || '';
    timeStart.value = editingSchedule.timeStart || '';
    timeEnd.value = editingSchedule.timeEnd || '';
    handwritingData = editingSchedule.handwritingData || null;
  } else {
    modalTitle.textContent = '予定の追加';
    saveBtn.textContent = '保存する';
    titleInput.value = '';
    memoInput.value = '';
    timeStart.value = '';
    timeEnd.value = '';
    handwritingData = null;
  }

  if (handwritingData) {
    canvasStatus.classList.remove('hidden');
    canvasBtn.textContent = '✏️ 手書きメモを編集';
  } else {
    canvasStatus.classList.add('hidden');
    canvasBtn.textContent = '✏️ 手書きメモを追加';
  }

  document.getElementById('memo-modal').classList.remove('hidden');
}

function closeMemoModal() {
  document.getElementById('memo-modal').classList.add('hidden');
}

function saveMemo() {
  const title = document.getElementById('memo-title').value.trim();
  const memo = document.getElementById('memo-text').value.trim();
  const timeStart = document.getElementById('memo-time-start').value;
  const timeEnd = document.getElementById('memo-time-end').value;

  if (!title) {
    alert('タイトルを入力してください');
    return;
  }

  const now = new Date().toISOString();
  const schedule = {
    id: editingSchedule ? editingSchedule.id : Storage.generateId(),
    date: selectedDate,
    title,
    memo,
    timeStart: timeStart || '',
    timeEnd: timeEnd || '',
    handwritingData,
    createdAt: editingSchedule ? editingSchedule.createdAt : now,
    updatedAt: now
  };

  Storage.save(schedule);
  closeMemoModal();
  renderDailyList();
}

// --- 手書きキャンバス（モーダル版） ---
function initCanvas() {
  document.getElementById('back-from-canvas').addEventListener('click', closeCanvasModal);
  document.getElementById('undo-btn').addEventListener('click', undoCanvas);
  document.getElementById('clear-btn').addEventListener('click', clearCanvas);
  document.getElementById('save-canvas-btn').addEventListener('click', saveCanvas);

  const colorPicker = document.getElementById('color-picker');
  COLORS.forEach(color => {
    const btn = document.createElement('div');
    btn.className = `color-btn ${color === selectedColor ? 'active' : ''}`;
    btn.style.backgroundColor = color;
    btn.addEventListener('click', () => {
      selectedColor = color;
      colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    colorPicker.appendChild(btn);
  });

  const widthPicker = document.getElementById('width-picker');
  WIDTHS.forEach(width => {
    const btn = document.createElement('div');
    btn.className = `width-btn ${width === selectedWidth ? 'active' : ''}`;
    btn.innerHTML = `<div class="width-indicator" style="height:${width}px;background:#000;border-radius:${width/2}px;width:20px;"></div>`;
    btn.addEventListener('click', () => {
      selectedWidth = width;
      widthPicker.querySelectorAll('.width-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    widthPicker.appendChild(btn);
  });

  const canvas = document.getElementById('drawing-canvas');
  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', endDraw);
  canvas.addEventListener('mouseleave', endDraw);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e.touches[0]); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); draw(e.touches[0]); });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); endDraw(); });
}

function openCanvasModal() {
  const canvas = document.getElementById('drawing-canvas');
  document.getElementById('canvas-modal').classList.remove('hidden');
  setTimeout(() => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    if (handwritingData) {
      canvasPaths = JSON.parse(handwritingData);
    } else {
      canvasPaths = [];
    }
    redrawCanvas();
  }, 50);
}

function closeCanvasModal() {
  document.getElementById('canvas-modal').classList.add('hidden');
}

function getCanvasPos(e) {
  const canvas = document.getElementById('drawing-canvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function startDraw(e) {
  isDrawing = true;
  const pos = getCanvasPos(e);
  currentCanvasPath = [pos];
}

function draw(e) {
  if (!isDrawing) return;
  const pos = getCanvasPos(e);
  currentCanvasPath.push(pos);
  redrawCanvas();
  const canvas = document.getElementById('drawing-canvas');
  const ctx = canvas.getContext('2d');
  drawPath(ctx, currentCanvasPath, selectedColor, selectedWidth);
}

function endDraw() {
  if (!isDrawing) return;
  isDrawing = false;
  if (currentCanvasPath.length > 0) {
    canvasPaths.push({ points: currentCanvasPath, color: selectedColor, width: selectedWidth });
    currentCanvasPath = [];
    redrawCanvas();
  }
}

function redrawCanvas() {
  const canvas = document.getElementById('drawing-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  canvasPaths.forEach(stroke => drawPath(ctx, stroke.points, stroke.color, stroke.width));
}

function drawPath(ctx, points, color, width) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
}

function undoCanvas() { canvasPaths.pop(); redrawCanvas(); }

function clearCanvas() {
  if (confirm('手書きメモを全てクリアしますか？')) { canvasPaths = []; redrawCanvas(); }
}

function saveCanvas() {
  handwritingData = JSON.stringify(canvasPaths);
  document.getElementById('canvas-status').classList.remove('hidden');
  document.getElementById('open-canvas-btn').textContent = '✏️ 手書きメモを編集';
  closeCanvasModal();
}

// --- 手書き専用タブ ---
function initHandwritingTab() {
  document.getElementById('hw-undo-btn').addEventListener('click', () => {
    hwCanvasPaths.pop();
    redrawHWCanvas();
  });
  document.getElementById('hw-clear-btn').addEventListener('click', () => {
    if (confirm('手書きメモを全てクリアしますか？')) { hwCanvasPaths = []; redrawHWCanvas(); }
  });
  document.getElementById('hw-save-btn').addEventListener('click', saveHandwritingOnly);

  // 日付変更時にリスト更新
  document.getElementById('hw-date-input').addEventListener('change', () => {
    renderHWSavedList();
  });

  // 色ボタン
  const colorPicker = document.getElementById('hw-color-picker');
  COLORS.forEach(color => {
    const btn = document.createElement('div');
    btn.className = `color-btn ${color === hwSelectedColor ? 'active' : ''}`;
    btn.style.backgroundColor = color;
    btn.addEventListener('click', () => {
      hwSelectedColor = color;
      colorPicker.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    colorPicker.appendChild(btn);
  });

  // 太さボタン
  const widthPicker = document.getElementById('hw-width-picker');
  WIDTHS.forEach(width => {
    const btn = document.createElement('div');
    btn.className = `width-btn ${width === hwSelectedWidth ? 'active' : ''}`;
    btn.innerHTML = `<div class="width-indicator" style="height:${width}px;background:#000;border-radius:${width/2}px;width:20px;"></div>`;
    btn.addEventListener('click', () => {
      hwSelectedWidth = width;
      widthPicker.querySelectorAll('.width-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    widthPicker.appendChild(btn);
  });

  // キャンバスイベント
  const canvas = document.getElementById('hw-drawing-canvas');
  canvas.addEventListener('mousedown', hwStartDraw);
  canvas.addEventListener('mousemove', hwDraw);
  canvas.addEventListener('mouseup', hwEndDraw);
  canvas.addEventListener('mouseleave', hwEndDraw);
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); hwStartDraw(e.touches[0]); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); hwDraw(e.touches[0]); });
  canvas.addEventListener('touchend', (e) => { e.preventDefault(); hwEndDraw(); });
}

function initHWCanvas() {
  const canvas = document.getElementById('hw-drawing-canvas');
  // 日付入力を今日に設定
  document.getElementById('hw-date-input').value = DateUtil.today();
  setTimeout(() => {
    canvas.width = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    hwCanvasPaths = [];
    redrawHWCanvas();
  }, 50);
  renderHWSavedList();
}

function getHWCanvasPos(e) {
  const canvas = document.getElementById('hw-drawing-canvas');
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

function hwStartDraw(e) {
  hwIsDrawing = true;
  hwCurrentPath = [getHWCanvasPos(e)];
}

function hwDraw(e) {
  if (!hwIsDrawing) return;
  hwCurrentPath.push(getHWCanvasPos(e));
  redrawHWCanvas();
  const canvas = document.getElementById('hw-drawing-canvas');
  const ctx = canvas.getContext('2d');
  drawPath(ctx, hwCurrentPath, hwSelectedColor, hwSelectedWidth);
}

function hwEndDraw() {
  if (!hwIsDrawing) return;
  hwIsDrawing = false;
  if (hwCurrentPath.length > 0) {
    hwCanvasPaths.push({ points: hwCurrentPath, color: hwSelectedColor, width: hwSelectedWidth });
    hwCurrentPath = [];
    redrawHWCanvas();
  }
}

function redrawHWCanvas() {
  const canvas = document.getElementById('hw-drawing-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  hwCanvasPaths.forEach(stroke => drawPath(ctx, stroke.points, stroke.color, stroke.width));
}

// 手書きのみで保存（タイトルは自動番号）
function saveHandwritingOnly() {
  if (hwCanvasPaths.length === 0) {
    alert('何か描いてから保存してください');
    return;
  }

  const dateStr = document.getElementById('hw-date-input').value;
  if (!dateStr) {
    alert('日付を選択してください');
    return;
  }

  const nextNum = Storage.getNextHandwritingNumber(dateStr);
  const now = new Date().toISOString();

  const schedule = {
    id: Storage.generateId(),
    date: dateStr,
    title: String(nextNum),
    memo: '',
    handwritingData: JSON.stringify(hwCanvasPaths),
    createdAt: now,
    updatedAt: now
  };

  Storage.save(schedule);
  hwCanvasPaths = [];
  redrawHWCanvas();
  renderHWSavedList();
  alert(`手書きメモ「${nextNum}」を ${DateUtil.formatJP(dateStr)} に保存しました`);
}

function renderHWSavedList() {
  const dateStr = document.getElementById('hw-date-input').value || DateUtil.today();
  const schedules = Storage.getByDate(dateStr).filter(s => s.handwritingData);
  const container = document.getElementById('hw-saved-list');

  if (schedules.length === 0) {
    container.innerHTML = `<p class="hw-empty">${DateUtil.formatJP(dateStr)} の手書きメモはまだありません</p>`;
    return;
  }

  container.innerHTML = `<h3 class="hw-list-title">${DateUtil.formatJP(dateStr)} の手書きメモ</h3>` +
    schedules.map(s => `
      <div class="hw-saved-item" data-id="${s.id}">
        <span class="hw-saved-num">📝 ${escapeHtml(s.title)}</span>
        <button class="delete-btn hw-delete-btn" data-id="${s.id}">🗑</button>
      </div>
    `).join('');

  container.querySelectorAll('.hw-delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('この手書きメモを削除しますか？')) {
        Storage.delete(id);
        renderHWSavedList();
      }
    });
  });
}

// --- 今日ビュー ---
function renderTodayView() {
  const todayStr = DateUtil.today();
  const schedules = Storage.getByDate(todayStr);
  const container = document.getElementById('today-view');

  let html = `
    <div class="today-header">
      <h2>📝 ${DateUtil.formatJP(todayStr)}</h2>
    </div>
    <div class="schedule-list">
  `;

  if (schedules.length === 0) {
    html += `
      <div class="empty-message">
        <p>今日の予定はありません</p>
        <p>下のボタンから予定を追加しましょう</p>
      </div>
    `;
  } else {
    schedules.forEach(s => {
      html += `
        <div class="schedule-item" data-id="${s.id}">
          <div class="schedule-item-content">
            <div class="schedule-item-title">${escapeHtml(s.title)}</div>
            ${s.memo ? `<div class="schedule-item-memo">${escapeHtml(s.memo)}</div>` : ''}
            ${s.handwritingData ? '<div class="handwriting-badge">✏️ 手書きメモあり</div>' : ''}
          </div>
          <div class="schedule-item-actions">
            <button class="delete-btn" data-id="${s.id}" title="削除">🗑</button>
          </div>
        </div>
      `;
    });
  }

  html += `</div><button class="add-btn" id="today-add-btn">＋ 新しい予定を追加</button>`;
  container.innerHTML = html;

  document.getElementById('today-add-btn').addEventListener('click', () => {
    selectedDate = todayStr;
    editingSchedule = null;
    openMemoModal();
  });

  container.querySelectorAll('.schedule-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('delete-btn')) return;
      const id = item.dataset.id;
      selectedDate = todayStr;
      editingSchedule = schedules.find(s => s.id === id);
      openMemoModal();
    });
  });

  container.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const schedule = schedules.find(s => s.id === id);
      if (confirm(`「${schedule.title}」を削除しますか？`)) {
        Storage.delete(id);
        renderTodayView();
      }
    });
  });
}

// --- ユーティリティ ---
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
