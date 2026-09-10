/* =========================================================================
   RAD 321 — Image Recording & Analysis
   Shared Lab Engine (lab-common.js)
   Vanilla JS, no dependencies. Used by every lab page.

   Provides:
     - RadLab.init(config)              bootstrap a lab page
     - RadLab.state                     live answer/response store
     - RadLab.save() / load()           localStorage persistence
     - RadLab.registerField(id, meta)   register a worksheet field to persist
     - RadLab.toast(msg, type)          small toast notifications
     - RadLab.buildRubric(el, rubric)   render an editable rubric table
     - RadLab.mcq(el, question)         render + grade a multiple choice question
     - RadLab.dragOrder(el, config)     render a drag-to-order activity
     - RadLab.matchPairs(el, config)    render a click-to-match activity
     - RadLab.hotspots(el, config)      render a clickable-hotspot diagram
     - RadLab.progress.update()         recompute + paint progress bar & nav chips
     - RadLab.exportReport()            open printable submission report in new tab
     - RadLab.exportJSON() / importJSON(file)
   ========================================================================= */

(function (global) {
  const STORAGE_PREFIX = 'rad321_lab_';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const RadLab = {
    config: null,
    state: {
      meta: { studentName: '', studentId: '', section: '', date: '' },
      fields: {},      // fieldId -> value
      quiz: {},        // quizId -> { selected, correct, attempts }
      activities: {},  // activityId -> { done, score, maxScore, detail }
      rubric: {},      // criterionId -> score
      rubricNotes: {},
      sections: {}      // sectionId -> completion boolean (derived)
    },
    _fieldMeta: {},     // fieldId -> {sectionId, label, type}
    _sectionRegistry: [], // ordered [{id, label, requiredFields:[], requiredActivities:[]}]

    /* ---------------------------------------------------------------- */
    /* ---------------------------------------------------------------- */
    init(config) {
      this.config = config; // {labId, labTitle, weekNumber, sections: [{id,label}]}
      this._sectionRegistry = config.sections || [];
      if (!this._checkStudentAuth()) return;
      this.load();
      this._wireMeta();
      this._wireAutosaveIndicator();
      this._wireNav();
      this._wireActionBar();
      this.theme.init();
      this.sound.init();
      this._initServerIntegration();
      this._wireRunsCSVExport();
      this._wireAttachmentUploader();
      this._wireSubmitButton();
      this._wireTeacherPresentationMode();
      window.addEventListener('beforeunload', () => this.save());
      // periodic autosave
      setInterval(() => this.save(), 8000);
      this.progress.update();
    },

    _checkStudentAuth() {
      const token = localStorage.getItem('rad321_jwt');
      const isTeacherParam = window.location.search.includes('mode=teacher');
      if (token || isTeacherParam) return true;

      // Render blocking authentication gate modal overlay
      const gate = document.createElement('div');
      gate.id = 'auth-required-modal-gate';
      gate.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(11,37,69,0.92);backdrop-filter:blur(6px);z-index:999999;display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;font-family:inherit;';
      gate.innerHTML = `
        <div style="background:#ffffff;border-radius:16px;max-width:500px;width:100%;padding:36px 30px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.4);">
          <div style="width:68px;height:68px;margin:0 auto 18px;background:#e0f2fe;color:#0284c7;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:30px;">
            <i class="fa-solid fa-lock"></i>
          </div>
          <h2 style="color:#0b2545;margin:0 0 10px;font-size:22px;">Student Authentication Required</h2>
          <p style="color:#475569;font-size:14.5px;line-height:1.6;margin:0 0 24px;">
            You must be logged in with your university student account to access this virtual laboratory simulation, record experimental runs, and submit coursework.
          </p>
          <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
            <a href="../../index.html?login=1" class="btn btn-primary" style="padding:10px 24px;text-decoration:none;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;">
              <i class="fa-solid fa-right-to-bracket"></i> Student Login
            </a>
            <a href="../../index.html?register=1" class="btn btn-teal" style="padding:10px 22px;text-decoration:none;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;">
              <i class="fa-solid fa-user-plus"></i> Self-Register
            </a>
            <a href="../../index.html" class="btn btn-secondary" style="padding:10px 20px;text-decoration:none;font-size:14px;font-weight:700;display:inline-flex;align-items:center;gap:8px;">
              Portal Home
            </a>
          </div>
        </div>
      `;
      document.body.appendChild(gate);
      return false;
    },

    /* ------------------------- persistence ---------------------------- */
    _key() { return STORAGE_PREFIX + this.config.labId; },

    save() {
      try {
        localStorage.setItem(this._key(), JSON.stringify(this.state));
        this._flashSaved();
        this._saveToServer();
      } catch (e) { console.warn('RadLab save failed', e); }
    },

    load() {
      try {
        const raw = localStorage.getItem(this._key());
        if (raw) {
          const parsed = JSON.parse(raw);
          this.state = Object.assign({}, this.state, parsed);
          this.state.fields = parsed.fields || {};
          this.state.quiz = parsed.quiz || {};
          this.state.activities = parsed.activities || {};
          this.state.rubric = parsed.rubric || {};
          this.state.rubricNotes = parsed.rubricNotes || {};
          this.state.meta = Object.assign({ studentName: '', studentId: '', section: '', date: '' }, parsed.meta || {});
        }
      } catch (e) { console.warn('RadLab load failed', e); }
    },

    resetAll() {
      if (!confirm('This will clear all your answers, simulation results, and rubric scores for this lab. Continue?')) return;
      localStorage.removeItem(this._key());
      location.reload();
    },

    _flashSaved() {
      const el = document.getElementById('autosave-dot-label');
      if (!el) return;
      el.textContent = 'Saved ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    },

    /* ------------------------- meta (student info) --------------------- */
    _wireMeta() {
      ['studentName', 'studentId', 'section', 'date'].forEach((key) => {
        const el = document.getElementById('meta-' + key);
        if (!el) return;
        el.value = this.state.meta[key] || '';
        el.addEventListener('input', () => {
          this.state.meta[key] = el.value;
          this.save();
        });
      });
      const dateEl = document.getElementById('meta-date');
      if (dateEl && !dateEl.value) {
        const localNow = new Date();
        const today = [
          localNow.getFullYear(),
          String(localNow.getMonth() + 1).padStart(2, '0'),
          String(localNow.getDate()).padStart(2, '0')
        ].join('-');
        dateEl.value = today;
        this.state.meta.date = today;
      }
    },

    /* ------------------------- generic fields --------------------------- */
    registerField(id, meta) {
      meta = meta || {};
      this._fieldMeta[id] = meta;
      const el = document.getElementById(id);
      if (!el) return;
      const saved = this.state.fields[id];
      if (saved !== undefined) {
        if (el.type === 'checkbox') el.checked = !!saved;
        else el.value = saved;
      }
      const handler = () => {
        this.state.fields[id] = (el.type === 'checkbox') ? el.checked : el.value;
        this.save();
        this.progress.update();
      };
      el.addEventListener('input', handler);
      el.addEventListener('change', handler);
    },

    registerFields(ids, sectionId) {
      ids.forEach((id) => this.registerField(id, { sectionId }));
    },

    /* ------------------------- Live Simulation Metrics ------------------- */
    renderMetrics(container, result) {
      if (!container || !result || !result.metrics) return;
      container.innerHTML = '';
      result.metrics.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'metric' + (item.status ? ' status-' + item.status : '');
        
        const header = document.createElement('div');
        header.className = 'metric-header';
        
        const label = document.createElement('span');
        label.className = 'metric-label';
        label.textContent = item.label;
        header.appendChild(label);
        
        if (item.status) {
          const badge = document.createElement('span');
          badge.className = 'metric-badge badge-' + item.status;
          badge.textContent = item.status.toUpperCase();
          header.appendChild(badge);
        }
        
        const value = document.createElement('strong');
        value.textContent = item.value + (item.unit ? ' ' + item.unit : '');
        
        const meaning = document.createElement('small');
        meaning.textContent = item.meaning;
        
        card.append(header, value, meaning);
        container.appendChild(card);
      });
    },

    /* ------------------------- toast ------------------------------------ */
    toast(msg, type) {
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.setAttribute('role', 'status');
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
      }
      const t = document.createElement('div');
      t.className = 'toast ' + (type || '');
      t.textContent = msg;
      container.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => {
        t.classList.remove('show');
        setTimeout(() => t.remove(), 300);
      }, 3200);
    },

    /* ------------------------- MCQ quiz ---------------------------------- */
    // question = {id, prompt, options:[text], correctIndex, explain, allowRetry}
    mcq(container, question) {
      const q = question;
      const wrap = document.createElement('div');
      wrap.className = 'quiz-q';
      wrap.innerHTML = `<div class="quiz-prompt" id="${q.id}-prompt"></div><div class="quiz-options" role="group" aria-labelledby="${q.id}-prompt"></div><div class="quiz-feedback" role="status" aria-live="polite"></div>`;
      wrap.querySelector('.quiz-prompt').textContent = q.prompt;
      const optWrap = wrap.querySelector('.quiz-options');
      const feedback = wrap.querySelector('.quiz-feedback');
      const saved = RadLab.state.quiz[q.id];

      function paintCorrect(selectedIndex) {
        optWrap.dataset.locked = 'true';
        [...optWrap.children].forEach((button, index) => {
          button.disabled = true;
          button.classList.toggle('selected', index === selectedIndex);
          button.classList.toggle('correct', index === q.correctIndex);
          button.setAttribute('aria-pressed', index === selectedIndex ? 'true' : 'false');
        });
      }

      q.options.forEach((opt, idx) => {
        const optEl = document.createElement('button');
        optEl.type = 'button';
        optEl.className = 'quiz-option';
        optEl.setAttribute('aria-pressed', 'false');
        const text = document.createElement('span');
        text.textContent = opt;
        optEl.appendChild(text);
        optEl.addEventListener('click', () => {
          if (optWrap.dataset.locked === 'true') return;
          [...optWrap.children].forEach((c) => { c.classList.remove('selected', 'incorrect'); c.setAttribute('aria-pressed', 'false'); });
          optEl.classList.add('selected'); optEl.setAttribute('aria-pressed', 'true');
          const isCorrect = idx === q.correctIndex;
          const previous = RadLab.state.quiz[q.id] || { attempts: [] };
          const attempts = Array.isArray(previous.attempts) ? previous.attempts.slice() : (previous.selected !== undefined ? [previous.selected] : []);
          attempts.push(idx);
          const firstCorrect = previous.firstCorrect !== undefined ? previous.firstCorrect : (attempts.length === 1 && isCorrect);
          RadLab.state.quiz[q.id] = {
            prompt: q.prompt,
            selected: idx,
            selectedText: q.options[idx],
            correct: isCorrect,
            firstCorrect,
            attempts,
            attemptCount: attempts.length
          };
          if (isCorrect) {
            paintCorrect(idx);
            feedback.className = 'quiz-feedback show correct';
            feedback.textContent = 'Correct — ' + (q.explain || '');
          } else {
            optEl.classList.add('incorrect');
            feedback.className = 'quiz-feedback show incorrect';
            feedback.textContent = q.allowRetry === false ? 'Not correct.' : 'Not yet. Review the related concept and try again.';
            if (q.allowRetry === false) optWrap.dataset.locked = 'true';
          }
          RadLab.save();
          RadLab.progress.update();
        });
        optWrap.appendChild(optEl);
      });

      if (saved && saved.selected !== undefined) {
        if (saved.correct) {
          paintCorrect(saved.selected);
          feedback.className = 'quiz-feedback show correct';
          feedback.textContent = 'Correct — ' + (q.explain || '');
        } else {
          const selectedButton = optWrap.children[saved.selected];
          if (selectedButton) selectedButton.classList.add('selected', 'incorrect');
          feedback.className = 'quiz-feedback show incorrect';
          feedback.textContent = 'Previous answer was not correct. Try again.';
        }
      }

      container.appendChild(wrap);
    },

    /* Retry-able MCQ set summary — call to get score out of total */
    quizScore(ids) {
      let correct = 0;
      ids.forEach((id) => { if (RadLab.state.quiz[id] && RadLab.state.quiz[id].correct) correct++; });
      return { correct, total: ids.length };
    },

    buildQuiz(container, questions, ids) {
      if (!container) return;
      container.innerHTML = '';
      const list = Array.isArray(questions) ? questions : (questions && typeof questions === 'object' ? Object.values(questions) : []);
      list.forEach(q => this.mcq(container, q));
    },

    /* ------------------------- Drag to order ------------------------------ */
    // config = {id, items:[{id,label}], correctOrder:[ids...]}
    dragOrder(container, config) {
      const wrap = document.createElement('div');
      wrap.className = 'dragzone';
      wrap.id = config.id + '-zone';

      let order = (RadLab.state.activities[config.id] && RadLab.state.activities[config.id].order) || config.items.map(i => i.id);
      // shuffle initial order if never attempted
      if (!RadLab.state.activities[config.id]) {
        order = [...order];
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [order[i], order[j]] = [order[j], order[i]];
        }
      }

      function render() {
        wrap.innerHTML = '';
        order.forEach((itemId, idx) => {
          const item = config.items.find(i => i.id === itemId);
          const el = document.createElement('div');
          el.className = 'drag-item';
          el.draggable = true;
          el.dataset.id = itemId;
          el.innerHTML = `<span class="drag-handle" aria-hidden="true">☰</span><span class="drag-label"></span><span class="drag-key-controls"><button type="button" aria-label="Move ${item.label} up">↑</button><button type="button" aria-label="Move ${item.label} down">↓</button></span>`;
          el.querySelector('.drag-label').textContent = `${idx + 1}. ${item.label}`;
          const moveButtons = el.querySelectorAll('.drag-key-controls button');
          moveButtons[0].disabled = idx === 0;
          moveButtons[1].disabled = idx === order.length - 1;
          moveButtons[0].addEventListener('click', () => {
            if (idx === 0) return;
            [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
            render();
          });
          moveButtons[1].addEventListener('click', () => {
            if (idx === order.length - 1) return;
            [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
            render();
          });
          el.addEventListener('dragstart', () => el.classList.add('dragging'));
          el.addEventListener('dragend', () => {
            el.classList.remove('dragging');
            persistAndCheck();
          });
          wrap.appendChild(el);
        });
      }

      wrap.addEventListener('dragover', (e) => {
        e.preventDefault();
        const dragging = wrap.querySelector('.dragging');
        if (!dragging) return;
        const afterEl = [...wrap.querySelectorAll('.drag-item:not(.dragging)')].reduce((closest, child) => {
          const box = child.getBoundingClientRect();
          const offset = e.clientY - box.top - box.height / 2;
          if (offset < 0 && offset > closest.offset) return { offset, element: child };
          return closest;
        }, { offset: Number.NEGATIVE_INFINITY }).element;
        if (afterEl == null) wrap.appendChild(dragging);
        else wrap.insertBefore(dragging, afterEl);
        // renumber labels live
        [...wrap.children].forEach((el, idx) => {
          const item = config.items.find(i => i.id === el.dataset.id);
          el.querySelector('.drag-label').textContent = `${idx + 1}. ${item.label}`;
        });
      });

      function persistAndCheck() {
        order = [...wrap.children].map(c => c.dataset.id);
        const isCorrect = JSON.stringify(order) === JSON.stringify(config.correctOrder);
        RadLab.state.activities[config.id] = { done: isCorrect, order, correct: isCorrect, maxScore: 1, score: isCorrect ? 1 : 0 };
        RadLab.save();
        RadLab.progress.update();
      }

      render();
      container.appendChild(wrap);

      const checkBtn = document.createElement('button');
      checkBtn.className = 'btn btn-secondary btn-sm';
      checkBtn.style.marginTop = '12px';
      checkBtn.textContent = 'Check Order';
      checkBtn.addEventListener('click', () => {
        order = [...wrap.children].map(c => c.dataset.id);
        const correctOrder = config.correctOrder;
        [...wrap.children].forEach((el, idx) => {
          el.classList.remove('correct-pos', 'incorrect-pos');
          el.classList.add(order[idx] === correctOrder[idx] ? 'correct-pos' : 'incorrect-pos');
        });
        const isCorrect = JSON.stringify(order) === JSON.stringify(correctOrder);
        RadLab.state.activities[config.id] = { done: isCorrect, order, correct: isCorrect, maxScore: 1, score: isCorrect ? 1 : 0 };
        RadLab.save();
        RadLab.progress.update();
        RadLab.toast(isCorrect ? 'Correct order! ✔' : 'Some steps are out of order — highlighted in red.', isCorrect ? 'success' : 'error');
      });
      container.appendChild(checkBtn);

      const saved = RadLab.state.activities[config.id];
      if (saved && saved.correct) {
        setTimeout(() => {
          [...wrap.children].forEach((el) => el.classList.add('correct-pos'));
        }, 50);
      }
    },

    /* ------------------------- Match pairs -------------------------------- */
    // config = {id, left:[{id,label}], right:[{id,label}], pairs:{leftId:rightId}}
    matchPairs(container, config) {
      const grid = document.createElement('div');
      grid.className = 'match-grid';
      const leftCol = document.createElement('div');
      const rightCol = document.createElement('div');
      leftCol.innerHTML = `<div class="match-col-title">${config.leftTitle || 'Item'}</div>`;
      rightCol.innerHTML = `<div class="match-col-title">${config.rightTitle || 'Match'}</div>`;

      const saved = RadLab.state.activities[config.id] || { matched: {} };
      let selectedLeft = null;
      const rightShuffled = [...config.right].sort(() => Math.random() - 0.5);

      const leftEls = {}, rightEls = {};

      config.left.forEach((item) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'match-item';
        el.textContent = item.label;
        el.dataset.id = item.id;
        if (saved.matched[item.id]) {
          const isCorrect = saved.matched[item.id] === config.pairs[item.id];
          el.classList.add(isCorrect ? 'matched-correct' : 'matched-incorrect');
        }
        el.addEventListener('click', () => {
          if (el.classList.contains('matched-correct')) return;
          [...leftCol.querySelectorAll('.match-item')].forEach(e => { e.classList.remove('selected'); e.setAttribute('aria-pressed', 'false'); });
          el.classList.remove('matched-incorrect');
          el.classList.add('selected');
          el.setAttribute('aria-pressed', 'true');
          selectedLeft = item.id;
        });
        leftEls[item.id] = el;
        leftCol.appendChild(el);
      });

      rightShuffled.forEach((item) => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'match-item';
        el.textContent = item.label;
        el.dataset.id = item.id;
        el.addEventListener('click', () => {
          if (!selectedLeft) { RadLab.toast('Select an item on the left first.'); return; }
          const isCorrect = config.pairs[selectedLeft] === item.id;
          leftEls[selectedLeft].classList.remove('selected', 'matched-incorrect');
          leftEls[selectedLeft].setAttribute('aria-pressed', 'false');
          leftEls[selectedLeft].classList.add(isCorrect ? 'matched-correct' : 'matched-incorrect');
          saved.matched[selectedLeft] = item.id;
          const totalPairs = Object.keys(config.pairs).length;
          const correctCount = Object.keys(saved.matched).filter(k => saved.matched[k] === config.pairs[k]).length;
          RadLab.state.activities[config.id] = { done: correctCount === totalPairs, matched: saved.matched, score: correctCount, maxScore: totalPairs };
          RadLab.save();
          RadLab.progress.update();
          selectedLeft = null;
        });
        rightEls[item.id] = el;
        rightCol.appendChild(el);
      });

      grid.appendChild(leftCol);
      grid.appendChild(rightCol);
      container.appendChild(grid);
    },

    /* ------------------------- Hotspots on diagram ------------------------- */
    // config = {id, imageSrc, imageAlt, points:[{x,y,label,detail}]} x,y in %
    hotspots(container, config) {
      const wrap = document.createElement('div');
      wrap.className = 'hotspot-wrap';
      const img = document.createElement('img');
      img.src = config.imageSrc;
      img.alt = config.imageAlt || '';
      wrap.appendChild(img);

      const caption = document.createElement('div');
      caption.className = 'hotspot-caption';
      caption.setAttribute('role', 'status');
      caption.setAttribute('aria-live', 'polite');
      caption.textContent = 'Click each numbered marker to reveal what it is.';

      const saved = RadLab.state.activities[config.id] || { identified: {} };

      config.points.forEach((pt, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'hotspot' + (saved.identified[idx] ? ' identified' : '');
        dot.style.left = pt.x + '%';
        dot.style.top = pt.y + '%';
        dot.textContent = idx + 1;
        dot.setAttribute('aria-label', `Reveal component ${idx + 1}`);
        dot.addEventListener('click', () => {
          dot.classList.add('identified');
          caption.innerHTML = `<b>${pt.label}:</b> ${pt.detail}`;
          saved.identified[idx] = true;
          const total = config.points.length;
          const doneCount = Object.keys(saved.identified).length;
          RadLab.state.activities[config.id] = { done: doneCount === total, identified: saved.identified, score: doneCount, maxScore: total };
          RadLab.save();
          RadLab.progress.update();
        });
        wrap.appendChild(dot);
      });

      container.appendChild(wrap);
      container.appendChild(caption);
    },

    /* ------------------------- Rubric ------------------------------------- */
    // rubric = {id, title, criteria:[{id,name,points,part,levels:[{label,desc,pts}]}]}
    buildRubric(container, rubric) {
      const table = document.createElement('table');
      table.className = 'rubric-table';
      const maxTotal = rubric.criteria.reduce((s, c) => s + c.points, 0);

      let thead = '<tr><th>Criterion</th><th>Points</th><th>Excellent</th><th>Proficient</th><th>Needs Improvement</th><th>Self-Score</th></tr>';
      let rows = '';

      let currentPart = null;
      rubric.criteria.forEach((c) => {
        const partName = c.part || (c.id === 'c1' || c.id === 'c2' ? 'Part I: In-Lab Interactive Activities & Simulation (10 Points)' : 'Part II: Post-Lab Excel Data Analysis & Synthesis (10 Points)');
        if (partName !== currentPart) {
          currentPart = partName;
          rows += `<tr style="background:#0b2545;color:#ffffff;font-weight:bold;"><td colspan="6" style="padding:8px 12px;font-size:13px;letter-spacing:0.5px;text-transform:uppercase;"><i class="fa-solid fa-layer-group" style="color:#7fe0d6;margin-right:8px;"></i>${esc(partName)}</td></tr>`;
        }

        const savedScore = (RadLab.state?.rubric && RadLab.state.rubric[c.id] !== undefined) ? RadLab.state.rubric[c.id] : '';
        const d0 = esc(c.levels?.[0]?.desc || c.levels?.[0] || 'Full mastery demonstrated');
        const d1 = esc(c.levels?.[1]?.desc || c.levels?.[1] || 'Partial mastery / minor omissions');
        const d2 = esc(c.levels?.[2]?.desc || c.levels?.[2] || 'Needs substantial revision');
        rows += `<tr>
          <td class="crit-name"><b>${esc(c.name)}</b></td>
          <td class="crit-pts">${c.points}</td>
          <td>${d0}</td>
          <td>${d1}</td>
          <td>${d2}</td>
          <td><input type="number" min="0" max="${c.points}" step="0.5" class="rubric-score-input" data-crit="${c.id}" aria-label="Self-assessment score for ${c.name}, maximum ${c.points}" value="${savedScore}"></td>
        </tr>`;
      });
      rows += `<tr class="rubric-total-row" style="font-weight:800;background:var(--rad-bg-soft);"><td colspan="5">Total Evaluation Score</td><td><span id="${rubric.id}-total">0</span> / ${maxTotal}</td></tr>`;
      table.innerHTML = thead + rows;
      container.appendChild(table);

      function recomputeTotal() {
        let total = 0;
        table.querySelectorAll('.rubric-score-input').forEach((inp) => {
          const v = parseFloat(inp.value);
          if (!isNaN(v)) total += v;
        });
        const totalEl = document.getElementById(rubric.id + '-total');
        if (totalEl) totalEl.textContent = total;
      }

      table.querySelectorAll('.rubric-score-input').forEach((inp) => {
        inp.addEventListener('input', () => {
          RadLab.state.rubric[inp.dataset.crit] = inp.value === '' ? '' : parseFloat(inp.value);
          RadLab.save();
          recomputeTotal();
        });
      });
      recomputeTotal();
    },

    /* ------------------------- Nav / sections / progress -------------------- */
    _wireNav() {
      const navEl = document.getElementById('lab-nav');
      if (!navEl) return;
      this._sectionRegistry.forEach((sec) => {
        const a = document.createElement('a');
        a.href = '#' + sec.id;
        a.id = 'nav-' + sec.id;
        a.innerHTML = `<span class="chip-check">○</span>${sec.label}`;
        navEl.appendChild(a);
      });
    },

    progress: {
      update() {
        const total = RadLab._sectionRegistry.length;
        let doneCount = 0;
        RadLab._sectionRegistry.forEach((sec) => {
          const isDone = RadLab._isSectionComplete(sec);
          RadLab.state.sections[sec.id] = isDone;
          if (isDone) doneCount++;
          const navA = document.getElementById('nav-' + sec.id);
          if (navA) {
            navA.classList.toggle('done', isDone);
            navA.querySelector('.chip-check').textContent = isDone ? '✔' : '○';
          }
        });
        const pct = total ? Math.round((doneCount / total) * 100) : 0;
        const fill = document.getElementById('lab-progress-fill');
        const label = document.getElementById('lab-progress-label-text');
        if (fill) fill.style.width = pct + '%';
        if (label) label.textContent = `${doneCount} / ${total} sections complete (${pct}%)`;
      }
    },

    _isSectionComplete(sec) {
      if (sec.checkComplete && typeof sec.checkComplete === 'function') {
        return sec.checkComplete(RadLab.state);
      }
      // default heuristic: all registered fields for this section are non-empty
      const fieldIds = Object.keys(RadLab._fieldMeta).filter(id => RadLab._fieldMeta[id].sectionId === sec.id);
      if (fieldIds.length === 0) return false;
      return fieldIds.every(id => {
        const v = RadLab.state.fields[id];
        return v !== undefined && v !== null && String(v).trim() !== '';
      });
    },

    /* ------------------------- Action bar (export/reset) -------------------- */
    _wireAutosaveIndicator() {
      // created inline in page markup; nothing to do here beyond initial paint
    },

    _wireActionBar() {
      // Use attribute-prefix selector so multiple buttons sharing an id "family"
      // (e.g. an inline CTA + a sticky action-bar button) all get wired, even if
      // a page accidentally reuses the same literal id on more than one element.
      document.querySelectorAll('[id^="btn-export-report"]').forEach((btn) => {
        btn.addEventListener('click', () => this.exportReport());
      });
      document.querySelectorAll('[id^="btn-export-json"]').forEach((btn) => {
        btn.addEventListener('click', () => this.exportJSON());
      });
      document.querySelectorAll('[id^="input-import-json"]').forEach((input) => {
        input.addEventListener('change', (e) => this.importJSON(e.target.files[0]));
      });
      document.querySelectorAll('[id^="btn-reset"]').forEach((btn) => {
        btn.addEventListener('click', () => this.resetAll());
      });
    },

    exportJSON() {
      this.save();
      const payload = { schemaVersion: 2, labId: this.config.labId, labTitle: this.config.labTitle, exportedAt: new Date().toISOString(), state: this.state };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.config.labId}_${(this.state.meta.studentId || 'answers')}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.toast('Answers exported as JSON backup.', 'success');
    },

    importJSON(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const parsed = JSON.parse(e.target.result);
          if (parsed.labId && parsed.labId !== this.config.labId) {
            this.toast('That backup belongs to ' + parsed.labId + ', not this lab.', 'error');
            return;
          }
          const importedState = parsed.state || parsed;
          if (!importedState || typeof importedState !== 'object' || !importedState.meta) throw new Error('Invalid lab backup structure');
          this.state = Object.assign({}, this.state, importedState);
          this.save();
          location.reload();
        } catch (err) {
          this.toast('Could not read that file.', 'error');
        }
      };
      reader.readAsText(file);
    },

    /* ------------------------- Printable submission report ------------------ */
    submissionIssues(phase) {
      this.progress.update();
      const issues = [];
      ['studentName', 'studentId', 'section', 'date'].forEach((key) => {
        if (!String(this.state.meta[key] || '').trim()) issues.push('Missing student ' + key.replace(/([A-Z])/g, ' $1').toLowerCase());
      });

      const isPhase1 = phase === 'in_lab';
      this._sectionRegistry.forEach((section) => {
        if (isPhase1 && (section.id === 'sec-worksheet' || section.id === 'sec-submit-phase2' || section.tab === 'experiment')) {
          return;
        }
        if (!this._isSectionComplete(section)) issues.push('Incomplete section: ' + section.label);
      });
      return issues;
    },

    exportReport() {
      this.save();
      const issues = this.submissionIssues();
      if (issues.length && !confirm('This report is incomplete:\n\n- ' + issues.join('\n- ') + '\n\nGenerate a clearly marked draft report anyway?')) return;
      const rep = this._buildReportHTML();
      const w = window.open('', '_blank');
      if (!w) { this.toast('The browser blocked the report window. Allow pop-ups for this file and try again.', 'error'); return; }
      w.document.open();
      w.document.write(rep);
      w.document.close();
    },

    _buildReportHTML() {
      const st = this.state;
      const cfg = this.config;
      const esc = (s) => (s === undefined || s === null) ? '' : String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
      const issues = this.submissionIssues();
      const readiness = issues.length ? 'DRAFT — incomplete evidence' : 'Complete for submission';
      const fingerprintSource = JSON.stringify({lab: cfg.labId, meta: st.meta, fields: st.fields, quiz: st.quiz, activities: st.activities});
      let hash = 2166136261;
      for (let i = 0; i < fingerprintSource.length; i++) { hash ^= fingerprintSource.charCodeAt(i); hash = Math.imul(hash, 16777619); }
      const fingerprint = `${cfg.labId}-${(st.meta.studentId || 'no-id')}-${(hash >>> 0).toString(16).padStart(8, '0')}`;

      let fieldsHTML = '';
      cfg.sections.forEach((sec) => {
        const fieldIds = Object.keys(this._fieldMeta).filter(id => this._fieldMeta[id].sectionId === sec.id);
        if (fieldIds.length === 0) return;
        fieldsHTML += `<h3>${esc(sec.label)}</h3><table class="rep-table">`;
        fieldIds.forEach((id) => {
          const label = this._fieldMeta[id].label || id;
          let val = st.fields[id];
          val = (val === undefined || val === '') ? '<span class="muted">— not answered —</span>' : esc(val).replace(/\n/g, '<br>');
          fieldsHTML += `<tr><td class="rep-label">${esc(label)}</td><td>${val}</td></tr>`;
        });
        fieldsHTML += '</table>';
      });

      let quizHTML = '';
      const quizIds = Object.keys(st.quiz);
      if (quizIds.length) {
        const finalCorrect = quizIds.filter(id => st.quiz[id].correct).length;
        const firstCorrect = quizIds.filter(id => st.quiz[id].firstCorrect === true || (st.quiz[id].firstCorrect === undefined && st.quiz[id].correct)).length;
        quizHTML = `<h2>Knowledge Check Results</h2><p>First-attempt score: <b>${firstCorrect} / ${quizIds.length}</b> · Final mastery: <b>${finalCorrect} / ${quizIds.length}</b></p><table class="rep-table"><tr><th>Question</th><th>Recorded answer</th><th>Attempts</th><th>Final result</th></tr>`;
        quizIds.forEach((id) => {
          const q = st.quiz[id];
          quizHTML += `<tr><td>${esc(q.prompt || id)}</td><td>${esc(q.selectedText || ('Option ' + (Number(q.selected) + 1)))}</td><td>${esc(q.attemptCount || (Array.isArray(q.attempts) ? q.attempts.length : 1))}</td><td>${q.correct ? 'Correct' : 'Not yet correct'}</td></tr>`;
        });
        quizHTML += '</table>';
      }

      let activityHTML = '';
      let experimentHTML = '';
      const actIds = Object.keys(st.activities);
      if (actIds.length) {
        activityHTML = '<h2>Interactive Simulation & Activity Results</h2><table class="rep-table"><tr><th>Activity</th><th>Result</th></tr>';
        actIds.forEach((id) => {
          const a = st.activities[id];
          let result = a.done ? '✔ Completed' : '– Incomplete';
          if (a.score !== undefined && a.maxScore !== undefined) result += ` — Score: ${a.score}/${a.maxScore}`;
          if (a.detail) result += `<br><span class="muted">${esc(a.detail)}</span>`;
          activityHTML += `<tr><td>${esc(id)}</td><td>${result}</td></tr>`;
          if (Array.isArray(a.runs) && a.runs.length) {
            experimentHTML = '<h2>Recorded Experimental Runs</h2><table class="rep-table"><tr><th>Run</th><th>Settings</th><th>Key results</th><th>Model interpretation</th></tr>';
            a.runs.forEach((run, index) => {
              const metrics = (run.metrics || []).slice(0, 4).map((m) => `${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}`).join(' | ');
              experimentHTML += `<tr><td>${index + 1}</td><td>${esc(run.settings)}</td><td>${esc(metrics)}</td><td>${esc(run.observation)}</td></tr>`;
            });
            experimentHTML += '</table>';
          }
        });
        activityHTML += '</table>';
      }

      let rubricHTML = '';
      if (cfg.rubric) {
        const maxTotal = cfg.rubric.criteria.reduce((s, c) => s + c.points, 0);
        let total = 0;
        rubricHTML = `<h2>${esc(cfg.rubric.title || 'Grading Rubric')}</h2><p class="muted">Student self-assessment only. The instructor assigns the official grade from the submitted evidence.</p><table class="rep-table"><tr><th>Criterion</th><th>Max</th><th>Student self-score</th></tr>`;
        cfg.rubric.criteria.forEach((c) => {
          const score = st.rubric[c.id];
          if (typeof score === 'number') total += score;
          rubricHTML += `<tr><td>${esc(c.name)}</td><td>${c.points}</td><td>${score !== undefined && score !== '' ? score : '—'}</td></tr>`;
        });
        rubricHTML += `<tr style="font-weight:800;background:#eef3f8;"><td>Total</td><td>${maxTotal}</td><td>${total}</td></tr></table>`;
      }

      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(cfg.labTitle)} — Submission Report</title>
      <style>
        body{font-family:Segoe UI,Arial,sans-serif;color:#1c2b3a;max-width:880px;margin:30px auto;padding:0 20px;}
        h1{color:#0b2545;border-bottom:3px solid #0b2545;padding-bottom:12px;}
        h2{color:#0b2545;border-left:4px solid #0e7c86;padding-left:10px;margin-top:34px;}
        h3{color:#1d4e89;margin-top:22px;}
        table.rep-table{width:100%;border-collapse:collapse;margin:10px 0 20px;font-size:13.5px;}
        table.rep-table td,table.rep-table th{border:1px solid #d7e1ec;padding:8px 10px;text-align:left;vertical-align:top;}
        table.rep-table th{background:#0b2545;color:#fff;}
        .rep-label{font-weight:700;color:#1d4e89;width:32%;}
        .muted{color:#8598ac;font-style:italic;}
        .meta-box{display:flex;gap:24px;flex-wrap:wrap;background:#eef3f8;padding:14px 18px;border-radius:10px;margin-bottom:20px;font-size:14px;}
        .meta-box b{color:#0b2545;}
        .readiness{background:#eaf8f0;border-left:4px solid #16865b;padding:12px 16px;border-radius:8px;margin:14px 0;font-size:13px;}
        .readiness.draft{background:#fff0ee;border-left-color:#b5473d;}
        .print-bar{text-align:center;margin:20px 0;}
        button{background:#0e7c86;color:#fff;border:none;padding:10px 22px;border-radius:999px;font-size:14px;cursor:pointer;}
        @media print { .print-bar{display:none;} }
      </style></head><body>
        <div class="print-bar"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
        <h1>${esc(cfg.labTitle)}</h1>
        <p><b>RAD 321 — Image Recording &amp; Analysis</b> | Week ${esc(cfg.weekNumber)} | Assignment Submission Report</p>
        <div class="readiness ${issues.length ? 'draft' : ''}"><b>Submission readiness:</b> ${esc(readiness)}<br><b>Report fingerprint:</b> ${esc(fingerprint)}</div>
        <div class="meta-box">
          <div><b>Student Name:</b> ${esc(st.meta.studentName) || '—'}</div>
          <div><b>Student ID:</b> ${esc(st.meta.studentId) || '—'}</div>
          <div><b>Section:</b> ${esc(st.meta.section) || '—'}</div>
          <div><b>Date:</b> ${esc(st.meta.date) || '—'}</div>
        </div>
        <h2>Worksheet Responses</h2>
        ${fieldsHTML || '<p class="muted">No worksheet fields recorded.</p>'}
        ${experimentHTML}
        ${quizHTML}
        ${activityHTML}
        ${rubricHTML}
        <hr style="margin-top:40px;border:none;border-top:1px solid #d7e1ec;">
        <p class="muted" style="font-size:11.5px;">Generated by the RAD 321 Interactive Lab Platform on ${new Date().toLocaleString()}. This report should be submitted per your instructor's assignment instructions (e.g., printed to PDF and uploaded to the LMS).</p>
      </body></html>`;
    },

    /* ------------------------- Reading Room Theme ----------------------- */
    theme: {
      get() {
        return localStorage.getItem('rad321_theme') || 'light';
      },
      set(t) {
        localStorage.setItem('rad321_theme', t);
        document.documentElement.setAttribute('data-theme', t);
        const btns = document.querySelectorAll('.theme-toggle-btn, #theme-toggle-btn');
        btns.forEach((btn) => {
          btn.innerHTML = t === 'dark' ? '☀️ Daylight Mode' : '🌙 Reading Room Mode';
          btn.setAttribute('aria-label', t === 'dark' ? 'Switch to daylight theme' : 'Switch to calibrated reading room theme');
        });
      },
      toggle() {
        this.set(this.get() === 'dark' ? 'light' : 'dark');
      },
      init() {
        this.set(this.get());
        const btns = document.querySelectorAll('.theme-toggle-btn, #theme-toggle-btn');
        btns.forEach((btn) => {
          btn.removeEventListener('click', this._clickHandler);
          this._clickHandler = () => this.toggle();
          btn.addEventListener('click', this._clickHandler);
        });
      }
    },

    /* ------------------------- Audio & Console Cues --------------------- */
    sound: {
      ctx: null,
      enabled: true,
      init() {
        const saved = localStorage.getItem('rad321_sound');
        this.enabled = saved !== 'false';
        const btns = document.querySelectorAll('.sound-toggle-btn, #sound-toggle-btn');
        btns.forEach((btn) => {
          this._updateBtn(btn);
          btn.addEventListener('click', () => {
            this.enabled = !this.enabled;
            localStorage.setItem('rad321_sound', String(this.enabled));
            btns.forEach((b) => this._updateBtn(b));
            RadLab.toast(this.enabled ? 'Console audio enabled.' : 'Console audio muted.', 'info');
          });
        });
      },
      _updateBtn(btn) {
        btn.innerHTML = this.enabled ? '🔊 Audio On' : '🔇 Muted';
        btn.setAttribute('aria-pressed', String(this.enabled));
      },
      playExposure() {
        const canvas = document.getElementById('sim-canvas');
        if (canvas) {
          canvas.classList.remove('exposure-flash');
          void canvas.offsetWidth; // trigger reflow
          canvas.classList.add('exposure-flash');
          setTimeout(() => canvas.classList.remove('exposure-flash'), 400);
        }
        if (!this.enabled) return;
        try {
          const AudioContext = window.AudioContext || window.webkitAudioContext;
          if (!AudioContext) return;
          if (!this.ctx) this.ctx = new AudioContext();
          if (this.ctx.state === 'suspended') this.ctx.resume();

          const now = this.ctx.currentTime;
          // 1. Rotor acceleration whir
          const oscRotor = this.ctx.createOscillator();
          const gainRotor = this.ctx.createGain();
          oscRotor.type = 'triangle';
          oscRotor.frequency.setValueAtTime(160, now);
          oscRotor.frequency.exponentialRampToValueAtTime(420, now + 0.28);
          gainRotor.gain.setValueAtTime(0.01, now);
          gainRotor.gain.linearRampToValueAtTime(0.12, now + 0.15);
          gainRotor.gain.linearRampToValueAtTime(0.01, now + 0.3);
          oscRotor.connect(gainRotor);
          gainRotor.connect(this.ctx.destination);
          oscRotor.start(now);
          oscRotor.stop(now + 0.3);

          // 2. High-voltage exposure tone
          const oscExp = this.ctx.createOscillator();
          const gainExp = this.ctx.createGain();
          oscExp.type = 'sine';
          oscExp.frequency.setValueAtTime(880, now + 0.3);
          gainExp.gain.setValueAtTime(0.18, now + 0.3);
          gainExp.gain.linearRampToValueAtTime(0.001, now + 0.58);
          oscExp.connect(gainExp);
          gainExp.connect(this.ctx.destination);
          oscExp.start(now + 0.3);
          oscExp.stop(now + 0.6);
        } catch (e) {
          console.debug('Audio cue blocked or unsupported', e);
        }
      }
    },

    /* ------------------------- Interactive Math Scratchpad -------------- */
    mathHelper(container, type, targetFieldId) {
      if (!container) return;
      const defs = {
        formation: {
          title: 'Check My Formula — Magnification & Inverse-Square Law',
          fields: [
            { id: 'sid', label: 'SID (cm)', default: 100 },
            { id: 'oid', label: 'OID (cm)', default: 5 },
            { id: 'i1', label: 'Reference I₁ (mR / a.u.)', default: 100 },
            { id: 'd2', label: 'New Distance d₂ (cm)', default: 180 }
          ],
          compute(v) {
            const sod = Math.max(1, v.sid - v.oid);
            const m = v.sid / sod;
            const i2 = v.i1 * Math.pow(v.sid / v.d2, 2);
            return {
              summary: `SOD = SID - OID = ${v.sid} - ${v.oid} = ${sod} cm\nMagnification M = SID / SOD = ${v.sid} / ${sod} = ${m.toFixed(3)}×\nInverse-Square Intensity I₂ = I₁ × (d₁ / d₂)² = ${v.i1} × (${v.sid} / ${v.d2})² = ${i2.toFixed(2)} a.u.`,
              valid: true,
              hint: `At ${v.sid} cm SID and ${v.oid} cm OID, projected anatomy is magnified by ${m.toFixed(3)}×. At distance ${v.d2} cm, beam intensity changes to ${i2.toFixed(2)} a.u.`
            };
          }
        },
        density: {
          title: 'Check My Formula — Optical Density & Transmittance',
          fields: [
            { id: 'i0', label: 'Incident Light I₀', default: 100 },
            { id: 'it', label: 'Transmitted Light Iₜ', default: 3.16 }
          ],
          compute(v) {
            const ratio = v.i0 / Math.max(0.0001, v.it);
            const od = Math.log10(ratio);
            const percent = (v.it / v.i0) * 100;
            return {
              summary: `Transmittance T = Iₜ / I₀ = ${v.it} / ${v.i0} = ${(v.it / v.i0).toFixed(4)} (${percent.toFixed(2)}%)\nOptical Density OD = log₁₀(I₀ / Iₜ) = log₁₀(${ratio.toFixed(2)}) = ${od.toFixed(2)} OD`,
              valid: od >= 0,
              hint: `An optical density of ${od.toFixed(2)} means approximately ${percent.toFixed(2)}% of incident light passes through the film.`
            };
          }
        },
        sharpness: {
          title: 'Check My Formula — Geometric Unsharpness (Ug) & Magnification',
          fields: [
            { id: 'focal', label: 'Focal Spot F (mm)', default: 1.0 },
            { id: 'sid', label: 'SID (cm)', default: 100 },
            { id: 'oid', label: 'OID (cm)', default: 5 }
          ],
          compute(v) {
            const sod = Math.max(1, v.sid - v.oid);
            const ug = (v.focal * v.oid) / sod;
            const m = v.sid / sod;
            return {
              summary: `SOD = SID - OID = ${v.sid} - ${v.oid} = ${sod} cm\nMagnification M = SID / SOD = ${v.sid} / ${sod} = ${m.toFixed(3)}×\nGeometric Blur Ug = F × OID / SOD = ${v.focal} × ${v.oid} / ${sod} = ${ug.toFixed(3)} mm`,
              valid: ug >= 0,
              hint: `Penumbra width is ${ug.toFixed(3)} mm. To reduce focal-spot blur, use a smaller focal spot, place the part closer to the detector (smaller OID), or increase SOD.`
            };
          }
        },
        distortion: {
          title: 'Check My Formula — Foreshortening & Off-Center Divergent Ray Elongation',
          fields: [
            { id: 'l0', label: 'True Object Length L₀ (mm)', default: 100 },
            { id: 'offset', label: 'Part Lateral Offset (cm)', default: 15 },
            { id: 'part', label: 'Part Tilt Angle θ_part (°)', default: 0 },
            { id: 'oid', label: 'OID (cm)', default: 15 },
            { id: 'sid', label: 'SID (cm)', default: 100 }
          ],
          compute(v) {
            const sid = Number(v.sid) || 100;
            const oid = Number(v.oid) || 15;
            const offset = Number(v.offset) || 0;
            const part = Number(v.part) || 0;
            const sod = Math.max(10, sid - oid);
            const mag = sid / sod;
            const lNorm = v.l0 * mag;

            const thetaRay = (Math.atan(offset / sod) * 180) / Math.PI;
            const relPartAngle = part + thetaRay;

            const cosRel = Math.cos((relPartAngle * Math.PI) / 180);
            const cosDivergence = Math.cos((thetaRay * Math.PI) / 180);
            const shapeFactor = cosRel / Math.max(0.2, cosDivergence * cosDivergence);

            const lProj = lNorm * shapeFactor;
            const deltaL = lProj - lNorm;

            const isShort = shapeFactor < 0.985;
            const isElong = shapeFactor > 1.015;
            const diag = isShort
              ? 'Foreshortening (Shortening: tilt compounds with ray divergence)'
              : isElong
                ? 'Elongation (divergent beam obliquity stretches shadow across flat receptor)'
                : 'Isometric (True Proportions)';

            return {
              summary: `True Anatomical Length L₀ = ${v.l0} mm\nLateral Offset Δx = ${offset > 0 ? '+' : ''}${offset} cm → Ray Divergence Angle θ_ray = ${thetaRay.toFixed(1)}°\nMagnification M = SID / SOD = ${sid} / ${sod} = ${mag.toFixed(3)}×\nNormal Centered Shadow: L_norm = L₀ × M = ${lNorm.toFixed(1)} mm\nProjected Cast Shadow: L_proj = L_norm × [cos(θ_part + θ_ray)/cos²(θ_ray)] = ${lProj.toFixed(1)} mm\nShape Factor = ${shapeFactor.toFixed(3)}× (ΔL = ${deltaL >= 0 ? '+' : ''}${deltaL.toFixed(1)} mm)`,
              valid: true,
              hint: `At offset ${offset} cm and tilt ${part}°, the cast shadow exhibits ${diag}. With a fixed perpendicular central ray, moving anatomy laterally into the divergent beam elongates the recorded shadow.`
            };
          }
        },
        scatter: {
          title: 'Check My Formula — Grid Ratio & Bucky Factor Exposure Compensation',
          fields: [
            { id: 'h', label: 'Strip Height h (mm)', default: 2.4 },
            { id: 'd', label: 'Interspace Width D (mm)', default: 0.3 },
            { id: 'grid', label: 'Grid Ratio (r:1)', default: 8 }
          ],
          compute(v) {
            const calcRatio = v.h / Math.max(0.01, v.d);
            const bucky = 1 + v.grid * 0.32;
            return {
              summary: `Calculated Grid Ratio r = h / D = ${v.h} / ${v.d} = ${calcRatio.toFixed(1)}:1\nEstimated Bucky Factor (Exposure compensation) ≈ ${bucky.toFixed(2)}×`,
              valid: calcRatio > 0,
              hint: `For a ${v.grid}:1 grid, the estimated Bucky factor is ${bucky.toFixed(2)}×. Exposure mAs must be multiplied by approximately ${bucky.toFixed(2)}× to maintain receptor exposure compared to non-grid.`
            };
          }
        },
        noise: {
          title: 'Check My Formula — Signal-to-Noise Ratio (SNR) & CNR',
          fields: [
            { id: 'signal', label: 'Object Signal S (a.u.)', default: 120 },
            { id: 'noise', label: 'Total Noise SD σ (a.u.)', default: 12 },
            { id: 'bg', label: 'Background Signal S₂ (a.u.)', default: 98 }
          ],
          compute(v) {
            const snr = v.signal / Math.max(0.01, v.noise);
            const cnr = Math.abs(v.signal - v.bg) / Math.max(0.01, v.noise);
            return {
              summary: `SNR = Object Signal (S) / Total Noise (σ) = ${v.signal} a.u. / ${v.noise} a.u. = ${snr.toFixed(2)}\nCNR = |S₁ - S₂| / Total Noise (σ) = |${v.signal} - ${v.bg}| / ${v.noise} = ${cnr.toFixed(2)}`,
              valid: snr > 0,
              hint: `An SNR of ${snr.toFixed(2)} and CNR of ${cnr.toFixed(2)} indicate that the target feature is ${(snr >= 5 ? 'confidently detectable by human observers (Rose Criterion SNR ≥ 5 MET)' : 'borderline or obscured by quantum mottle (Below Rose Criterion SNR < 5)')}.`
            };
          }
        },
        digital: {
          title: 'Check My Formula — Pixel Size, Matrix & Nyquist Resolution Limit',
          fields: [
            { id: 'fov', label: 'Field of View FOV (cm)', default: 35 },
            { id: 'matrix', label: 'Matrix Size (pixels)', default: 2048 },
            { id: 'pitch', label: 'Physical Pitch (mm)', default: 0.2 }
          ],
          compute(v) {
            const pixelSize = (v.fov * 10) / Math.max(1, v.matrix);
            const effectivePitch = Math.max(pixelSize, v.pitch);
            const nyquist = 1 / (2 * effectivePitch);
            return {
              summary: `Matrix-derived Pixel Size = (FOV × 10) / Matrix = (${v.fov} × 10) / ${v.matrix} = ${pixelSize.toFixed(3)} mm\nEffective Sampling Pitch = ${effectivePitch.toFixed(3)} mm\nNyquist Sampling Limit f_N = 1 / (2 × Pitch) = 1 / (2 × ${effectivePitch.toFixed(3)}) = ${nyquist.toFixed(2)} lp/mm`,
              valid: nyquist > 0,
              hint: `The system can theoretically sample up to ${nyquist.toFixed(2)} line pairs per millimeter without aliasing.`
            };
          }
        },
        window: {
          title: 'Check My Formula — Window Width, Level & Deviation Index (DI)',
          fields: [
            { id: 'width', label: 'Window Width (WW, HU)', default: 400 },
            { id: 'level', label: 'Window Level (WL, HU)', default: 40 },
            { id: 'ei', label: 'Exposure Index (EI)', default: 100 },
            { id: 'eit', label: 'Target EI (EI_T)', default: 100 }
          ],
          compute(v) {
            const ww = Math.max(1, Number(v.width) || 400);
            const wl = Number(v.level) || 40;
            const ei = Math.max(1, Number(v.ei) || 100);
            const eit = Math.max(1, Number(v.eit) || 100);

            const low = wl - ww / 2;
            const high = wl + ww / 2;
            const gain = 255 / ww;
            const di = 10 * Math.log10(ei / eit);

            const diCategory = di > 3.0
              ? 'Excessive Overexposure (>+3.0 DI — Immediate Action Required)'
              : di > 1.0
              ? 'Exposure Creep (+1.0 to +3.0 DI — Overexposed, masked by rescaling)'
              : di < -3.0
              ? 'Severe Underexposure (<-3.0 DI — Excessive Noise / Unacceptable)'
              : di < -1.0
              ? 'Underexposure (-1.0 to -3.0 DI — Elevated Quantum Mottle)'
              : 'Target Exposure Range (-1.0 to +1.0 DI — Optimal ALARA Balance)';

            return {
              summary: `1. Display Range: Level ± Width/2 = ${wl} ± (${ww} / 2) = [${low.toFixed(0)}, ${high.toFixed(0)}] HU\n2. Look-Up Table Contrast Gain = 255 / WW = 255 / ${ww} = ${gain.toFixed(3)} gray levels/HU\n3. IEC Deviation Index: DI = 10 × log₁₀(EI / EI_T) = 10 × log₁₀(${ei} / ${eit}) = ${di >= 0 ? '+' : ''}${di.toFixed(2)} DI\n4. Exposure Evaluation: ${diCategory}`,
              valid: true,
              hint: `Pixel values < ${low.toFixed(0)} HU display as pure black; pixel values > ${high.toFixed(0)} HU display as pure white. The window width of ${ww} HU maps across 256 display grays with a slope of ${gain.toFixed(3)} gray/HU. An EI of ${ei} gives a DI of ${di >= 0 ? '+' : ''}${di.toFixed(2)} (${diCategory}).`
            };
          }
        },
        fluoro: {
          title: 'Check My Formula — Image Intensifier Brightness Gain & Scatter Protection',
          fields: [
            { id: 'din', label: 'Input Phosphor Diameter d_in (cm)', default: 23 },
            { id: 'dout', label: 'Output Phosphor Diameter d_out (cm)', default: 2.5 },
            { id: 'flux', label: 'Flux Gain (photons/e⁻)', default: 60 },
            { id: 'dmag', label: 'Mag Mode Field Size (cm)', default: 15 },
            { id: 'dist', label: 'Operator Distance d (m)', default: 2.0 },
            { id: 'shield', label: 'Shield Attenuation (%)', default: 60 }
          ],
          compute(v) {
            const din = Number(v.din) || 23;
            const dout = Math.max(0.5, Number(v.dout) || 2.5);
            const flux = Number(v.flux) || 60;
            const dmag = Math.max(1, Number(v.dmag) || 15);
            const dist = Math.max(0.1, Number(v.dist) || 2.0);
            const shield = Math.min(100, Math.max(0, Number(v.shield) || 0));

            const minGain = Math.pow(din / dout, 2);
            const brightGain = minGain * flux;
            const magDoseFactor = Math.pow(din / dmag, 2);
            const distFactor = 1 / Math.pow(dist, 2);
            const shieldTrans = (100 - shield) / 100;
            const netScatterFactor = distFactor * shieldTrans;

            return {
              summary: `1. Minification Gain = (d_in / d_out)² = (${din} / ${dout})² = ${minGain.toFixed(1)}×\n2. Total Brightness Gain = Minification Gain × Flux Gain = ${minGain.toFixed(1)} × ${flux} = ${Math.round(brightGain)}×\n3. Magnification Dose Factor (ABC) = (d_normal / d_mag)² = (${din} / ${dmag})² = ${magDoseFactor.toFixed(2)}×\n4. Operator Inverse-Square Distance Factor = 1 / d² = 1 / (${dist})² = ${distFactor.toFixed(3)}× (vs 1 m)\n5. Net Operator Scatter Exposure = (1/d²) × (1 - Shield%) = ${distFactor.toFixed(3)} × ${(shieldTrans * 100).toFixed(0)}% = ${netScatterFactor.toFixed(4)}× of unshielded 1 m dose`,
              valid: true,
              hint: `At ${din} cm input diameter, minification gain is ${minGain.toFixed(1)}×, yielding a total brightness gain of ${Math.round(brightGain)}×. Switching to ${dmag} cm magnification mode causes the ABC system to increase patient entrance exposure by ${magDoseFactor.toFixed(2)}×. For staff protection at ${dist} m with ${shield}% shielding, scatter exposure is reduced by ${((1 - netScatterFactor) * 100).toFixed(1)}% compared to standing unshielded at 1 meter.`
            };
          }
        }
      };

      const def = defs[type];
      if (!def) return;

      const wrap = document.createElement('div');
      wrap.className = 'math-scratchpad';
      wrap.innerHTML = `
        <div class="math-scratchpad-header" role="button" tabindex="0" aria-expanded="false">
          <span><i class="fa-solid fa-calculator"></i> ${def.title}</span>
          <span class="muted" style="font-size:11px">Click to expand helper ▾</span>
        </div>
        <div class="math-scratchpad-body" style="display:none">
          <div class="math-input-grid">
            ${def.fields.map((f) => `<div class="math-input-card"><label for="math-${f.id}">${f.label}</label><input type="number" step="any" id="math-${f.id}" value="${f.default}"></div>`).join('')}
          </div>
          <div class="flex gap-8 items-center" style="margin-top:4px">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-calc-math">Calculate &amp; Verify</button>
            ${targetFieldId ? `<button type="button" class="btn btn-ghost btn-sm" id="btn-insert-math">Insert into Worksheet</button>` : ''}
          </div>
          <div class="math-feedback hint" id="math-result-box">Enter values and click Calculate &amp; Verify to check your steps.</div>
        </div>
      `;

      container.appendChild(wrap);
      const header = wrap.querySelector('.math-scratchpad-header');
      const body = wrap.querySelector('.math-scratchpad-body');
      const resBox = wrap.querySelector('#math-result-box');
      const calcBtn = wrap.querySelector('#btn-calc-math');
      const insertBtn = wrap.querySelector('#btn-insert-math');

      header.addEventListener('click', () => {
        const isHidden = body.style.display === 'none';
        body.style.display = isHidden ? 'grid' : 'none';
        header.setAttribute('aria-expanded', String(isHidden));
        header.querySelector('.muted').textContent = isHidden ? 'Click to collapse ▴' : 'Click to expand helper ▾';
      });

      let lastSummary = '';

      function runCalc() {
        const vals = {};
        def.fields.forEach((f) => {
          vals[f.id] = parseFloat(wrap.querySelector('#math-' + f.id).value) || 0;
        });
        const res = def.compute(vals);
        lastSummary = res.summary;
        resBox.className = 'math-feedback ' + (res.valid ? 'valid' : 'hint');
        resBox.innerHTML = `<b>Calculation Step:</b><pre style="margin:6px 0;font-family:var(--font-mono);font-size:12px;white-space:pre-wrap;">${res.summary}</pre><b>Interpretation:</b> ${res.hint}`;
      }

      calcBtn.addEventListener('click', runCalc);
      if (insertBtn && targetFieldId) {
        insertBtn.addEventListener('click', () => {
          if (!lastSummary) runCalc();
          const target = document.getElementById(targetFieldId);
          if (target) {
            const current = target.value.trim();
            target.value = current ? current + '\n\n' + lastSummary : lastSummary;
            target.dispatchEvent(new Event('input', { bubbles: true }));
            target.dispatchEvent(new Event('change', { bubbles: true }));
            RadLab.toast('Calculation inserted into worksheet.', 'success');
          }
        });
      }
    },

    buildMathHelper(container, type, targetFieldId) {
      return this.mathHelper(container, type || (this.config && this.config.type), targetFieldId);
    },

    /* ------------------------- Gradebook Batch JSON Aggregator ---------- */
    aggregateJSONReports(fileList, callback) {
      if (!fileList || !fileList.length) return;
      const results = [];
      let pending = fileList.length;

      Array.from(fileList).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target.result);
            const meta = json.meta || {};
            const quiz = json.quiz || {};
            const activities = json.activities || {};
            const rubric = json.rubric || {};
            const exp = activities['experiment-log'] || {};

            let quizTotal = 0;
            let quizCorrect = 0;
            Object.values(quiz).forEach((q) => {
              quizTotal++;
              if (q && q.correct) quizCorrect++;
            });

            let rubricTotal = 0;
            Object.values(rubric).forEach((score) => {
              if (typeof score === 'number') rubricTotal += score;
            });

            results.push({
              fileName: file.name,
              studentName: meta.studentName || 'Unknown',
              studentId: meta.studentId || 'N/A',
              section: meta.section || 'N/A',
              date: meta.date || 'N/A',
              labId: (activities['experiment-log'] && activities['experiment-log'].labId) || json.labId || 'N/A',
              runsRecorded: (exp.runs && exp.runs.length) || 0,
              quizScore: quizTotal ? `${quizCorrect}/${quizTotal}` : 'N/A',
              rubricSelfScore: rubricTotal || 0,
              status: ((exp.runs && exp.runs.length >= 3) && quizCorrect === quizTotal) ? 'Complete' : 'Incomplete'
            });
          } catch (err) {
            results.push({
              fileName: file.name,
              studentName: 'INVALID JSON',
              studentId: 'ERR',
              section: 'ERR',
              date: 'ERR',
              labId: 'ERR',
              runsRecorded: 0,
              quizScore: '0/0',
              rubricSelfScore: 0,
              status: 'Parse Error'
            });
          }

          pending--;
          if (pending === 0 && typeof callback === 'function') {
            callback(results);
          }
        };
        reader.readAsText(file);
      });
    },

    exportGradebookCSV(records) {
      if (!records || !records.length) return;
      const headers = ['Student Name', 'Student ID', 'Section', 'Date', 'File Name', 'Runs Recorded', 'Quiz Score', 'Rubric Self Score', 'Status'];
      const rows = records.map((r) => [
        `"${(r.studentName || '').replace(/"/g, '""')}"`,
        `"${(r.studentId || '').replace(/"/g, '""')}"`,
        `"${(r.section || '').replace(/"/g, '""')}"`,
        `"${(r.date || '').replace(/"/g, '""')}"`,
        `"${(r.fileName || '').replace(/"/g, '""')}"`,
        r.runsRecorded,
        `"${r.quizScore}"`,
        r.rubricSelfScore,
        `"${r.status}"`
      ]);

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\r\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      link.setAttribute('download', `RAD321_Class_Gradebook_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },

    /* ------------------------- Server Integration & Cloud Sync ----------- */
    _saveTimer: null,
    _initServerIntegration() {
      const token = localStorage.getItem('rad321_jwt');
      const user = JSON.parse(localStorage.getItem('rad321_user') || 'null');
      const topActions = document.querySelector('.lab-topbar-actions');
      
      if (topActions) {
        const existingSync = document.getElementById('sync-cloud-pill');
        if (!existingSync) {
          const pill = document.createElement('span');
          pill.id = 'sync-cloud-pill';
          pill.className = 'sync-pill ' + (token ? 'online' : 'offline');
          pill.innerHTML = token ? '☁ Server Synced' : '💾 Offline Mode';
          topActions.insertBefore(pill, topActions.firstChild);
        }
      }

      if (!token || !user) return;

      // Auto-fill student info if empty
      if (!this.state.meta.studentName && user.name) this.state.meta.studentName = user.name;
      if (!this.state.meta.studentId && user.student_id) this.state.meta.studentId = user.student_id;
      if (!this.state.meta.section && user.section_name) this.state.meta.section = user.section_name;
      this._wireMeta();

      // Fetch saved submission from server
      fetch(`/api/student/labs/${this.config.labId}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(data => {
        if (data && data.submission) {
          const sub = data.submission;
          if (sub.state_data && Object.keys(sub.state_data).length) {
            // merge server state
            this.state = Object.assign({}, this.state, sub.state_data);
            if (sub.runs_data && sub.runs_data.length) {
              if (!this.state.activities['experiment-log']) this.state.activities['experiment-log'] = { runs: [] };
              this.state.activities['experiment-log'].runs = sub.runs_data;
            }
            this._wireMeta();
            this.progress.update();
            this.toast('Loaded your saved lab progress from department server.', 'success');
          }
          if (sub.status === 'submitted' || sub.status === 'graded') {
            this._renderSubmissionStatusCard(sub);
          }
        }
      })
      .catch(err => console.warn('Could not sync with server:', err));
    },

    _saveToServer() {
      const token = localStorage.getItem('rad321_jwt');
      if (!token) return;

      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        const runs = this.state.activities['experiment-log']?.runs || [];
        const quizScore = Object.values(this.state.quiz).filter(q => q.correct).length;
        const quizTotal = Object.keys(this.state.quiz).length || 4;
        const prediction = this.state.fields['w-prediction'] || '';

        fetch(`/api/student/labs/${this.config.labId}/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            state: this.state,
            runs,
            quizScore,
            quizTotal,
            prediction,
            rubricScores: this.state.rubric
          })
        })
        .then(res => res.json())
        .then(data => {
          const pill = document.getElementById('sync-cloud-pill');
          if (pill) {
            pill.className = 'sync-pill online';
            pill.innerHTML = '☁ Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }
        })
        .catch(err => {
          const pill = document.getElementById('sync-cloud-pill');
          if (pill) {
            pill.className = 'sync-pill offline';
            pill.innerHTML = '⚠️ Offline Draft';
          }
        });
      }, 1000);
    },

    /* ------------------------- CSV Run Data Export ------------------------ */
    downloadRunsCSV() {
      const activity = this.state.activities['experiment-log'] || {};
      const runs = activity.runs || [];

      if (!runs.length) {
        this.toast('No experimental runs recorded yet. Record at least one run first!', 'error');
        return;
      }

      const headers = ['Run Number', 'Settings / Factors', 'Key Results & Metrics', 'Clinical Observation / Interpretation'];
      const rows = runs.map((r, idx) => {
        const metricsStr = Array.isArray(r.metrics)
          ? r.metrics.map(m => `${m.label}: ${m.value}${m.unit ? ' ' + m.unit : ''}`).join('; ')
          : (r.result || 'N/A');
        return [
          idx + 1,
          `"${(r.settings || '').replace(/"/g, '""')}"`,
          `"${metricsStr.replace(/"/g, '""')}"`,
          `"${(r.observation || r.interpretation || '').replace(/"/g, '""')}"`
        ];
      });

      const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(row => row.join(','))].join('\r\n');
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement('a');
      link.setAttribute('href', encodedUri);
      const studentId = this.state.meta.studentId || 'Student';
      link.setAttribute('download', `RAD321_${this.config.labId}_Runs_${studentId}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      this.toast('Experimental run dataset downloaded as CSV.', 'success');
    },

    _wireRunsCSVExport() {
      const toolbar = document.querySelector('.run-toolbar');
      if (toolbar && !document.getElementById('btn-download-runs-csv')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.id = 'btn-download-runs-csv';
        btn.className = 'btn btn-secondary btn-sm';
        btn.innerHTML = '📥 Download Run Data (CSV)';
        btn.style.marginLeft = 'auto';
        btn.addEventListener('click', () => this.downloadRunsCSV());
        toolbar.appendChild(btn);
      }
    },

    /* ------------------------- Attachment Uploading ----------------------- */
    _wireAttachmentUploader() {
      // Handled directly inside _wireSubmitButton's structured Two-Phase Submission Hub
    },

    _uploadAttachment(file, callback) {
      const token = localStorage.getItem('rad321_jwt');
      if (!token) {
        this.toast('Please log in to the Department Portal to upload assignment files.', 'error');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      this.toast('Uploading data analysis file to department server...', 'info');
      fetch(`/api/student/labs/${this.config.labId}/upload`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token },
        body: formData
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          this.toast('Data analysis file uploaded successfully!', 'success');
          this._loadAttachments();
          if (callback) callback(data);
        } else {
          this.toast(data.error || 'Upload failed', 'error');
        }
      })
      .catch(err => this.toast('Upload error: ' + err.message, 'error'));
    },

    _loadAttachments() {
      const token = localStorage.getItem('rad321_jwt');
      if (!token) return;

      fetch(`/api/student/labs/${this.config.labId}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(data => {
        const list = document.getElementById('lab-attachment-list');
        if (!list) return;
        list.innerHTML = '';
        const attachments = data?.submission?.attachments || [];
        if (!attachments.length) {
          list.innerHTML = '<p class="muted small" style="margin:6px 0;">No analysis files uploaded yet.</p>';
          return;
        }
        attachments.forEach(att => {
          const item = document.createElement('div');
          item.className = 'attachment-item';
          item.innerHTML = `
            <div class="file-info">
              <i class="fa-solid fa-file-excel" style="color:var(--rad-teal);font-size:20px;"></i>
              <div>
                <div class="file-name" style="font-weight:700;">${att.original_filename}</div>
                <div class="file-size muted small">${Math.round(att.file_size / 1024)} KB · Uploaded ${new Date(att.created_at).toLocaleDateString()}</div>
              </div>
            </div>
            <div class="flex gap-8">
              <a href="/api/attachments/${att.id}/download" class="btn btn-ghost btn-sm" target="_blank" title="Download"><i class="fa-solid fa-download"></i></a>
              <button type="button" class="btn btn-ghost btn-sm text-danger" onclick="RadLab._deleteAttachment(${att.id})" title="Delete"><i class="fa-solid fa-trash"></i></button>
            </div>
          `;
          list.appendChild(item);
        });
      });
    },

    _deleteAttachment(attachId) {
      const token = localStorage.getItem('rad321_jwt');
      if (!token || !confirm('Remove this analysis file?')) return;

      fetch(`/api/student/attachments/${attachId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      })
      .then(res => res.json())
      .then(() => {
        this.toast('File removed.', 'success');
        this._loadAttachments();
      });
    },

    /* ------------------------- Two-Phase Submit Hub ----------------------- */
    _wireSubmitButton() {
      const p1Container = document.getElementById('sec-submit-phase1') || document.getElementById('hub-phase1');
      const p2Container = document.getElementById('sec-submit-phase2') || document.getElementById('hub-phase2');

      if (p1Container && p2Container) {
        this._wireSplitSubmitHub(p1Container, p2Container);
        return;
      }

      const submitSec = document.getElementById('sec-submit');
      if (!submitSec) return;

      const submitWrap = submitSec.querySelector('.card.text-center');
      if (!submitWrap || document.getElementById('two-phase-submission-hub')) return;

      const hasExperiment = !!(this.config && Array.isArray(this.config.sections) && this.config.sections.find(s => s.id === 'sec-experiment')) || !!document.querySelector('.run-toolbar');

      const hub = document.createElement('div');
      hub.id = 'two-phase-submission-hub';
      hub.style.textAlign = 'left';
      hub.style.marginTop = '20px';

      hub.innerHTML = `
        <div style="background:var(--rad-navy);color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;">
          <h3 style="margin:0;color:#7fe0d6;font-size:18px;"><i class="fa-solid fa-clipboard-check"></i> Standardized Department Submission Hub</h3>
          <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">Each laboratory assignment consists of two evaluated phases graded by the departmental Gemini Flash AI model against the standardized 20-point rubric.</p>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px;background:var(--rad-bg-soft);border:1px solid var(--rad-border);border-top:none;padding:20px;border-radius:0 0 10px 10px;">
          
          <!-- Phase 1 Card -->
          <div style="background:#ffffff;border:1px solid var(--rad-border);border-radius:8px;padding:16px;border-top:4px solid var(--rad-teal);display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span class="badge" style="background:#e0f2fe;color:#0369a1;font-weight:800;">Phase 1 (10 Points)</span>
              <span class="muted small">In-Lab Session</span>
            </div>
            <h4 style="margin:0 0 8px;color:var(--rad-navy);font-size:15px;"><i class="fa-solid fa-flask"></i> In-Lab Interactive Activities</h4>
            <p style="font-size:12.5px;color:var(--rad-text-soft);line-height:1.45;margin:0 0 12px;flex-grow:1;">Complete and record your simulated trial runs, knowledge-check quizzes, and preliminary worksheet answers during the scheduled lab session.</p>
            
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;font-size:12px;margin-bottom:12px;">
              <div>✔ <b>c1: Concepts & Quiz:</b> 4.0 pts</div>
              <div>✔ <b>c2: Simulation & Data:</b> 6.0 pts</div>
            </div>

            <button type="button" class="btn btn-teal btn-sm" id="btn-submit-phase1" style="width:100%;"><i class="fa-solid fa-paper-plane"></i> Submit In-Lab Activities</button>
          </div>

          <!-- Phase 2 Card -->
          <div style="background:#ffffff;border:1px solid var(--rad-border);border-radius:8px;padding:16px;border-top:4px solid var(--rad-blue);display:flex;flex-direction:column;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
              <span class="badge" style="background:#fef3c7;color:#92400e;font-weight:800;">Phase 2 (10 Points)</span>
              <span class="muted small">Post-Lab Due Date</span>
            </div>
            <h4 style="margin:0 0 8px;color:var(--rad-navy);font-size:15px;"><i class="fa-solid fa-file-excel"></i> Post-Lab Excel Data Analysis</h4>
            <p style="font-size:12.5px;color:var(--rad-text-soft);line-height:1.45;margin:0 0 12px;">
              ${hasExperiment 
                ? 'Download your experimental run data via <b>"Download Run Data (CSV)"</b>, conduct in-depth data analysis and plotting in Excel, and submit your completed workbook (.xlsx / .csv) below.'
                : 'Complete the comprehensive clinical scenario writeup and analysis workbook, then upload your completed analysis sheet (.xlsx / .pdf / .docx) below.'
              }
            </p>

            ${hasExperiment ? `
              <div style="margin-bottom:10px;">
                <button type="button" class="btn btn-secondary btn-sm" style="width:100%;font-size:12px;" onclick="RadLab.downloadRunsCSV()"><i class="fa-solid fa-download"></i> Download Run Data (CSV)</button>
              </div>
            ` : ''}

            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;padding:10px;font-size:12px;margin-bottom:12px;">
              <div>✔ <b>c3: Excel Calculations:</b> 5.0 pts</div>
              <div>✔ <b>c4: Clinical ALARA:</b> 3.0 pts</div>
              <div>✔ <b>c5: Professionalism:</b> 2.0 pts</div>
            </div>

            <div class="attachment-dropzone" id="lab-attachment-dropzone" style="padding:12px;margin-bottom:10px;cursor:pointer;">
              <i class="fa-solid fa-cloud-arrow-up" style="font-size:22px;color:var(--rad-teal);margin-bottom:4px;"></i>
              <div style="font-size:12px;font-weight:700;">Click or drop your completed Excel (.xlsx / .csv) workbook here</div>
              <input type="file" id="lab-file-input" style="display:none" accept=".xlsx,.xls,.csv,.pdf,.docx">
            </div>

            <div class="attachment-list" id="lab-attachment-list" style="margin-bottom:10px;"></div>

            <div style="margin-bottom:10px;">
              <textarea id="excel-analysis-notes" rows="2" placeholder="Optional: Add any brief methodology or analysis notes for your instructor..." style="width:100%;font-size:12px;padding:6px 8px;border:1px solid var(--rad-border);border-radius:6px;"></textarea>
            </div>

            <button type="button" class="btn btn-primary btn-sm" id="btn-submit-phase2" style="width:100%;margin-top:auto;"><i class="fa-solid fa-file-arrow-up"></i> Submit Post-Lab Excel Analysis</button>
          </div>

        </div>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:0 8px;flex-wrap:wrap;gap:8px;">
          <span class="muted small"><i class="fa-solid fa-info-circle"></i> Submissions trigger automated evaluation by Gemini Flash and update your gradebook record instantly.</span>
          <button type="button" class="btn btn-secondary btn-sm" id="btn-export-report-inline"><i class="fa-solid fa-file-pdf"></i> Generate Printable Report (PDF Backup)</button>
        </div>
      `;

      submitWrap.innerHTML = '';
      submitWrap.appendChild(hub);

      const dropzone = hub.querySelector('#lab-attachment-dropzone');
      const fileInput = hub.querySelector('#lab-file-input');

      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
          if (e.dataTransfer.files.length) this._uploadAttachment(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length) this._uploadAttachment(e.target.files[0]);
        });
      }

      hub.querySelector('#btn-submit-phase1').addEventListener('click', () => {
        this._executeSubmission('in_lab');
      });

      hub.querySelector('#btn-submit-phase2').addEventListener('click', () => {
        const notes = hub.querySelector('#excel-analysis-notes')?.value || '';
        this._executeSubmission('excel_analysis', notes);
      });

      hub.querySelector('#btn-export-report-inline').addEventListener('click', () => {
        this.exportReport();
      });

      this._loadAttachments();
    },

    _wireSplitSubmitHub(p1Container, p2Container) {
      p1Container = p1Container || document.getElementById('sec-submit-phase1') || document.getElementById('hub-phase1');
      p2Container = p2Container || document.getElementById('sec-submit-phase2') || document.getElementById('hub-phase2');
      if (!p1Container || !p2Container) return;

      const p1Card = p1Container.querySelector('.card') || p1Container;
      p1Card.innerHTML = `
        <div style="background:var(--rad-navy);color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;text-align:left;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="badge" style="background:#e0f2fe;color:#0369a1;font-weight:800;">Phase 1 (10 Points)</span>
            <span style="color:#7fe0d6;font-size:12.5px;font-weight:700;"><i class="fa-solid fa-clock"></i> In-Lab Session</span>
          </div>
          <h3 style="margin:8px 0 4px;color:#ffffff;font-size:18px;"><i class="fa-solid fa-paper-plane" style="color:#7fe0d6;"></i> In-Lab Interactive Activities Submission</h3>
          <p style="margin:0;font-size:13px;opacity:0.9;">Lock in your in-lab interactive activities score (10 points) before leaving the laboratory session. Evaluated by Gemini Flash AI against criteria c1 and c2.</p>
        </div>

        <div style="background:#ffffff;border:1px solid var(--rad-border);border-top:none;padding:20px;border-radius:0 0 10px 10px;text-align:left;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:16px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
              <div style="font-weight:700;color:var(--rad-navy);font-size:13px;margin-bottom:4px;"><i class="fa-solid fa-circle-check" style="color:var(--rad-teal);"></i> c1: Concepts &amp; Mastery Quiz (4.0 pts)</div>
              <p style="margin:0;font-size:12px;color:var(--rad-text-soft);">Pre-lab tube physics, Bremsstrahlung efficiency equation, and knowledge-check quizzes.</p>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
              <div style="font-weight:700;color:var(--rad-navy);font-size:13px;margin-bottom:4px;"><i class="fa-solid fa-flask" style="color:var(--rad-teal);"></i> c2: Interactive Stations &amp; Activities (6.0 pts)</div>
              <p style="margin:0;font-size:12px;color:var(--rad-text-soft);">Hotspot identification, causal stage sequencing, receptor matching, role sorting, and ICU clinical scenario.</p>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
            <button type="button" class="btn btn-teal" id="btn-submit-phase1" style="padding:12px 28px;font-size:14.5px;font-weight:700;"><i class="fa-solid fa-paper-plane"></i> Submit In-Lab Activities (Phase 1)</button>
            <span class="muted small"><i class="fa-solid fa-info-circle"></i> Once submitted, proceed to <b>Tab 2</b> to run the virtual simulation and complete your post-lab analysis.</span>
          </div>
        </div>
      `;

      p1Card.querySelector('#btn-submit-phase1').addEventListener('click', () => {
        this._executeSubmission('in_lab');
      });

      const hasExperiment = !!(this.config && Array.isArray(this.config.sections) && this.config.sections.find(s => s.id === 'sec-experiment')) || !!document.querySelector('.run-toolbar');
      const p2Card = p2Container.querySelector('.card') || p2Container;
      p2Card.innerHTML = `
        <div style="background:var(--rad-navy);color:#ffffff;padding:16px 20px;border-radius:10px 10px 0 0;text-align:left;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span class="badge" style="background:#fef3c7;color:#92400e;font-weight:800;">Phase 2 (10 Points)</span>
            <span style="color:#7fe0d6;font-size:12.5px;font-weight:700;"><i class="fa-solid fa-calendar-check"></i> Post-Lab Assignment Due Date</span>
          </div>
          <h3 style="margin:8px 0 4px;color:#ffffff;font-size:18px;"><i class="fa-solid fa-file-excel" style="color:#7fe0d6;"></i> Post-Lab Excel Data Analysis Submission</h3>
          <p style="margin:0;font-size:13px;opacity:0.9;">Upload your completed Excel analysis workbook (.xlsx / .csv) and submit your post-lab reflection for final 20-point grade verification.</p>
        </div>

        <div style="background:#ffffff;border:1px solid var(--rad-border);border-top:none;padding:20px;border-radius:0 0 10px 10px;text-align:left;">
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px;margin-bottom:16px;">
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
              <div style="font-weight:700;color:var(--rad-navy);font-size:13px;margin-bottom:4px;"><i class="fa-solid fa-calculator" style="color:var(--rad-blue);"></i> c3: Excel Calculations &amp; Plots (5.0 pts)</div>
              <p style="margin:0;font-size:12px;color:var(--rad-text-soft);">Plot 1 (filament mA curve), Plot 2 (kVp penetration), and Table B quantitative energy conversions.</p>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
              <div style="font-weight:700;color:var(--rad-navy);font-size:13px;margin-bottom:4px;"><i class="fa-solid fa-stethoscope" style="color:var(--rad-blue);"></i> c4: Clinical ALARA Reasoning (3.0 pts)</div>
              <p style="margin:0;font-size:12px;color:var(--rad-text-soft);">Linking filtration, filament heating, and quantum mottle to patient radiation protection.</p>
            </div>
            <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px;">
              <div style="font-weight:700;color:var(--rad-navy);font-size:13px;margin-bottom:4px;"><i class="fa-solid fa-award" style="color:var(--rad-blue);"></i> c5: Professionalism &amp; Format (2.0 pts)</div>
              <p style="margin:0;font-size:12px;color:var(--rad-text-soft);">Completeness of workbook file, clean formatting, and adherence to departmental guidelines.</p>
            </div>
          </div>

          ${hasExperiment ? `
            <div style="margin-bottom:14px;">
              <button type="button" class="btn btn-secondary btn-sm" onclick="RadLab.downloadRunsCSV()"><i class="fa-solid fa-download"></i> Download Run Data (CSV) for Excel</button>
            </div>
          ` : ''}

          <div class="attachment-dropzone" id="lab-attachment-dropzone" style="padding:16px;margin-bottom:12px;cursor:pointer;border:2px dashed var(--rad-border);border-radius:8px;text-align:center;background:#f8fafc;">
            <i class="fa-solid fa-cloud-arrow-up" style="font-size:26px;color:var(--rad-teal);margin-bottom:6px;"></i>
            <div style="font-size:13px;font-weight:700;color:var(--rad-navy);">Click or drop your completed Excel (.xlsx / .csv) analysis workbook here</div>
            <div class="muted small" style="margin-top:2px;">Supported file formats: .xlsx, .xls, .csv, .pdf</div>
            <input type="file" id="lab-file-input" style="display:none" accept=".xlsx,.xls,.csv,.pdf,.docx">
          </div>

          <div class="attachment-list" id="lab-attachment-list" style="margin-bottom:12px;"></div>

          <div style="margin-bottom:14px;">
            <label class="field-label" for="excel-analysis-notes" style="font-size:12.5px;">Optional: Methodology &amp; Analysis Notes for Instructor</label>
            <textarea id="excel-analysis-notes" rows="2" placeholder="Add any notes about your curve fits, regression R², or clinical observations..." style="width:100%;font-size:12.5px;padding:8px;border:1px solid var(--rad-border);border-radius:6px;box-sizing:border-box;"></textarea>
          </div>

          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;padding-top:6px;border-top:1px solid var(--rad-border);">
            <button type="button" class="btn btn-primary" id="btn-submit-phase2" style="padding:12px 28px;font-size:14.5px;font-weight:700;"><i class="fa-solid fa-file-arrow-up"></i> Submit Post-Lab Excel Analysis (Phase 2)</button>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-export-report-inline"><i class="fa-solid fa-file-pdf"></i> Generate Printable Report (PDF Backup)</button>
          </div>
        </div>
      `;

      const dropzone = p2Card.querySelector('#lab-attachment-dropzone');
      const fileInput = p2Card.querySelector('#lab-file-input');

      if (dropzone && fileInput) {
        dropzone.addEventListener('click', () => fileInput.click());
        dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('dragover'); });
        dropzone.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));
        dropzone.addEventListener('drop', (e) => {
          e.preventDefault();
          dropzone.classList.remove('dragover');
          if (e.dataTransfer.files.length) this._uploadAttachment(e.dataTransfer.files[0]);
        });
        fileInput.addEventListener('change', (e) => {
          if (e.target.files.length) this._uploadAttachment(e.target.files[0]);
        });
      }

      p2Card.querySelector('#btn-submit-phase2').addEventListener('click', () => {
        const notes = p2Card.querySelector('#excel-analysis-notes')?.value || '';
        this._executeSubmission('excel_analysis', notes);
      });

      p2Card.querySelector('#btn-export-report-inline').addEventListener('click', () => {
        this.exportReport();
      });

      this._loadAttachments();
    },

    _executeSubmission(phase, excelNotes = '') {
      const token = localStorage.getItem('rad321_jwt');
      if (!token) {
        this.toast('Please log in through the Department Portal to submit your assignment online.', 'error');
        return;
      }

      const issues = this.submissionIssues(phase);
      const isPhase1 = phase === 'in_lab';

      if (isPhase1 && issues.length) {
        if (!confirm(`Your in-lab submission is missing some items:\n\n- ${issues.join('\n- ')}\n\nSubmit anyway?`)) return;
      } else {
        const confirmMsg = isPhase1
          ? `Submit Phase 1 (In-Lab Activities) for Lab ${this.config.weekNumber || ''} to the department server for Gemini Flash evaluation?`
          : `Submit Phase 2 (Post-Lab Excel Data Analysis) for Lab ${this.config.weekNumber || ''} for final grading?`;
        if (!confirm(confirmMsg)) return;
      }

      const runs = this.state.activities['experiment-log']?.runs || [];
      const quizScore = Object.values(this.state.quiz).filter(q => q.correct).length;
      const quizTotal = Object.keys(this.state.quiz).length || 4;
      const prediction = this.state.fields['w-prediction'] || '';

      this.toast(`Submitting ${isPhase1 ? 'Phase 1 (In-Lab)' : 'Phase 2 (Excel Analysis)'} for AI evaluation...`, 'info');

      fetch(`/api/student/labs/${this.config.labId}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({
          state: this.state,
          runs,
          quizScore,
          quizTotal,
          prediction,
          rubricScores: this.state.rubric,
          phase,
          excelAnalysisNotes: excelNotes
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          this.toast(data.message, 'success');
          setTimeout(() => location.reload(), 1500);
        } else {
          this.toast(data.error || 'Submission failed.', 'error');
        }
      })
      .catch(err => this.toast('Submission error: ' + err.message, 'error'));
    },

    /* ------------------------- Graded Status Banner ----------------------- */
    _renderSubmissionStatusCard(sub) {
      const container = document.querySelector('.lab-container') || document.body;
      const existing = document.getElementById('submission-status-banner');
      if (existing) existing.remove();

      const banner = document.createElement('div');
      banner.id = 'submission-status-banner';
      banner.className = 'graded-feedback-card';

      let aiFeedbackObj = sub.ai_feedback;
      if (typeof aiFeedbackObj === 'string') {
        try { aiFeedbackObj = JSON.parse(aiFeedbackObj); } catch (e) {}
      }

      let rubricPills = '';
      if (sub.rubric_scores) {
        const p1Score = sub.rubric_scores.part1Total !== undefined ? sub.rubric_scores.part1Total : (Number(sub.rubric_scores.c1 || 0) + Number(sub.rubric_scores.c2 || 0));
        const p2Score = sub.rubric_scores.part2Total !== undefined ? sub.rubric_scores.part2Total : (Number(sub.rubric_scores.c3 || 0) + Number(sub.rubric_scores.c4 || 0) + Number(sub.rubric_scores.c5 || 0));

        rubricPills += `
          <div class="rubric-pill" style="border-left:3px solid var(--rad-teal);">
            <div class="pill-label">Part I: In-Lab (Max 10)</div>
            <div class="pill-val">${p1Score} / 10</div>
          </div>
          <div class="rubric-pill" style="border-left:3px solid var(--rad-blue);">
            <div class="pill-label">Part II: Post-Lab Excel (Max 10)</div>
            <div class="pill-val">${p2Score} / 10</div>
          </div>
        `;

        ['c1', 'c2', 'c3', 'c4', 'c5'].forEach((k, idx) => {
          const maxes = [4, 6, 5, 3, 2];
          const labels = ['c1: Concepts & Quiz', 'c2: Simulation Runs', 'c3: Excel Calculations', 'c4: Clinical ALARA', 'c5: Reporting'];
          const val = sub.rubric_scores[k] !== undefined ? sub.rubric_scores[k] : '—';
          rubricPills += `
            <div class="rubric-pill">
              <div class="pill-label">${labels[idx]} (${maxes[idx]} pts)</div>
              <div class="pill-val">${val}</div>
            </div>
          `;
        });
      }

      const statusTitle = sub.status === 'graded' 
        ? 'FULLY GRADED &amp; VERIFIED' 
        : (sub.status === 'in_lab_submitted' 
            ? 'PHASE 1 (IN-LAB) EVALUATED · EXCEL ANALYSIS PENDING' 
            : 'SUBMITTED TO INSTRUCTOR (EVALUATED)');

      banner.innerHTML = `
        <div class="flex justify-between items-center" style="flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#7fe0d6;font-weight:700;">Department Evaluation Receipt</div>
            <h2 style="margin:4px 0 0;color:#ffffff;font-size:20px;"><i class="fa-solid fa-graduation-cap"></i> ${statusTitle}</h2>
            <div style="font-size:13px;opacity:0.85;margin-top:2px;">
              ${sub.in_lab_submitted_at ? `In-Lab Submitted: ${new Date(sub.in_lab_submitted_at).toLocaleDateString()} · ` : ''}
              ${sub.excel_submitted_at ? `Excel Submitted: ${new Date(sub.excel_submitted_at).toLocaleDateString()} · ` : ''}
              Last Updated: ${new Date(sub.submitted_at || sub.updated_at || sub.created_at).toLocaleString()}
            </div>
          </div>
          ${sub.total_score !== undefined ? `<div class="score-badge">${sub.total_score} <span style="font-size:18px;opacity:0.8;">/ 20 pts</span></div>` : ''}
        </div>

        ${rubricPills ? `<div class="rubric-pill-grid" style="margin-top:14px;">${rubricPills}</div>` : ''}

        ${aiFeedbackObj ? `
          <div style="background:rgba(255,255,255,0.06);border-left:4px solid #38bdf8;padding:14px 18px;border-radius:8px;margin-top:14px;">
            <div style="font-weight:800;color:#38bdf8;font-size:14px;margin-bottom:4px;"><i class="fa-solid fa-robot"></i> Gemini Flash AI Evaluation Breakdown</div>
            <p style="margin:0;font-size:13.5px;line-height:1.5;">${aiFeedbackObj.overallFeedback || ''}</p>
            ${aiFeedbackObj.strengths?.length ? `<div style="font-size:12.5px;color:#86efac;margin-top:6px;"><b>Strengths:</b> ${aiFeedbackObj.strengths.join('; ')}</div>` : ''}
            ${aiFeedbackObj.areasForImprovement?.length ? `<div style="font-size:12.5px;color:#fca5a5;margin-top:4px;"><b>Areas for Improvement:</b> ${aiFeedbackObj.areasForImprovement.join('; ')}</div>` : ''}
          </div>
        ` : ''}

        ${sub.teacher_feedback ? `
          <div style="background:rgba(255,255,255,0.06);border-left:4px solid #10b981;padding:14px 18px;border-radius:8px;margin-top:10px;">
            <div style="font-weight:800;color:#34d399;font-size:14px;margin-bottom:4px;"><i class="fa-solid fa-chalkboard-user"></i> Instructor Feedback &amp; Remarks</div>
            <p style="margin:0;font-size:13.5px;line-height:1.5;">${sub.teacher_feedback}</p>
          </div>
        ` : ''}
      `;

      container.insertBefore(banner, container.firstChild);
    },

    /* ------------------------- Teacher Presentation Mode ----------------- */
    _wireTeacherPresentationMode() {
      const user = JSON.parse(localStorage.getItem('rad321_user') || 'null');
      const isTeacher = user && (user.role === 'teacher' || user.role === 'admin');
      const isParam = window.location.search.includes('mode=teacher');

      if (!isTeacher && !isParam) return;

      // Add topbar presentation banner
      const banner = document.createElement('div');
      banner.className = 'teacher-mode-banner';
      banner.innerHTML = `
        <div><i class="fa-solid fa-chalkboard-user"></i> <strong>Teacher Live Presentation Mode:</strong> Full instructor guide and answer key access enabled.</div>
        <button type="button" id="btn-open-teacher-drawer">📘 Toggle Instructor Key Drawer</button>
      `;
      document.body.insertBefore(banner, document.body.firstChild);

      // Create Teacher Drawer
      const drawerBackdrop = document.createElement('div');
      drawerBackdrop.className = 'teacher-drawer-backdrop';
      drawerBackdrop.id = 'teacher-drawer-modal';
      drawerBackdrop.style.display = 'none';

      drawerBackdrop.innerHTML = `
        <div class="teacher-drawer">
          <div class="flex justify-between items-center" style="margin-bottom:12px;">
            <h2 style="margin:0;"><i class="fa-solid fa-key"></i> Instructor Guide &amp; Solutions</h2>
            <button type="button" class="btn btn-ghost btn-sm" id="btn-close-teacher-drawer" style="font-size:18px;">✕</button>
          </div>
          <div class="key-section">
            <h4 style="margin:0 0 6px;color:var(--rad-blue-light);">Learning Objectives &amp; Physics</h4>
            <p style="margin:0;font-size:13px;">${(this.config.objectives || []).map((o, idx) => `<b>${idx+1}.</b> ${o}`).join('<br>') || 'Directly aligned with lecture topic.'}</p>
          </div>
          <div class="key-section">
            <h4 style="margin:0 0 6px;color:var(--rad-blue-light);">Expected Experimental Trends</h4>
            <p style="margin:0;font-size:13px;">1. Increasing SID reduces intensity by $(d_1/d_2)^2$ and reduces magnification $M = SID/SOD$.<br>2. Increasing mAs linearly scales photon quantity without changing penetration.<br>3. Patient thickness increases attenuation, demanding appropriate kVp compensation.</p>
          </div>
          <div class="key-section">
            <h4 style="margin:0 0 6px;color:var(--rad-blue-light);">Quick Handout Links</h4>
            <div class="flex gap-8" style="margin-top:8px;">
              <a href="../../handouts/${this.config.labId}-teacher.html" target="_blank" class="btn btn-primary btn-sm">Full Instructor Guide (PDF)</a>
              <a href="../../handouts/${this.config.labId}-student.html" target="_blank" class="btn btn-secondary btn-sm">Student Handout</a>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(drawerBackdrop);

      document.getElementById('btn-open-teacher-drawer')?.addEventListener('click', () => {
        drawerBackdrop.style.display = 'flex';
      });
      document.getElementById('btn-close-teacher-drawer')?.addEventListener('click', () => {
        drawerBackdrop.style.display = 'none';
      });
      drawerBackdrop.addEventListener('click', (e) => {
        if (e.target === drawerBackdrop) drawerBackdrop.style.display = 'none';
      });
    }
  };

  global.RadLab = RadLab;
})(window);
