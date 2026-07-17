/* ============================================
   EnzymEd Quiz App — Shared Engine
   Used by: courses.html, topics.html, quiz.html, results.html

   This file contains NO question content. All subject
   content lives in separate files inside /data/ —
   data-chemistry.js, data-physics.js, etc.

   Each HTML page loads all /data/*.js files FIRST,
   then this script.js file, so the CHEMISTRY_DATA,
   PHYSICS_DATA, etc. variables already exist by the
   time COURSE_DATA below is assembled.

   TO ADD A NEW SUBJECT FILE: create it in /data/,
   define it as `const YOURSUBJECT_DATA = {...}`
   (same shape as the others), then add one line to
   the COURSE_DATA assembly below, and one <script>
   tag to every HTML page.
   ============================================ */

const COURSE_DATA = {
  year1: {
    label: "Year 1",
    subjects: {
      mathematics: MATHEMATICS_DATA,
      chemistry: CHEMISTRY_DATA,
      physics: PHYSICS_DATA,
      biology: BIOLOGY_DATA
    }
  },
  year2: {
    label: "Year 2",
    subjects: {
      anatomy: ANATOMY_DATA,
      physiology: PHYSIOLOGY_DATA,
      biochemistry: BIOCHEMISTRY_DATA,
      microbiology: MICROBIOLOGY_DATA,
      biostatistics: BIOSTATISTICS_DATA
    }
  }
};

/* ---------- Helpers to navigate the data ---------- */

function getTopic(yearKey, subjectKey, groupKey, topicKey){
  const subject = COURSE_DATA[yearKey].subjects[subjectKey];
  if(subject.systems) return subject.systems[topicKey];
  return subject.semesters[groupKey].topics[topicKey];
}

function countQuestions(topic){
  return topic && topic.questions ? topic.questions.length : 0;
}

/* ============================================
   COURSES PAGE
   ============================================ */
function renderCoursesPage(){
  const container = document.getElementById('coursesList');
  if(!container) return;

  Object.keys(COURSE_DATA).forEach(yearKey => {
    const year = COURSE_DATA[yearKey];
    const heading = document.createElement('div');
    heading.className = 'year-heading';
    heading.textContent = year.label;
    container.appendChild(heading);

    Object.keys(year.subjects).forEach(subjectKey => {
      const subject = year.subjects[subjectKey];

      // total question count across the subject (for display)
      let total = 0;
      if(subject.systems){
        Object.values(subject.systems).forEach(t => total += countQuestions(t));
      } else {
        Object.values(subject.semesters).forEach(sem => {
          Object.values(sem.topics).forEach(t => total += countQuestions(t));
        });
      }

      const card = document.createElement('div');
      card.className = 'course-card' + (total > 0 ? ' active' : ' locked');
      card.innerHTML = `
        <div class="course-badge ${total > 0 ? 'badge-live' : 'badge-soon'}">${total > 0 ? 'Live' : 'Coming soon'}</div>
        <div class="course-icon">${subject.icon}</div>
        <div>
          <div class="course-name">${subject.name}</div>
          <div class="course-meta">${total > 0 ? total + ' questions available' : 'Not yet built'}</div>
        </div>
      `;
      if(total > 0){
        card.onclick = () => {
          window.location.href = `topics.html?year=${yearKey}&subject=${subjectKey}`;
        };
      }
      container.appendChild(card);
    });
  });
}

/* ============================================
   TOPICS PAGE (topic list within a subject)
   ============================================ */
function renderTopicsPage(){
  const container = document.getElementById('topicsList');
  if(!container) return;

  const params = new URLSearchParams(window.location.search);
  const yearKey = params.get('year');
  const subjectKey = params.get('subject');
  const subject = COURSE_DATA[yearKey].subjects[subjectKey];

  document.getElementById('topTitle').textContent = subject.name;

  if(subject.systems){
    Object.keys(subject.systems).forEach(sysKey => {
      const topic = subject.systems[sysKey];
      appendTopicCard(container, topic, yearKey, subjectKey, null, sysKey);
    });
  } else {
    Object.keys(subject.semesters).forEach(semKey => {
      const sem = subject.semesters[semKey];
      const topics = sem.topics || {};
      if(Object.keys(topics).length === 0) return;
      const semHeading = document.createElement('div');
      semHeading.className = 'year-heading';
      semHeading.textContent = sem.label;
      container.appendChild(semHeading);
      Object.keys(topics).forEach(topicKey => {
        appendTopicCard(container, topics[topicKey], yearKey, subjectKey, semKey, topicKey);
      });
    });
  }
}

