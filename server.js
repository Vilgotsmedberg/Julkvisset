const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

const questions = JSON.parse(fs.readFileSync('questions.json', 'utf8'));
let currentQuestionIndex = 0;
let players = {};
let answers = {};
let questionStartTime = 0;

app.get('/', (req, res) => {
  res.render('index');
});

app.get('/host', (req, res) => {
  res.render('host');
});

app.get('/participant', (req, res) => {
  res.render('participant');
});

io.on('connection', (socket) => {
  console.log('A user connected');

  socket.on('disconnect', () => {
    console.log('A user disconnected');
    delete players[socket.id];
    io.emit('updatePlayers', players);
  });

  socket.on('joinQuiz', (name) => {
    players[socket.id] = { name, score: 0 };
    io.emit('updatePlayers', players);
  });

  socket.on('startQuiz', () => {
    currentQuestionIndex = 0;
    startCountdown();
  });

  socket.on('answer', (data) => {
    const answerTime = Date.now();
    const timeTaken = answerTime - questionStartTime;
    answers[socket.id] = { ...data, timeTaken };
    if (Object.keys(answers).length === Object.keys(players).length) {
      evaluateAnswers();
    }
  });

  socket.on('nextQuestion', () => {
    if (currentQuestionIndex < questions.length) {
      startCountdown();
    } else {
      io.emit('showResults', getTopPlayers());
    }
  });

  socket.on('resetQuiz', () => {
    currentQuestionIndex = 0;
    players = {};
    answers = {};
    io.emit('updatePlayers', players);
  });

  function startCountdown() {
    let countdown = 3;
    const countdownInterval = setInterval(() => {
      io.emit('countdown', countdown);
      countdown--;
      if (countdown < 0) {
        clearInterval(countdownInterval);
        questionStartTime = Date.now();
        io.emit('question', questions[currentQuestionIndex]);
        currentQuestionIndex++;
        answers = {};
      }
    }, 1000);
  }

  function evaluateAnswers() {
    const correctAnswer = questions[currentQuestionIndex - 1].correctAnswer;
    const colorToOptionIndex = {
      red: 0,
      blue: 1,
      green: 2,
      yellow: 3
    };
    for (const [id, answer] of Object.entries(answers)) {
      const selectedOptionIndex = colorToOptionIndex[answer.color];
      const selectedAnswer = questions[currentQuestionIndex - 1].options[selectedOptionIndex];
      if (selectedAnswer === correctAnswer) {
        const maxPoints = 1000;
        const minPoints = 1;
        const maxTime = 10000; // 10 seconds
        const points = Math.max(minPoints, maxPoints - Math.floor((answer.timeTaken / maxTime) * (maxPoints - minPoints)));
        players[id].score += points;
        io.to(id).emit('answerResult', { correct: true, points });
      } else {
        io.to(id).emit('answerResult', { correct: false });
      }
    }
    io.emit('updateScores', players);
  }

  function getTopPlayers() {
    return Object.values(players).sort((a, b) => b.score - a.score).slice(0, 3);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});