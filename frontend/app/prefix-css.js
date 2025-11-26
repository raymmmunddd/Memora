// app/prefix-css.js
const fs = require('fs');
const postcss = require('postcss');
const prefixer = require('postcss-prefix-selector');

// List of CSS files and their corresponding namespaces
const files = [
  { input: 'app/page.css', namespace: '.landing-page' },
  { input: 'app/auth/auth.css', namespace: '.auth-page' },
  { input: 'app/chat/ai-tutor.css', namespace: '.tutor-page' },
  { input: 'app/dashboard/dashboard.css', namespace: '.dashboard-page' },
  { input: 'app/history/history.css', namespace: '.history-page' },
  { input: 'app/profile/profile.css', namespace: '.profile-page' },
  { input: 'app/progress/progress.css', namespace: '.progress-page' },
  { input: 'app/quiz/quiz.css', namespace: '.quiz-page' },
  { input: 'app/quiz/[quizId]/take-quiz.css', namespace: '.take-quiz-page' },
  { input: 'app/quiz/[quizId]/results/results.css', namespace: '.results-page' },
];

async function namespaceCSS(file) {
  try {
    const css = fs.readFileSync(file.input, 'utf8');

    const result = await postcss([
      prefixer({
        prefix: file.namespace,
        transform(prefix, selector, prefixedSelector) {
          // Don't prefix keyframes, @media, or :root
          if (
            selector.startsWith('@') ||
            selector === ':root'
          ) return selector;
          return prefixedSelector;
        },
      }),
    ]).process(css, { from: file.input, to: file.input.replace('.css', '-namespaced.css') });

    fs.writeFileSync(file.input.replace('.css', '-namespaced.css'), result.css);
    console.log(`✅ Namespaced ${file.input} → ${file.input.replace('.css', '-namespaced.css')}`);
  } catch (err) {
    console.error(`❌ Error processing ${file.input}`, err);
  }
}

(async () => {
  for (const file of files) {
    await namespaceCSS(file);
  }
})();