function appendTopicCard(container, topic, yearKey, subjectKey, semKey, topicKey){
  const hasQuestions = countQuestions(topic) > 0;
  const card = document.createElement('div');
  card.className = 'topic-card' + (hasQuestions ? '' : ' locked');
  card.innerHTML = `
    <div class="topic-name">${topic.name}</div>
    <div class="topic-meta">${hasQuestions ? countQuestions(topic) + ' questions' : 'Coming soon'}</div>
  `;
  if(hasQuestions){
    card.onclick = () => {
      const url = `quiz.html?year=${yearKey}&subject=${subjectKey}&group=${semKey || ''}&topic=${topicKey}`;
      window.location.href = url;
    };
  }
  container.appendChild(card);
}

/* ============================================
   QUIZ PAGE
   ============================================ */

// Shuffle pool targets, per our earlier agreement:
// Standard subjects: pull 70 from a pool of up to 200.
// Anatomy (organized by body system): pull 50 from a pool of up to 100.
const SHUFFLE_COUNT_STANDARD = 70;
const SHUFFLE_COUNT_ANATOMY = 50;

// Fisher-Yates shuffle — returns a new shuffled array, doesn't mutate the original.
function shuffleArray(array){
  const arr = array.slice();
  for(let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Exam mode countdown durations, matched to realistic exam pacing
// (~51-54 seconds per question).
const EXAM_DURATION_STANDARD = 60 * 60; // 60 minutes for a 70-question set
const EXAM_DURATION_ANATOMY = 45 * 60;  // 45 minutes for a 50-question set

let quizState = {
  mode: 'quiz', // 'quiz' or 'exam'
  questions: [],
  currentQ: 0,
  score: 0,
  secondsElapsed: 0,
  secondsRemaining: 0,
  timerInterval: null
};

function initQuizPage(){
  const overviewScreen = document.getElementById('overviewScreen');
  if(!overviewScreen) return; // not on quiz.html

  const params = new URLSearchParams(window.location.search);
  const yearKey = params.get('year');
  const subjectKey = params.get('subject');
  const groupKey = params.get('group');
  const topicKey = params.get('topic');

  const topic = getTopic(yearKey, subjectKey, groupKey, topicKey);
  const subject = COURSE_DATA[yearKey].subjects[subjectKey];

  // Pick the target subset size: Anatomy uses 50 (from a 100-question system pool),
  // everything else uses 70 (from a 200-question subject pool). If the pool is
  // smaller than the target (still building content), just use everything available.
  const targetCount = subject.systems ? SHUFFLE_COUNT_ANATOMY : SHUFFLE_COUNT_STANDARD;
  const pool = topic.questions;
  const shuffled = shuffleArray(pool);
  quizState.questions = shuffled.slice(0, Math.min(targetCount, pool.length));
  quizState.subjectName = subject.name;
  quizState.topicName = topic.name;
  quizState.currentQ = 0;
  quizState.score = 0;
  quizState.secondsElapsed = 0;
  quizState.examDuration = subject.systems ? EXAM_DURATION_ANATOMY : EXAM_DURATION_STANDARD;

  // stash context so results.html can show "retry" / "back to subject"
  sessionStorage.setItem('lastQuizUrl', window.location.href);
  sessionStorage.setItem('lastTopicsUrl', `topics.html?year=${yearKey}&subject=${subjectKey}`);

  document.getElementById('quizCourseTag').textContent = `${subject.name} · ${topic.name}`;

  const examMins = Math.round(quizState.examDuration / 60);
  const examDescEl = document.getElementById('examModeDesc');
  if(examDescEl){
    examDescEl.textContent = `Answers hidden until you submit. ${examMins}-minute countdown, with auto-submit at zero.`;
  }

  // Overview is now its own screen — the quiz only begins once the person
  // picks a mode and taps through, so it never sits alongside the questions.
  document.getElementById('ovTitle').textContent = topic.name;
  if(topic.overview){
    document.getElementById('ovText').textContent = topic.overview;
    document.getElementById('ovText').style.display = 'block';
  } else {
    document.getElementById('ovText').style.display = 'none';
  }

  const quizBtn = document.getElementById('modeQuizBtn');
  const examBtn = document.getElementById('modeExamBtn');
  if(quizBtn) quizBtn.onclick = () => beginQuiz('quiz');
  if(examBtn) examBtn.onclick = () => beginQuiz('exam');
}

function beginQuiz(mode){
  quizState.mode = mode || 'quiz';
  document.getElementById('overviewScreen').style.display = 'none';
  const qScreen = document.getElementById('questionScreen');
  qScreen.style.display = 'flex';
  qScreen.style.flexDirection = 'column';

  // Precompute each question's shuffled option order ONCE, up front — not on
  // every render. This matters now that exam mode allows navigating back to
  // a previous question: if we re-shuffled on every render, the option
  // order (and therefore the position of your earlier answer) would change
  // every time you revisited a question, which would be confusing and buggy.
  quizState.shuffles = quizState.questions.map(q => {
    const optionIndices = q.options.map((_, idx) => idx);
    const shuffledIndices = shuffleArray(optionIndices);
    return {
      options: shuffledIndices.map(idx => q.options[idx]),
      correctPosition: shuffledIndices.indexOf(q.correct)
    };
  });
  quizState.userAnswers = new Array(quizState.questions.length).fill(null);

  const isExam = quizState.mode === 'exam';
  document.getElementById('quizModeFooter').style.display = isExam ? 'none' : 'flex';
  document.getElementById('examModeFooter').style.display = isExam ? 'flex' : 'none';
  document.getElementById('questionNav').style.display = isExam ? 'flex' : 'none';

  if(isExam){
    quizState.secondsRemaining = quizState.examDuration;
    startCountdownTimer();
  } else {
    startTimer();
  }
  renderQuestion();
}

function startTimer(){
  if(quizState.timerInterval) clearInterval(quizState.timerInterval);
  quizState.timerInterval = setInterval(() => {
    quizState.secondsElapsed++;
    document.getElementById('timerDisplay').textContent = '⏱ ' + formatTime(quizState.secondsElapsed);
  }, 1000);
}

function startCountdownTimer(){
  if(quizState.timerInterval) clearInterval(quizState.timerInterval);
  document.getElementById('timerDisplay').textContent = '⏳ ' + formatTime(quizState.secondsRemaining);
  quizState.timerInterval = setInterval(() => {
    quizState.secondsRemaining--;
    quizState.secondsElapsed++; // still track elapsed time for the results screen
    if(quizState.secondsRemaining <= 0){
      document.getElementById('timerDisplay').textContent = '⏳ 00:00';
      submitExam(); // time's up — auto-submit whatever's been answered
      return;
    }
    document.getElementById('timerDisplay').textContent = '⏳ ' + formatTime(quizState.secondsRemaining);
  }, 1000);
}

function stopTimer(){
  if(quizState.timerInterval) clearInterval(quizState.timerInterval);
}
function formatTime(s){
  const m = Math.floor(s/60).toString().padStart(2,'0');
  const sec = (s%60).toString().padStart(2,'0');
  return m + ':' + sec;
}

function renderQuestion(){
  const q = quizState.questions[quizState.currentQ];
  const shuffle = quizState.shuffles[quizState.currentQ];
  const existingAnswer = quizState.userAnswers[quizState.currentQ];

  document.getElementById('formatTag').textContent = q.format;
  document.getElementById('questionStem').textContent = q.stem;
  document.getElementById('progressLabel').textContent = `QUESTION ${quizState.currentQ+1} / ${quizState.questions.length}`;
  document.getElementById('progressFill').style.width = ((quizState.currentQ)/quizState.questions.length*100) + '%';
  document.getElementById('explainBox').style.display = 'none';

  const list = document.getElementById('optionsList');
  list.innerHTML = '';
  const letters = ['A','B','C','D','E'];
  shuffle.options.forEach((opt, i) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.innerHTML = `<div class="opt-letter">${letters[i]}</div>${opt}`;
    div.onclick = () => selectOption(i);
    list.appendChild(div);
  });

  if(quizState.mode === 'exam'){
    // Restore prior selection if revisiting an already-answered question.
    const opts = document.querySelectorAll('#optionsList .option');
    if(existingAnswer !== null){
      opts.forEach((el, idx) => {
        if(idx === existingAnswer) el.classList.add('selected');
      });
    }
    document.getElementById('examPrevBtn').disabled = quizState.currentQ === 0;
    renderQuestionNav();
  } else {
    const nextBtn = document.getElementById('nextBtn');
    nextBtn.disabled = true;
    nextBtn.textContent = 'Select an answer';
    nextBtn.dataset.answered = "false";
  }
}

function selectOption(i){
  const q = quizState.questions[quizState.currentQ];
  const shuffle = quizState.shuffles[quizState.currentQ];

  if(quizState.mode === 'exam'){
    // Exam mode: no reveal, no lock — you can change your answer freely
    // until you move on or submit, same as a real exam.
    quizState.userAnswers[quizState.currentQ] = i;
    const opts = document.querySelectorAll('#optionsList .option');
    opts.forEach((el, idx) => {
      el.classList.remove('selected');
      if(idx === i) el.classList.add('selected');
    });
    renderQuestionNav();
    return;
  }

  // Quiz mode: instant correct/incorrect + explanation, locked after selection.
  const nextBtn = document.getElementById('nextBtn');
  if(nextBtn.dataset.answered === "true") return;
  nextBtn.dataset.answered = "true";

  const correctPosition = shuffle.correctPosition;
  const opts = document.querySelectorAll('#optionsList .option');
  opts.forEach((el, idx) => {
    el.classList.add('disabled');
    if(idx === correctPosition) el.classList.add('correct');
    else if(idx === i) el.classList.add('incorrect');
  });
  document.getElementById('explainText').textContent = q.explain;
  document.getElementById('explainBox').style.display = 'block';

  if(i === q.correct) quizState.score++;

  nextBtn.disabled = false;
  nextBtn.textContent = quizState.currentQ === quizState.questions.length - 1 ? 'See results' : 'Next question';
}

/* ---------- Exam mode navigation (skip, go back, jump to any question) ---------- */
function examNextQuestion(){
  if(quizState.currentQ < quizState.questions.length - 1){
    quizState.currentQ++;
    renderQuestion();
  }
}
function examPrevQuestion(){
  if(quizState.currentQ > 0){
    quizState.currentQ--;
    renderQuestion();
  }
}
function goToQuestion(index){
  quizState.currentQ = index;
  renderQuestion();
}

function renderQuestionNav(){
  const nav = document.getElementById('questionNav');
  if(!nav) return;
  nav.innerHTML = '';
  quizState.questions.forEach((q, idx) => {
    const dot = document.createElement('div');
    let cls = 'nav-dot';
    if(idx === quizState.currentQ) cls += ' nav-dot-current';
    else if(quizState.userAnswers[idx] !== null) cls += ' nav-dot-answered';
    dot.className = cls;
    dot.textContent = idx + 1;
    dot.onclick = () => goToQuestion(idx);
    nav.appendChild(dot);
  });
}

function confirmSubmitExam(){
  const unanswered = quizState.userAnswers.filter(a => a === null).length;
  const msg = unanswered > 0
    ? `You have ${unanswered} unanswered question${unanswered === 1 ? '' : 's'}. Submit anyway?`
    : 'Submit your exam now?';
  if(window.confirm(msg)){
    submitExam();
  }
}

function submitExam(){
  // Score is computed fresh here from userAnswers, since exam mode allows
  // changing an answer any number of times before submitting — unlike quiz
  // mode, which locks in the score the instant you select an option.
  let score = 0;
  quizState.questions.forEach((q, idx) => {
    const shuffle = quizState.shuffles[idx];
    if(quizState.userAnswers[idx] === shuffle.correctPosition) score++;
  });
  quizState.score = score;
  finishQuiz();
}

function nextQuestion(){
  quizState.currentQ++;
  if(quizState.currentQ >= quizState.questions.length){
    finishQuiz();
  } else {
    renderQuestion();
  }
}

function finishQuiz(){
  stopTimer();
  sessionStorage.setItem('quizResult', JSON.stringify({
    score: quizState.score,
    total: quizState.questions.length,
    seconds: quizState.secondsElapsed
  }));

  // Also save this attempt permanently, so it shows up on the past-results page.
  // localStorage persists across visits (unlike sessionStorage, which clears
  // when the browser tab closes) — this is a real deployed website, not an
  // in-chat sandbox, so localStorage works normally here.
  try {
    const history = JSON.parse(localStorage.getItem('enzymed_quiz_history') || '[]');
    history.unshift({
      subject: quizState.subjectName,
      topic: quizState.topicName,
      score: quizState.score,
      total: quizState.questions.length,
      date: new Date().toISOString()
    });
    // Keep the most recent 100 attempts, so this doesn't grow unbounded forever.
    localStorage.setItem('enzymed_quiz_history', JSON.stringify(history.slice(0, 100)));
  } catch(e) {
    console.error('Could not save quiz history:', e);
  }

  window.location.href = 'results.html';
}

/* ============================================
   RESULTS PAGE
   ============================================ */
function renderResultsPage(){
  const scoreEl = document.getElementById('scoreNum');
  if(!scoreEl) return;

  const raw = sessionStorage.getItem('quizResult');
  if(!raw){
    document.getElementById('resultsTitle').textContent = "No recent quiz found";
    document.getElementById('resultsSub').textContent = "Start a quiz from the home page first.";
    return;
  }
  const result = JSON.parse(raw);
  const pct = Math.round((result.score/result.total)*360);

  document.getElementById('scoreRing').style.background =
    `conic-gradient(var(--teal) 0deg ${pct}deg, var(--line) ${pct}deg 360deg)`;
  document.getElementById('scoreNum').textContent = result.score;
  document.getElementById('scoreDen').textContent = '/ ' + result.total;
  document.getElementById('bdCorrect').textContent = result.score;
  document.getElementById('bdIncorrect').textContent = (result.total - result.score);
  document.getElementById('bdTime').textContent = formatTime(result.seconds);

  const pctScore = result.score/result.total;
  let title, sub;
  if(pctScore >= 0.8){ title = "Sharp run 🔥"; sub = "You're close to mastering this topic."; }
  else if(pctScore >= 0.5){ title = "Solid effort 🧪"; sub = "A bit more practice and this'll click."; }
  else { title = "Good starting point"; sub = "Review the explanations, then try again."; }
  document.getElementById('resultsTitle').textContent = title;
  document.getElementById('resultsSub').textContent = sub;

  const retryBtn = document.getElementById('retryBtn');
  const homeBtn = document.getElementById('homeBtn');
  if(retryBtn) retryBtn.onclick = () => window.location.href = sessionStorage.getItem('lastQuizUrl');
  if(homeBtn) homeBtn.onclick = () => window.location.href = 'index.html';
}

/* ============================================
   HOME PAGE — description popup
   ============================================ */
function initHomePage(){
  const popup = document.getElementById('descPopup');
  if(!popup) return; // not on index.html

  const continueBtn = document.getElementById('popupContinueBtn');
  if(!continueBtn){
    console.error('EnzymEd: popupContinueBtn not found on page');
  } else {
    continueBtn.addEventListener('click', function(){
      popup.classList.add('popup-hidden');
      setTimeout(() => { popup.style.display = 'none'; }, 260);
    });
  }

  // Compute real, current numbers from COURSE_DATA — never hardcoded,
  // so the homepage never overstates what's actually built.
  let totalQuestions = 0;
  let liveSubjects = 0;
  Object.values(COURSE_DATA).forEach(year => {
    Object.values(year.subjects).forEach(subject => {
      let subjectTotal = 0;
      if(subject.systems){
        Object.values(subject.systems).forEach(t => subjectTotal += countQuestions(t));
      } else {
        Object.values(subject.semesters).forEach(sem => {
          Object.values(sem.topics || {}).forEach(t => subjectTotal += countQuestions(t));
        });
      }
      totalQuestions += subjectTotal;
      if(subjectTotal > 0) liveSubjects++;
    });
  });

  animateCount('statQuestions', totalQuestions);
  animateCount('statSubjects', liveSubjects);
}

// Simple count-up animation for the homepage stat chips.
function animateCount(elementId, target){
  const el = document.getElementById(elementId);
  if(!el) return;
  const duration = 900;
  const start = performance.now();
  function tick(now){
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
    el.textContent = Math.round(eased * target);
    if(progress < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ============================================
   PAST RESULTS PAGE
   ============================================ */
function renderHistoryPage(){
  const list = document.getElementById('historyList');
  if(!list) return; // not on history.html

  let history = [];
  try {
    history = JSON.parse(localStorage.getItem('enzymed_quiz_history') || '[]');
  } catch(e) {
    console.error('Could not read quiz history:', e);
  }

  if(history.length === 0){
    list.innerHTML = '<div class="topic-overview" style="margin-top:0;">No quiz attempts yet — once you finish a quiz, it\'ll show up here.</div>';
    return;
  }

  history.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'course-card';
    const dateObj = new Date(entry.date);
    const dateStr = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    const pct = Math.round((entry.score / entry.total) * 100);
    card.innerHTML = `
      <div class="course-icon">🧪</div>
      <div>
        <div class="course-name">${entry.subject} · ${entry.topic}</div>
        <div class="course-meta">${entry.score} / ${entry.total} (${pct}%) · ${dateStr}</div>
      </div>
    `;
    list.appendChild(card);
  });
}

/* ---------- Auto-run the right renderer per page ---------- */
document.addEventListener('DOMContentLoaded', () => {
  initHomePage();
  renderCoursesPage();
  renderTopicsPage();
  initQuizPage();
  renderResultsPage();
  renderHistoryPage();
});
