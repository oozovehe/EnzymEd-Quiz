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

let quizState = {
  questions: [],
  currentQ: 0,
  score: 0,
  secondsElapsed: 0,
  timerInterval: null
};

function initQuizPage(){
  const stemEl = document.getElementById('questionStem');
  if(!stemEl) return;

  const params = new URLSearchParams(window.location.search);
  const yearKey = params.get('year');
  const subjectKey = params.get('subject');
  const groupKey = params.get('group');
  const topicKey = params.get('topic');

  const topic = getTopic(yearKey, subjectKey, groupKey, topicKey);
  const subject = COURSE_DATA[yearKey].subjects[subjectKey];

  document.getElementById('quizCourseTag').textContent = `${subject.name} · ${topic.name}`;
  const overviewEl = document.getElementById('topicOverview');
  if(topic.overview){
    overviewEl.textContent = topic.overview;
    overviewEl.dataset.hasOverview = "true";
  } else {
    overviewEl.dataset.hasOverview = "false";
  }

  // Pick the target subset size: Anatomy uses 50 (from a 100-question system pool),
  // everything else uses 70 (from a 200-question subject pool). If the pool is
  // smaller than the target (still building content), just use everything available.
  const targetCount = subject.systems ? SHUFFLE_COUNT_ANATOMY : SHUFFLE_COUNT_STANDARD;
  const pool = topic.questions;
  const shuffled = shuffleArray(pool);
  quizState.questions = shuffled.slice(0, Math.min(targetCount, pool.length));

  quizState.currentQ = 0;
  quizState.score = 0;
  quizState.secondsElapsed = 0;

  // stash context so results.html can show "retry" / "back to subject"
  sessionStorage.setItem('lastQuizUrl', window.location.href);
  sessionStorage.setItem('lastTopicsUrl', `topics.html?year=${yearKey}&subject=${subjectKey}`);

  startTimer();
  renderQuestion();
}

function startTimer(){
  if(quizState.timerInterval) clearInterval(quizState.timerInterval);
  quizState.timerInterval = setInterval(() => {
    quizState.secondsElapsed++;
    document.getElementById('timerDisplay').textContent = '⏱ ' + formatTime(quizState.secondsElapsed);
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

  document.getElementById('formatTag').textContent = q.format;
  document.getElementById('questionStem').textContent = q.stem;
  document.getElementById('progressLabel').textContent = `QUESTION ${quizState.currentQ+1} / ${quizState.questions.length}`;
  document.getElementById('progressFill').style.width = ((quizState.currentQ)/quizState.questions.length*100) + '%';
  document.getElementById('explainBox').style.display = 'none';

  // Overview only shows on the very first question — after that it's dismissed
  // so it doesn't clutter or confuse mid-quiz.
  const overviewEl = document.getElementById('topicOverview');
  const showOverview = quizState.currentQ === 0 && overviewEl.dataset.hasOverview === "true";
  overviewEl.style.display = showOverview ? 'block' : 'none';


  // Shuffle option order on every render, so the correct answer's position
  // varies each time — this breaks any predictable pattern (e.g. "always B")
  // regardless of how the source data happens to be ordered.
  const optionIndices = q.options.map((_, idx) => idx);
  const shuffledIndices = shuffleArray(optionIndices);
  const shuffledOptions = shuffledIndices.map(idx => q.options[idx]);
  const shuffledCorrectPosition = shuffledIndices.indexOf(q.correct);
  quizState.currentCorrectPosition = shuffledCorrectPosition;

  const list = document.getElementById('optionsList');
  list.innerHTML = '';
  const letters = ['A','B','C','D','E'];
  shuffledOptions.forEach((opt, i) => {
    const div = document.createElement('div');
    div.className = 'option';
    div.innerHTML = `<div class="opt-letter">${letters[i]}</div>${opt}`;
    div.onclick = () => selectOption(i);
    list.appendChild(div);
  });

  const nextBtn = document.getElementById('nextBtn');
  nextBtn.disabled = true;
  nextBtn.textContent = 'Select an answer';
  nextBtn.dataset.answered = "false";
}

function selectOption(i){
  const nextBtn = document.getElementById('nextBtn');
  if(nextBtn.dataset.answered === "true") return;
  nextBtn.dataset.answered = "true";

  const q = quizState.questions[quizState.currentQ];
  const correctPosition = quizState.currentCorrectPosition;
  const opts = document.querySelectorAll('#optionsList .option');
  opts.forEach((el, idx) => {
    el.classList.add('disabled');
    if(idx === correctPosition) el.classList.add('correct');
    else if(idx === i) el.classList.add('incorrect');
  });

  if(i === q.correct) quizState.score++;

  document.getElementById('explainText').textContent = q.explain;
  document.getElementById('explainBox').style.display = 'block';

  nextBtn.disabled = false;
  nextBtn.textContent = quizState.currentQ === quizState.questions.length - 1 ? 'See results' : 'Next question';
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

/* ---------- Auto-run the right renderer per page ---------- */
document.addEventListener('DOMContentLoaded', () => {
  renderCoursesPage();
  renderTopicsPage();
  initQuizPage();
  renderResultsPage();
});
